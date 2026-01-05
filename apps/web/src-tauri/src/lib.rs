mod commands;
mod credentials;
mod db;
mod error;
pub mod provider;
mod s3;

use commands::duplicates::ScanState;
use credentials::CredentialsManager;
use db::DbManager;
use s3::client::S3ClientManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database
    let db_manager = DbManager::new().expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(CredentialsManager::new())
        .manage(S3ClientManager::new())
        .manage(db_manager)
        .manage(ScanState::default())
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
            commands::buckets::get_bucket_config,
            commands::buckets::get_bucket_versioning,
            commands::buckets::put_bucket_versioning,
            commands::buckets::get_bucket_cors,
            commands::buckets::put_bucket_cors,
            commands::buckets::delete_bucket_cors,
            commands::buckets::get_bucket_lifecycle,
            commands::buckets::put_bucket_lifecycle,
            commands::buckets::delete_bucket_lifecycle,
            commands::buckets::get_bucket_encryption,
            commands::buckets::get_bucket_logging,
            // Analytics commands
            commands::analytics::get_bucket_analytics,
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
            // History commands
            commands::history::get_operations,
            commands::history::get_operation,
            commands::history::get_operation_stats,
            commands::history::cleanup_history,
            commands::history::export_operations,
            commands::history::log_operation,
            commands::history::update_operation,
            // Duplicate detection commands
            commands::duplicates::start_duplicate_scan,
            commands::duplicates::cancel_duplicate_scan,
            commands::duplicates::get_scan,
            commands::duplicates::get_duplicate_groups,
            commands::duplicates::list_scans,
            commands::duplicates::delete_scan,
            commands::duplicates::delete_duplicates,
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
