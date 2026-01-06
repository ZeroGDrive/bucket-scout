use crate::credentials::CredentialsManager;
use crate::db::sync::{
    ChangeType, DetectedChange, NewSyncPair, SyncDirection, SyncPair, SyncPairStatus, SyncPreview,
    SyncSession,
};
use crate::db::DbManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;

/// Global state for tracking active syncs
pub struct SyncState {
    /// Map of pair_id -> cancellation flag
    pub active_syncs: RwLock<HashMap<i64, Arc<AtomicBool>>>,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            active_syncs: RwLock::new(HashMap::new()),
        }
    }
}

/// Progress event for sync
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressEvent {
    pub pair_id: i64,
    pub session_id: i64,
    pub phase: String,
    pub current_file: Option<String>,
    pub files_processed: i64,
    pub total_files: i64,
    pub bytes_transferred: i64,
}

/// Completion event for sync
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCompleteEvent {
    pub pair_id: i64,
    pub session_id: i64,
    pub files_uploaded: i64,
    pub files_downloaded: i64,
    pub files_deleted_local: i64,
    pub files_deleted_remote: i64,
}

/// Error event for sync
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncErrorEvent {
    pub pair_id: i64,
    pub session_id: Option<i64>,
    pub error: String,
}

// ==================== Sync Pair Management ====================

/// Create a new sync pair
#[tauri::command(rename_all = "camelCase")]
pub async fn create_sync_pair(
    db: State<'_, DbManager>,
    name: String,
    local_path: String,
    account_id: String,
    bucket: String,
    remote_prefix: String,
    sync_direction: String,
    delete_propagation: bool,
) -> Result<SyncPair, AppError> {
    // Validate local path exists
    let path = Path::new(&local_path);
    if !path.exists() {
        return Err(AppError::InvalidInput(format!(
            "Local path does not exist: {}",
            local_path
        )));
    }
    if !path.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "Local path is not a directory: {}",
            local_path
        )));
    }

    let direction = SyncDirection::try_from(sync_direction.as_str())?;

    let pair_id = db.create_sync_pair(&NewSyncPair {
        name,
        local_path,
        account_id,
        bucket,
        remote_prefix,
        sync_direction: direction,
        delete_propagation,
    })?;

    db.get_sync_pair(pair_id)?
        .ok_or_else(|| AppError::Storage("Failed to retrieve created sync pair".to_string()))
}

/// Get a sync pair by ID
#[tauri::command(rename_all = "camelCase")]
pub async fn get_sync_pair(
    db: State<'_, DbManager>,
    pair_id: i64,
) -> Result<Option<SyncPair>, AppError> {
    db.get_sync_pair(pair_id)
}

/// List all sync pairs for an account
#[tauri::command(rename_all = "camelCase")]
pub async fn list_sync_pairs(
    db: State<'_, DbManager>,
    account_id: String,
) -> Result<Vec<SyncPair>, AppError> {
    db.list_sync_pairs(&account_id)
}

/// Delete a sync pair
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_sync_pair(db: State<'_, DbManager>, pair_id: i64) -> Result<(), AppError> {
    db.delete_sync_pair(pair_id)
}

// ==================== Sync Operations ====================

