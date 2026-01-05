mod commands;
mod credentials;
mod error;
pub mod provider;
mod s3;

use credentials::CredentialsManager;
use s3::client::S3ClientManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(CredentialsManager::new())
        .manage(S3ClientManager::new())
        .invoke_handler(tauri::generate_handler![
            // Credentials commands
            commands::credentials::add_account,
            commands::credentials::list_accounts,
            commands::credentials::get_account,
            commands::credentials::remove_account,
            commands::credentials::update_account,
            commands::credentials::test_connection,
            // Bucket commands
            commands::buckets::list_buckets,
            commands::buckets::create_bucket,
            commands::buckets::delete_bucket,
            // Object commands
            commands::objects::list_objects,
            commands::objects::get_object_metadata,
            commands::objects::upload_object,
            commands::objects::delete_objects,
            commands::objects::create_folder,
            commands::objects::search_objects,
            commands::objects::download_object,
            commands::objects::generate_presigned_url,
            commands::objects::rename_object,
            commands::objects::copy_objects,
            commands::objects::copy_objects_across_buckets,
            commands::objects::download_folder,
            commands::objects::update_object_metadata,
            commands::objects::list_object_versions,
            commands::objects::restore_object_version,
            commands::objects::get_object_tagging,
            commands::objects::put_object_tagging,
            commands::objects::delete_object_tagging,
            // Preview commands
            commands::preview::get_preview,
            commands::preview::get_thumbnail,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
