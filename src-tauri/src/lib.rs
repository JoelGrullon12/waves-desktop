mod commands;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::from_path("src-tauri/.env").ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_keyring_store::init())
        .invoke_handler(tauri::generate_handler![
            commands::auth::cmd_login,
            commands::auth::cmd_get_access_token,
            commands::auth::cmd_is_authenticated,
            commands::auth::cmd_logout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
