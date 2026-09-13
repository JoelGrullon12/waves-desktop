mod commands;
mod models;

fn load_env_file(path: &std::path::Path) -> bool {
    if path.is_file() {
        dotenvy::from_path(path)
            .inspect(|_| eprintln!("[waves-desktop] Loaded environment from {}", path.display()))
            .map_err(|e| eprintln!("[waves-desktop] Failed to load {}: {}", path.display(), e))
            .is_ok()
    } else {
        false
    }
}

// Forwards frontend diagnostics to the app process stdout/stderr so they show
// up in the `cargo tauri dev` terminal. WebKitGTK does not pipe webview console
// output to the terminal, and a music player has no permanent log UI.
#[tauri::command]
fn cmd_log(level: String, message: String) {
    match level.as_str() {
        "error" => eprintln!("[waves-web] {}", message),
        _ => println!("[waves-web] {}", message),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let env_candidates = [
        // Absolute path to this crate's directory at compile time, so the .env is
        // found regardless of the process current working directory (tauri dev
        // chdirs into src-tauri before spawning the app binary).
        std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.env")),
        // Fallbacks when the binary is launched directly (cargo run, target/debug/...).
        std::path::Path::new(".env"),
        std::path::Path::new("src-tauri/.env"),
    ];

    if !env_candidates.iter().any(|path| load_env_file(path)) {
        eprintln!(
            "[waves-desktop] warning: no .env file found; TIDAL credentials won't be loaded."
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_keyring_store::init())
        .invoke_handler(tauri::generate_handler![
            cmd_log,
            commands::auth::cmd_login,
            commands::auth::cmd_get_access_token,
            commands::auth::cmd_get_session_credentials,
            commands::auth::cmd_is_authenticated,
            commands::auth::cmd_logout,
            commands::catalog::cmd_search_tracks,
            commands::catalog::cmd_get_album_tracks,
            commands::catalog::cmd_get_playlist_tracks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
