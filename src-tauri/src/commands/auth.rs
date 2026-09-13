use crate::models::tidal_auth::{AuthState, PkcePair, TidalTokenResponse};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_keyring_store::KeyringExt;
use tauri_plugin_opener::OpenerExt;

// Where the TIDAL token bundle is stored in the OS keyring (the service name
// is the app bundle identifier, configured by the keyring-store plugin).
const TOKEN_ACCOUNT: &str = "tidal.auth";

// TIDAL requires the redirect URI to match exactly what is registered for the
// client in the developer dashboard. A fixed loopback port and path keep the
// value deterministic: register `http://127.0.0.1:8899/tidal-callback` there.
// TIDAL still permits loopback registration with a specific port in most cases;
// see AGENTS.md for the fallback flows if the portal rejects it.
const TIDAL_OAUTH_PORT: u16 = 8899;
const TIDAL_OAUTH_REDIRECT_PATH: &str = "/tidal-callback";
// Scopes the client must have enabled in the dashboard. Kept to the minimum
// needed for Phase 1; `playback`/`search.read` are re-added when catalog and
// playback features land.
const TIDAL_OAUTH_SCOPES: &str =
    "user.read collection.read collection.write playlists.read playlists.write";
const TIDAL_OAUTH_TIMEOUT: Duration = Duration::from_secs(300);

fn redirect_uri() -> String {
    std::env::var("TIDAL_REDIRECT_URI").unwrap_or_else(|_| {
        format!(
            "http://127.0.0.1:{}{}",
            TIDAL_OAUTH_PORT, TIDAL_OAUTH_REDIRECT_PATH
        )
    })
}

fn generate_pkce_pair() -> PkcePair {
    let code_verifier: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(128)
        .map(char::from)
        .collect();

    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    let code_challenge = URL_SAFE_NO_PAD.encode(hash);

    PkcePair {
        code_verifier,
        code_challenge,
    }
}

fn load_env_var(key: &str) -> Result<String, String> {
    std::env::var(key).map_err(|_| format!("Missing env var: {}. Set it in src-tauri/.env", key))
}

fn build_authorize_url(
    client_id: &str,
    redirect_uri: &str,
    scope: &str,
    code_challenge: &str,
    state: &str,
) -> String {
    format!(
        "https://login.tidal.com/authorize?\
         response_type=code&\
         client_id={}&\
         redirect_uri={}&\
         code_challenge_method=S256&\
         code_challenge={}&\
         state={}&\
         scope={}",
        urlencoding(client_id),
        urlencoding(redirect_uri),
        code_challenge,
        state,
        scope.replace(' ', "%20"),
    )
}

fn urlencoding(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

fn legacy_token_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("tokens.json"))
}

fn remove_legacy_token_file(app: &AppHandle) -> Result<(), String> {
    let path = legacy_token_path(app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn store_token(
    app: &AppHandle,
    access_token: &str,
    refresh_token: &str,
    expires_in: u64,
    user_id: Option<u64>,
) -> Result<(), String> {
    let token_data = serde_json::json!({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() + expires_in,
        "user_id": user_id,
    });

    let content = serde_json::to_string(&token_data).map_err(|e| e.to_string())?;
    app.keyring()
        .store
        .set_password(TOKEN_ACCOUNT, &content)
        .map_err(|e| format!("Failed to store token in OS keyring: {}", e))?;

    // Token moved into the OS keyring; no plaintext copy should remain on disk.
    remove_legacy_token_file(app)?;

    Ok(())
}

async fn load_token(app: &AppHandle) -> Result<Option<serde_json::Value>, String> {
    if let Some(stored) = app
        .keyring()
        .store
        .get_password(TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to read token from OS keyring: {}", e))?
    {
        let data: serde_json::Value =
            serde_json::from_str(&stored).map_err(|e| format!("Invalid stored token: {}", e))?;
        return Ok(Some(data));
    }

    migrate_legacy_token_file(app).await
}

// One-time migration: earlier dev builds kept tokens.json in the app data dir.
// If a legacy file exists and no keyring entry does, move it into the keyring.
async fn migrate_legacy_token_file(app: &AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = legacy_token_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    app.keyring()
        .store
        .set_password(TOKEN_ACCOUNT, &content)
        .map_err(|e| format!("Failed to migrate token into OS keyring: {}", e))?;
    remove_legacy_token_file(app)?;

    Ok(Some(data))
}

async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TidalTokenResponse, String> {
    let params = [
        ("grant_type", "authorization_code"),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("code_verifier", code_verifier),
        ("redirect_uri", redirect_uri),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post("https://auth.tidal.com/v1/oauth2/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "unknown".to_string());
        return Err(format!("Token exchange failed ({}): {}", status, body));
    }

    response
        .json::<TidalTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))
}

async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<TidalTokenResponse, String> {
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post("https://auth.tidal.com/v1/oauth2/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "unknown".to_string());
        return Err(format!("Token refresh failed ({}): {}", status, body));
    }

    response
        .json::<TidalTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))
}