/// Preview what a sync would do (dry-run)
#[tauri::command(rename_all = "camelCase")]
pub async fn preview_sync(
    app: AppHandle,
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    db: State<'_, DbManager>,
    pair_id: i64,
) -> Result<SyncPreview, AppError> {
    let pair = db
        .get_sync_pair(pair_id)?
        .ok_or_else(|| AppError::InvalidInput("Sync pair not found".to_string()))?;

    // Get S3 client
    let account = credentials.get_account(&pair.account_id)?;
    let secret = credentials.get_secret_key(&pair.account_id)?;
    let client = s3_clients
        .get_or_create_client(
            &pair.account_id,
            &account.endpoint,
            &account.access_key_id,
            &secret,
            account.provider_type,
            account.region.as_deref(),
        )
        .await?;

    // Scan current state
    let (local_current, remote_current) =
        scan_current_state(&app, &client, &db, &pair, pair_id).await?;

    // Get previous state from database
    let local_previous = db.get_local_file_states(pair_id)?;
    let remote_previous = db.get_remote_file_states(pair_id)?;

    // Build preview based on sync direction (one-way only)
    let mut preview = SyncPreview {
        to_upload: Vec::new(),
        to_download: Vec::new(),
        to_delete_local: Vec::new(),
        to_delete_remote: Vec::new(),
    };

    match pair.sync_direction {
        SyncDirection::UploadOnly => {
            // For upload-only: show what local files will be uploaded
            if local_previous.is_empty() {
                // First sync: all local files will be uploaded
                for (path, change) in &local_current {
                    preview.to_upload.push(DetectedChange {
                        relative_path: path.clone(),
                        change_type: ChangeType::New,
                        size: change.size,
                        mtime: change.mtime,
                        hash: change.hash.clone(),
                    });
                }
            } else {
                // Incremental: only changed local files
                let local_changes = detect_changes(&local_previous, &local_current);
                for (_path, change) in local_changes {
                    match change.change_type {
                        ChangeType::New | ChangeType::Modified => {
                            preview.to_upload.push(change);
                        }
                        ChangeType::Deleted if pair.delete_propagation => {
                            preview.to_delete_remote.push(change);
                        }
                        _ => {}
                    }
                }
            }
        }
        SyncDirection::DownloadOnly => {
            // For download-only: show what remote files will be downloaded
            if remote_previous.is_empty() {
                // First sync: all remote files will be downloaded
                for (path, change) in &remote_current {
                    preview.to_download.push(DetectedChange {
                        relative_path: path.clone(),
                        change_type: ChangeType::New,
                        size: change.size,
                        mtime: change.mtime,
                        hash: change.hash.clone(),
                    });
                }
            } else {
                // Incremental: only changed remote files
                let remote_changes = detect_changes(&remote_previous, &remote_current);
                for (_path, change) in remote_changes {
                    match change.change_type {
                        ChangeType::New | ChangeType::Modified => {
                            preview.to_download.push(change);
                        }
                        ChangeType::Deleted if pair.delete_propagation => {
                            preview.to_delete_local.push(change);
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(preview)
}

/// Start a sync operation
#[tauri::command(rename_all = "camelCase")]
pub async fn start_sync(
    app: AppHandle,
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    db: State<'_, DbManager>,
    sync_state: State<'_, SyncState>,
    pair_id: i64,
    is_resync: bool,
) -> Result<i64, AppError> {
    let pair = db
        .get_sync_pair(pair_id)?
        .ok_or_else(|| AppError::InvalidInput("Sync pair not found".to_string()))?;

    // Check if already syncing
    {
        let syncs = sync_state.active_syncs.read().await;
        if syncs.contains_key(&pair_id) {
            return Err(AppError::InvalidInput("Sync already in progress".to_string()));
        }
    }

    // Update status to syncing
    db.update_sync_pair_status(pair_id, SyncPairStatus::Syncing)?;

    // Create session
    let session_id = db.create_sync_session(pair_id)?;

    // Set up cancellation token
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut syncs = sync_state.active_syncs.write().await;
        syncs.insert(pair_id, cancel_flag.clone());
    }

    // If resync, clear previous state
    if is_resync {
        db.clear_tracked_files(pair_id)?;
    }

    // Get S3 client
    let account = credentials.get_account(&pair.account_id)?;
    let secret = credentials.get_secret_key(&pair.account_id)?;
    let client = s3_clients
        .get_or_create_client(
            &pair.account_id,
            &account.endpoint,
            &account.access_key_id,
            &secret,
            account.provider_type,
            account.region.as_deref(),
        )
        .await?;

    // Clone values for async task
    let db_clone = (*db).clone();
    let app_clone = app.clone();

    // Spawn async sync task
    tokio::spawn(async move {
        let result = run_sync(
            &app_clone,
            &client,
            &db_clone,
            &pair,
            session_id,
            is_resync,
            cancel_flag.clone(),
        )
        .await;

        // Clean up active syncs - get sync_state from app handle
        if let Some(sync_state) = app_clone.try_state::<SyncState>() {
            let mut syncs = sync_state.active_syncs.write().await;
            syncs.remove(&pair_id);
        }

        if let Err(e) = result {
            let _ = db_clone.fail_sync_session(session_id, &e.to_string());
            let _ = db_clone.mark_sync_failed(pair_id, &e.to_string());
            let _ = app_clone.emit(
                "sync-error",
                SyncErrorEvent {
                    pair_id,
                    session_id: Some(session_id),
                    error: e.to_string(),
                },
            );
        }
    });

    Ok(session_id)
}

/// Cancel a running sync
#[tauri::command(rename_all = "camelCase")]
pub async fn cancel_sync(
    sync_state: State<'_, SyncState>,
    db: State<'_, DbManager>,
    pair_id: i64,
) -> Result<(), AppError> {
    // Set cancel flag
    {
        let syncs = sync_state.active_syncs.read().await;
        if let Some(flag) = syncs.get(&pair_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    // Update status
    db.update_sync_pair_status(pair_id, SyncPairStatus::Idle)?;

    // Remove from active syncs
    {
        let mut syncs = sync_state.active_syncs.write().await;
        syncs.remove(&pair_id);
    }

    Ok(())
}

// ==================== Session History ====================

/// Get sync sessions for a pair
#[tauri::command(rename_all = "camelCase")]
pub async fn get_sync_sessions(
    db: State<'_, DbManager>,
    pair_id: i64,
    limit: Option<i64>,
) -> Result<Vec<SyncSession>, AppError> {
    db.get_sync_sessions(pair_id, limit.unwrap_or(20))
}

// ==================== Helper Functions ====================

/// Scan current local and remote state
async fn scan_current_state(
    app: &AppHandle,
    client: &aws_sdk_s3::Client,
    db: &DbManager,
    pair: &SyncPair,
    pair_id: i64,
) -> Result<(HashMap<String, DetectedChange>, HashMap<String, DetectedChange>), AppError> {
    // Scan local files
    let local_current = scan_local_files(&pair.local_path)?;

    // Scan remote files
    let remote_current = scan_remote_files(client, &pair.bucket, &pair.remote_prefix).await?;

    Ok((local_current, remote_current))
}

/// Scan local directory for files
fn scan_local_files(base_path: &str) -> Result<HashMap<String, DetectedChange>, AppError> {
    let mut files = HashMap::new();
    let base = Path::new(base_path);

    // Check if base path exists
    if !base.exists() {
        return Err(AppError::Storage(format!(
            "Local folder does not exist: {}",
            base_path
        )));
    }

    fn scan_dir(
        base: &Path,
        current: &Path,
        files: &mut HashMap<String, DetectedChange>,
    ) -> Result<(), AppError> {
        let entries = std::fs::read_dir(current)
            .map_err(|e| AppError::Storage(format!("Failed to read directory '{}': {}", current.display(), e)))?;

        for entry in entries {
            let entry =
                entry.map_err(|e| AppError::Storage(format!("Failed to read entry: {}", e)))?;
            let path = entry.path();

            if path.is_dir() {
                scan_dir(base, &path, files)?;
            } else if path.is_file() {
                let relative = path
                    .strip_prefix(base)
                    .map_err(|e| AppError::Storage(format!("Failed to get relative path: {}", e)))?
                    .to_string_lossy()
                    .to_string();

                let metadata = std::fs::metadata(&path)
                    .map_err(|e| AppError::Storage(format!("Failed to get metadata: {}", e)))?;

                let mtime = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64);

                files.insert(
                    relative.clone(),
                    DetectedChange {
                        relative_path: relative,
                        change_type: ChangeType::Unchanged, // Will be updated during comparison
                        size: Some(metadata.len() as i64),
                        mtime,
                        hash: None, // We don't compute hash during scan for performance
                    },
                );
            }
        }

        Ok(())
    }

    scan_dir(base, base, &mut files)?;
    Ok(files)
}

/// Scan remote S3 prefix for files
async fn scan_remote_files(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    prefix: &str,
) -> Result<HashMap<String, DetectedChange>, AppError> {
    let mut files = HashMap::new();
    let mut continuation_token: Option<String> = None;

    let prefix_len = if prefix.is_empty() { 0 } else { prefix.len() + 1 }; // +1 for trailing /

    loop {
        let mut request = client.list_objects_v2().bucket(bucket);

        if !prefix.is_empty() {
            request = request.prefix(format!("{}/", prefix));
        }

        if let Some(token) = &continuation_token {
            request = request.continuation_token(token);
        }

        let response = request.send().await?;

        for obj in response.contents() {
            if let Some(key) = obj.key() {
                // Skip folder markers
                if key.ends_with('/') {
                    continue;
                }

                // Get relative path (strip prefix and any leading slashes)
                let relative = if prefix_len > 0 && key.len() > prefix_len {
                    key[prefix_len..].trim_start_matches('/').to_string()
                } else {
                    key.trim_start_matches('/').to_string()
                };

                let mtime = obj
                    .last_modified()
                    .and_then(|d| d.secs().try_into().ok())
                    .map(|s: i64| s * 1000); // Convert to ms

                files.insert(
                    relative.clone(),
                    DetectedChange {
                        relative_path: relative,
                        change_type: ChangeType::Unchanged,
                        size: obj.size().map(|s| s),
                        mtime,
                        hash: obj.e_tag().map(|e| e.trim_matches('"').to_string()),
                    },
                );
            }
        }

        if response.is_truncated() == Some(true) {
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(files)
}

/// Detect changes between previous and current state
fn detect_changes(
    previous: &[crate::db::sync::TrackedFile],
    current: &HashMap<String, DetectedChange>,
) -> HashMap<String, DetectedChange> {
    let mut changes = HashMap::new();

    // Build lookup for previous state
    let prev_map: HashMap<&str, &crate::db::sync::TrackedFile> = previous
        .iter()
        .map(|f| (f.relative_path.as_str(), f))
        .collect();

    // Check for new/modified files
    for (path, curr) in current {
        let change_type = if let Some(prev) = prev_map.get(path.as_str()) {
            if prev.is_deleted {
                ChangeType::New // Was deleted, now exists again
            } else if prev.size != curr.size.unwrap_or(0)
                || prev.mtime_ms != curr.mtime
            {
                ChangeType::Modified
            } else {
                ChangeType::Unchanged
            }
        } else {
            ChangeType::New
        };

        if change_type != ChangeType::Unchanged {
            changes.insert(
                path.clone(),
                DetectedChange {
                    change_type,
                    ..curr.clone()
                },
            );
        }
    }

    // Check for deleted files
    for prev in previous {
        if !prev.is_deleted && !current.contains_key(&prev.relative_path) {
            changes.insert(
                prev.relative_path.clone(),
                DetectedChange {
                    relative_path: prev.relative_path.clone(),
                    change_type: ChangeType::Deleted,
                    size: Some(prev.size),
                    mtime: prev.mtime_ms,
                    hash: prev.content_hash.clone(),
                },
            );
        }
    }

    changes
}

/// Run the actual sync operation (one-way only)
async fn run_sync(
    app: &AppHandle,
    client: &aws_sdk_s3::Client,
    db: &DbManager,
    pair: &SyncPair,
    session_id: i64,
    is_resync: bool,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), AppError> {
    let pair_id = pair.id;

    // Emit progress
    let _ = app.emit(
        "sync-progress",
        SyncProgressEvent {
            pair_id,
            session_id,
            phase: "scanning".to_string(),
            current_file: None,
            files_processed: 0,
            total_files: 0,
            bytes_transferred: 0,
        },
    );

    // Scan current state
    let (local_current, remote_current) =
        scan_current_state(app, client, db, pair, pair_id).await?;

    if cancel_flag.load(Ordering::Relaxed) {
        return Ok(());
    }

    // Get previous state for change detection
    let local_previous = db.get_local_file_states(pair_id)?;
    let remote_previous = db.get_remote_file_states(pair_id)?;

    // Collect actions based on sync direction
    let mut to_upload: Vec<DetectedChange> = Vec::new();
    let mut to_download: Vec<DetectedChange> = Vec::new();
    let mut to_delete_local: Vec<DetectedChange> = Vec::new();
    let mut to_delete_remote: Vec<DetectedChange> = Vec::new();
    // Track deletions that we skip (source deleted but not propagating to destination)
    // We still need to mark these in the database so they're not re-detected
    let mut skipped_local_deletions: Vec<DetectedChange> = Vec::new();
    let mut skipped_remote_deletions: Vec<DetectedChange> = Vec::new();

    match pair.sync_direction {
        SyncDirection::UploadOnly => {
            // Upload: local is source of truth
            // New/modified local files -> upload
            // Deleted local files -> delete from remote (if enabled)
            // Remote-only files -> ignore

            if is_resync || local_previous.is_empty() {
                // First sync: upload all local files
                for (path, change) in &local_current {
                    to_upload.push(DetectedChange {
                        relative_path: path.clone(),
                        change_type: ChangeType::New,
                        size: change.size,
                        mtime: change.mtime,
                        hash: change.hash.clone(),
                    });
                }
            } else {
                // Incremental: detect local changes
                let local_changes = detect_changes(&local_previous, &local_current);

                for (_path, change) in local_changes {
                    match change.change_type {
                        ChangeType::New | ChangeType::Modified => {
                            to_upload.push(change);
                        }
                        ChangeType::Deleted => {
                            if pair.delete_propagation {
                                to_delete_remote.push(change);
                            } else {
                                // Track the deletion but don't propagate
                                skipped_local_deletions.push(change);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        SyncDirection::DownloadOnly => {
            // Download: remote is source of truth
            // New/modified remote files -> download
            // Deleted remote files -> delete locally (if enabled)
            // Local-only files -> ignore

            if is_resync || remote_previous.is_empty() {
                // First sync: download all remote files
                for (path, change) in &remote_current {
                    to_download.push(DetectedChange {
                        relative_path: path.clone(),
                        change_type: ChangeType::New,
                        size: change.size,
                        mtime: change.mtime,
                        hash: change.hash.clone(),
                    });
                }
            } else {
                // Incremental: detect remote changes
                let remote_changes = detect_changes(&remote_previous, &remote_current);

                for (_path, change) in remote_changes {
                    match change.change_type {
                        ChangeType::New | ChangeType::Modified => {
                            to_download.push(change);
                        }
                        ChangeType::Deleted => {
                            if pair.delete_propagation {
                                to_delete_local.push(change);
                            } else {
                                // Track the deletion but don't propagate
                                skipped_remote_deletions.push(change);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if cancel_flag.load(Ordering::Relaxed) {
        return Ok(());
    }

    // Ensure base local directory exists for download operations
    if !to_download.is_empty() {
        tokio::fs::create_dir_all(&pair.local_path)
            .await
            .map_err(|e| {
                AppError::Storage(format!(
                    "Failed to create local directory '{}': {}",
                    pair.local_path, e
                ))
            })?;
    }

    // Execute sync operations
    let total_ops =
        to_upload.len() + to_download.len() + to_delete_local.len() + to_delete_remote.len();
    let mut processed = 0i64;
    let mut bytes_transferred = 0i64;
    let mut files_uploaded = 0i64;
    let mut files_downloaded = 0i64;
    let mut files_deleted_local = 0i64;
    let mut files_deleted_remote = 0i64;

    // Upload files
    for change in &to_upload {
        if cancel_flag.load(Ordering::Relaxed) {
            return Ok(());
        }

        let _ = app.emit(
            "sync-progress",
            SyncProgressEvent {
                pair_id,
                session_id,
                phase: "uploading".to_string(),
                current_file: Some(change.relative_path.clone()),
                files_processed: processed,
                total_files: total_ops as i64,
                bytes_transferred,
            },
        );

        // Strip leading slash from relative path to prevent it from becoming an absolute path
        let relative = change.relative_path.trim_start_matches('/');
        let local_path = Path::new(&pair.local_path).join(relative);
        let remote_key = if pair.remote_prefix.is_empty() {
            relative.to_string()
        } else {
            format!("{}/{}", pair.remote_prefix, relative)
        };

        // Read file content
        let content = tokio::fs::read(&local_path)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to read file '{}': {}", local_path.display(), e)))?;

        let size = content.len() as i64;

        // Upload to S3
        client
            .put_object()
            .bucket(&pair.bucket)
            .key(&remote_key)
            .body(content.into())
            .send()
            .await?;

        bytes_transferred += size;
        files_uploaded += 1;
        processed += 1;

        // Update tracked state - use the mtime from the change (scanned value)
        // This ensures consistency between what we scanned and what we saved
        let mtime = change.mtime.unwrap_or_else(|| {
            std::fs::metadata(&local_path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0)
        });

        db.save_local_file_state(pair_id, &change.relative_path, size, mtime, None)?;
        // Remote state will be updated on next scan - just mark size for now
        db.save_remote_file_state(pair_id, &change.relative_path, size, None, None, None)?;
    }

    // Download files
    for change in &to_download {
        if cancel_flag.load(Ordering::Relaxed) {
            return Ok(());
        }

        let _ = app.emit(
            "sync-progress",
            SyncProgressEvent {
                pair_id,
                session_id,
                phase: "downloading".to_string(),
                current_file: Some(change.relative_path.clone()),
                files_processed: processed,
                total_files: total_ops as i64,
                bytes_transferred,
            },
        );

        // Strip leading slash from relative path to prevent it from becoming an absolute path
        let relative = change.relative_path.trim_start_matches('/');
        let local_path = Path::new(&pair.local_path).join(relative);

        let remote_key = if pair.remote_prefix.is_empty() {
            relative.to_string()
        } else {
            format!("{}/{}", pair.remote_prefix, relative)
        };

        // Download from S3
        let response = match client
            .get_object()
            .bucket(&pair.bucket)
            .key(&remote_key)
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                // Check if it's a NoSuchKey error - file may have been deleted since scan
                let err_str = format!("{:?}", e);
                if err_str.contains("NoSuchKey") {
                    // File no longer exists in S3, skip it
                    processed += 1;
                    continue;
                }
                return Err(e.into());
            }
        };

        let content = response
            .body
            .collect()
            .await
            .map_err(|e| AppError::S3(format!("Failed to read body: {:?}", e)))?
            .into_bytes();

        let size = content.len() as i64;

        // Ensure parent directory exists
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Storage(format!("Failed to create directory '{}': {}", parent.display(), e)))?;
        }

        // Write to local file
        tokio::fs::write(&local_path, content)
            .await
            .map_err(|e| AppError::Storage(format!("Failed to write file: {}", e)))?;

        bytes_transferred += size;
        files_downloaded += 1;
        processed += 1;

        // Update tracked state
        let mtime = std::fs::metadata(&local_path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        db.save_local_file_state(pair_id, &change.relative_path, size, mtime, None)?;
        // Save the remote file's original mtime and etag for proper change detection
        db.save_remote_file_state(
            pair_id,
            &change.relative_path,
            size,
            change.hash.as_deref(), // etag
            change.mtime,           // remote mtime
            None,
        )?;
    }

    // Delete local files
    for change in &to_delete_local {
        if cancel_flag.load(Ordering::Relaxed) {
            return Ok(());
        }

        // Strip leading slash from relative path
        let relative = change.relative_path.trim_start_matches('/');
        let local_path = Path::new(&pair.local_path).join(relative);

        if local_path.exists() {
            tokio::fs::remove_file(&local_path)
                .await
                .map_err(|e| AppError::Storage(format!("Failed to delete file: {}", e)))?;
        }

        // Mark both local and remote as deleted since they're now in sync (both deleted)
        db.mark_local_file_deleted(pair_id, &change.relative_path)?;
        db.mark_remote_file_deleted(pair_id, &change.relative_path)?;
        files_deleted_local += 1;
        processed += 1;
    }

    // Delete remote files
    for change in &to_delete_remote {
        if cancel_flag.load(Ordering::Relaxed) {
            return Ok(());
        }

        // Strip leading slash from relative path
        let relative = change.relative_path.trim_start_matches('/');
        let remote_key = if pair.remote_prefix.is_empty() {
            relative.to_string()
        } else {
            format!("{}/{}", pair.remote_prefix, relative)
        };

        client
            .delete_object()
            .bucket(&pair.bucket)
            .key(&remote_key)
            .send()
            .await?;

        // Mark both local and remote as deleted since they're now in sync (both deleted)
        db.mark_local_file_deleted(pair_id, &change.relative_path)?;
        db.mark_remote_file_deleted(pair_id, &change.relative_path)?;
        files_deleted_remote += 1;
        processed += 1;
    }

    // Handle skipped deletions - mark files as deleted in database without propagating
    // This prevents them from being re-detected as changes on subsequent syncs
    for change in &skipped_local_deletions {
        // Local file was deleted but we're not propagating to remote
        // Mark local as deleted so we don't keep detecting it
        db.mark_local_file_deleted(pair_id, &change.relative_path)?;
    }

    for change in &skipped_remote_deletions {
        // Remote file was deleted but we're not propagating to local
        // Mark remote as deleted so we don't keep detecting it
        db.mark_remote_file_deleted(pair_id, &change.relative_path)?;
    }

    // Update session with final stats
    db.update_sync_session_progress(
        session_id,
        files_uploaded,
        files_downloaded,
        files_deleted_local,
        files_deleted_remote,
        bytes_transferred,
    )?;

    // Complete
    db.complete_sync_session(session_id)?;
    db.mark_sync_completed(pair_id)?;

    let _ = app.emit(
        "sync-complete",
        SyncCompleteEvent {
            pair_id,
            session_id,
            files_uploaded,
            files_downloaded,
            files_deleted_local,
            files_deleted_remote,
        },
    );

    Ok(())
}
