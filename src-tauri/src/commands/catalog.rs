use crate::commands::auth;
use crate::models::catalog::{MultiResourceDocument, RelationshipDocument, Track};
use reqwest::header::{ACCEPT, AUTHORIZATION};
use tauri::AppHandle;

// Catalog proxy commands. All TIDAL API traffic runs through the Rust process
// so the access token never needs to be handled by the renderer except when it
// is handed to the TIDAL Web SDK player itself.
//
// The v2 API (JSON:API) is used because it authorizes with the modern scope
// names (`search.read`, `user.read`, ...) that dashboard-created clients are
// granted. The legacy v1 catalog API is NOT available to those clients: it
// checks the token's scope claim against legacy names (`r_usr`, ...) and
// rejects any modern token with HTTP 403 / subStatus 11004.
//
// Every endpoint needs exactly one round trip: related albums/artists come
// back in the compound `included` list when requested via `include=`.
const TIDAL_CATALOG_BASE: &str = "https://openapi.tidal.com/v2";
const DEFAULT_COUNTRY: &str = "US";
const JSON_API_MEDIA_TYPE: &str = "application/vnd.api+json";

async fn get_json(app: &AppHandle, url: &str) -> Result<serde_json::Value, String> {
    let token = auth::cmd_get_access_token(app.clone()).await?;
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .header(ACCEPT, JSON_API_MEDIA_TYPE)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("TIDAL catalog request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "unknown".to_string());
        return Err(format!("TIDAL catalog error ({}): {}", status, body));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse catalog response: {}", e))
}

#[tauri::command]
pub async fn cmd_search_tracks(app: AppHandle, query: String) -> Result<Vec<Track>, String> {
    let mut url = url::Url::parse(&format!("{}/searchResults", TIDAL_CATALOG_BASE))
        .map_err(|e| format!("Invalid catalog URL: {}", e))?;
    {
        let mut params = url.query_pairs_mut();
        params.append_pair("filter[query]", &query);
        params.append_pair("countryCode", DEFAULT_COUNTRY);
        params.append_pair("include", "tracks");
        params.append_pair("include", "tracks.albums");
        params.append_pair("include", "tracks.artists");
    }

    let json = get_json(&app, url.as_str()).await?;
    let document: MultiResourceDocument = serde_json::from_value(json)
        .map_err(|e| format!("Failed to parse search response: {}", e))?;
    let tracks = crate::models::catalog::tracks_from_search(&document);

    if tracks.is_empty() {
        return Err("No tracks found for the query.".to_string());
    }
    Ok(tracks)
}

#[tauri::command]
pub async fn cmd_get_album_tracks(app: AppHandle, album_id: String) -> Result<Vec<Track>, String> {
    let mut url = url::Url::parse(&format!(
        "{}/albums/{}/relationships/items",
        TIDAL_CATALOG_BASE, album_id
    ))
    .map_err(|e| format!("Invalid catalog URL: {}", e))?;
    {
        let mut params = url.query_pairs_mut();
        params.append_pair("countryCode", DEFAULT_COUNTRY);
        params.append_pair("include", "items.albums");
        params.append_pair("include", "items.artists");
    }

    let json = get_json(&app, url.as_str()).await?;
    let document: RelationshipDocument = serde_json::from_value(json)
        .map_err(|e| format!("Failed to parse album response: {}", e))?;
    let tracks = crate::models::catalog::tracks_from_items(&document);

    if tracks.is_empty() {
        return Err("Album has no streamable tracks.".to_string());
    }
    Ok(tracks)
}

#[tauri::command]
pub async fn cmd_get_playlist_tracks(
    app: AppHandle,
    playlist_id: String,
) -> Result<Vec<Track>, String> {
    let mut url = url::Url::parse(&format!(
        "{}/playlists/{}/relationships/items",
        TIDAL_CATALOG_BASE, playlist_id
    ))
    .map_err(|e| format!("Invalid catalog URL: {}", e))?;
    {
        let mut params = url.query_pairs_mut();
        params.append_pair("countryCode", DEFAULT_COUNTRY);
        params.append_pair("include", "items.albums");
        params.append_pair("include", "items.artists");
    }

    let json = get_json(&app, url.as_str()).await?;
    let document: RelationshipDocument = serde_json::from_value(json)
        .map_err(|e| format!("Failed to parse playlist response: {}", e))?;
    let tracks = crate::models::catalog::tracks_from_items(&document);

    if tracks.is_empty() {
        return Err("Playlist has no streamable tracks.".to_string());
    }
    Ok(tracks)
}