#[tauri::command]
pub async fn cmd_login(app: AppHandle) -> Result<AuthState, String> {
    let client_id = load_env_var("TIDAL_CLIENT_ID")?;
    let client_secret = load_env_var("TIDAL_CLIENT_SECRET")?;

    let pkce = generate_pkce_pair();
    let state_param: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let mut tx = Some(tx);

    let port = tauri_plugin_oauth::start_with_config(
        tauri_plugin_oauth::OauthConfig {
            ports: Some(vec![TIDAL_OAUTH_PORT]),
            response: Some(Cow::Borrowed(
                "<!DOCTYPE html><html><body>Login complete — return to Waves Desktop.</body></html>",
            )),
        },
        move |url| {
            if let Some(tx) = tx.take() {
                let _ = tx.send(url);
            }
        },
    )
    .map_err(|e| format!("Failed to start OAuth server: {}", e))?;

    let redirect_uri = redirect_uri();
    let authorize_url = build_authorize_url(
        &client_id,
        &redirect_uri,
        TIDAL_OAUTH_SCOPES,
        &pkce.code_challenge,
        &state_param,
    );

    app.opener()
        .open_url(&authorize_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    let callback_url = match tokio::time::timeout(TIDAL_OAUTH_TIMEOUT, rx).await {
        Ok(Ok(url)) => url,
        Ok(Err(_)) => {
            let _ = tauri_plugin_oauth::cancel(port);
            return Err("OAuth callback cancelled".to_string());
        }
        Err(_) => {
            let _ = tauri_plugin_oauth::cancel(port);
            return Err("Timed out waiting for the OAuth callback".to_string());
        }
    };

    let parsed_url =
        url::Url::parse(&callback_url).map_err(|e| format!("Invalid callback URL: {}", e))?;

    let received_state = parsed_url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.to_string());

    if let Some(ref received) = received_state {
        if received != &state_param {
            return Err("State mismatch — possible CSRF attack".to_string());
        }
    }

    let code = parsed_url
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| "No authorization code in callback".to_string())?;

    let token = exchange_code(
        &client_id,
        &client_secret,
        &code,
        &pkce.code_verifier,
        &redirect_uri,
    )
    .await?;

    let refresh = token.refresh_token.clone().unwrap_or_default();
    store_token(
        &app,
        &token.access_token,
        &refresh,
        token.expires_in,
        token.user_id,
    )
    .await?;

    Ok(AuthState {
        is_authenticated: true,
        user_id: token.user_id,
    })
}

#[tauri::command]
pub async fn cmd_get_access_token(app: AppHandle) -> Result<String, String> {
    let client_id = load_env_var("TIDAL_CLIENT_ID")?;
    let client_secret = load_env_var("TIDAL_CLIENT_SECRET")?;

    let token_data = load_token(&app).await?;
    let token_data =
        token_data.ok_or_else(|| "Not authenticated. Call cmd_login first.".to_string())?;

    let expires_at: u64 = token_data["expires_at"].as_u64().unwrap_or(0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    if now < expires_at {
        return Ok(token_data["access_token"]
            .as_str()
            .unwrap_or_default()
            .to_string());
    }

    let refresh_token = token_data["refresh_token"].as_str().unwrap_or_default();
    if refresh_token.is_empty() {
        return Err("No refresh token available. Re-authenticate.".to_string());
    }

    let new_token = refresh_access_token(&client_id, &client_secret, refresh_token).await?;
    let new_refresh = new_token.refresh_token.clone().unwrap_or_default();
    store_token(
        &app,
        &new_token.access_token,
        &new_refresh,
        new_token.expires_in,
        new_token.user_id,
    )
    .await?;

    Ok(new_token.access_token)
}

#[tauri::command]
pub async fn cmd_is_authenticated(app: AppHandle) -> Result<bool, String> {
    let token_data = load_token(&app).await?;
    Ok(token_data.is_some())
}

#[tauri::command]
pub async fn cmd_logout(app: AppHandle) -> Result<(), String> {
    app.keyring()
        .store
        .delete(TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to delete token from OS keyring: {}", e))?;
    remove_legacy_token_file(&app)?;
    Ok(())
}
