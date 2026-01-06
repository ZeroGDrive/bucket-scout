use crate::credentials::CredentialsManager;
use crate::db::duplicates::{
    DuplicateGroup, DuplicateScan, HashType, NewScan, ScanSummary, ScannedFile,
};
use crate::db::DbManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::RwLock;

/// Global state for tracking active scans
pub struct ScanState {
    /// Map of scan_id -> cancellation flag
    pub active_scans: RwLock<HashMap<i64, Arc<AtomicBool>>>,
}

impl Default for ScanState {
    fn default() -> Self {
        Self {
            active_scans: RwLock::new(HashMap::new()),
        }
    }
}

/// Progress event for scan
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    pub scan_id: i64,
    pub phase: String,
    pub files_scanned: i64,
    pub total_files: i64,
    pub current_file: Option<String>,
    pub bytes_processed: i64,
}

/// Completion event for scan
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCompleteEvent {
    pub scan_id: i64,
    pub duplicate_groups: i64,
    pub duplicate_files: i64,
    pub reclaimable_bytes: i64,
}

/// Error event for scan
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanErrorEvent {
    pub scan_id: i64,
    pub error: String,
}

/// Start a duplicate scan
#[tauri::command(rename_all = "camelCase")]
pub async fn start_duplicate_scan(
    app: AppHandle,
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    db: State<'_, DbManager>,
    scan_state: State<'_, ScanState>,
    account_id: String,
    bucket: String,
    prefix: Option<String>,
    hash_type: String,
    min_file_size: Option<i64>,
) -> Result<i64, AppError> {
    let prefix = prefix.unwrap_or_default();
    let hash_type = HashType::try_from(hash_type.as_str())?;
    let min_size = min_file_size.unwrap_or(0);

    // Create scan record
    let scan_id = db.create_scan(&NewScan {
        account_id: account_id.clone(),
        bucket: bucket.clone(),
        prefix: prefix.clone(),
    })?;

    // Set up cancellation token
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut scans = scan_state.active_scans.write().await;
        scans.insert(scan_id, cancel_flag.clone());
    }

    // Get S3 client
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;
    let client = s3_clients
        .get_or_create_client(
            &account_id,
            &account.endpoint,
            &account.access_key_id,
            &secret,
            account.provider_type,
            account.region.as_deref(),
        )
        .await?;

    // Clone values for the async task
    let db_clone = (*db).clone();
    let app_clone = app.clone();
    let bucket_clone = bucket.clone();
    let prefix_clone = prefix.clone();

    // Spawn async scan task
    tokio::spawn(async move {
        let result = run_scan(
            &app_clone,
            &client,
            &db_clone,
            scan_id,
            &bucket_clone,
            &prefix_clone,
            hash_type,
            min_size,
            cancel_flag.clone(),
        )
        .await;

        if let Err(e) = result {
            let _ = db_clone.fail_scan(scan_id, &e.to_string());
            let _ = app_clone.emit(
                "scan-error",
                ScanErrorEvent {
                    scan_id,
                    error: e.to_string(),
                },
            );
        }
    });

    Ok(scan_id)
}

/// Run the actual duplicate scan
async fn run_scan(
    app: &AppHandle,
    client: &aws_sdk_s3::Client,
    db: &DbManager,
    scan_id: i64,
    bucket: &str,
    prefix: &str,
    hash_type: HashType,
    min_size: i64,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), AppError> {
    // Phase 1: List all objects
    let _ = app.emit(
        "scan-progress",
        ScanProgressEvent {
            scan_id,
            phase: "listing".to_string(),
            files_scanned: 0,
            total_files: 0,
            current_file: None,
            bytes_processed: 0,
        },
    );

    let mut all_files: Vec<ScannedFile> = Vec::new();
    let mut continuation_token: Option<String> = None;
    let mut total_size: i64 = 0;

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            db.cancel_scan(scan_id)?;
            return Ok(());
        }

        let mut request = client.list_objects_v2().bucket(bucket);

        if !prefix.is_empty() {
            request = request.prefix(prefix);
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

                let size = obj.size().unwrap_or(0);

                // Skip files smaller than min_size
                if size < min_size {
                    continue;
                }

                total_size += size;
                all_files.push(ScannedFile {
                    key: key.to_string(),
                    size,
                    etag: obj.e_tag().map(|e| e.trim_matches('"').to_string()),
                    last_modified: obj.last_modified().and_then(|d| {
                        d.secs().try_into().ok()
                    }),
                    storage_class: obj.storage_class().map(|s| s.as_str().to_string()),
                    content_hash: None,
                });
            }
        }

        // Update progress
        db.update_scan_progress(scan_id, all_files.len() as i64, total_size)?;

        let _ = app.emit(
            "scan-progress",
            ScanProgressEvent {
                scan_id,
                phase: "listing".to_string(),
                files_scanned: all_files.len() as i64,
                total_files: all_files.len() as i64,
                current_file: None,
                bytes_processed: total_size,
            },
        );

        if response.is_truncated() == Some(true) {
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    let total_files = all_files.len() as i64;

    // Phase 2: Group by hash
    let _ = app.emit(
        "scan-progress",
        ScanProgressEvent {
            scan_id,
            phase: "hashing".to_string(),
            files_scanned: 0,
            total_files,
            current_file: None,
            bytes_processed: 0,
        },
    );

    // Group files by size first (optimization - same size is necessary for duplicates)
    let mut by_size: HashMap<i64, Vec<ScannedFile>> = HashMap::new();
    for file in all_files {
        by_size.entry(file.size).or_default().push(file);
    }

    // Only process sizes with multiple files
    let candidate_groups: Vec<Vec<ScannedFile>> = by_size
        .into_values()
        .filter(|files| files.len() > 1)
        .collect();

    let files_processed = Arc::new(AtomicI64::new(0));
    let bytes_processed = Arc::new(AtomicI64::new(0));

    // Process each size group
    let mut duplicate_groups_count = 0i64;
    let mut duplicate_files_count = 0i64;
    let mut reclaimable_bytes = 0i64;

    for size_group in candidate_groups {
        if cancel_flag.load(Ordering::Relaxed) {
            db.cancel_scan(scan_id)?;
            return Ok(());
        }

        // For each size group, compute hashes and find actual duplicates
        let mut hash_groups: HashMap<String, Vec<ScannedFile>> = HashMap::new();

        for mut file in size_group {
            if cancel_flag.load(Ordering::Relaxed) {
                db.cancel_scan(scan_id)?;
                return Ok(());
            }

            let hash = match hash_type {
                HashType::Etag => {
                    // Use ETag as hash (fast mode)
                    file.etag.clone().unwrap_or_default()
                }
                HashType::Sha256 => {
                    // Download and compute SHA-256 (accurate mode)
                    match compute_sha256(client, bucket, &file.key).await {
                        Ok(h) => h,
                        Err(e) => {
                            log::warn!("Failed to hash {}: {}", file.key, e);
                            continue;
                        }
                    }
                }
            };

            if !hash.is_empty() {
                file.content_hash = Some(hash.clone());
                hash_groups.entry(hash).or_default().push(file.clone());
            }

            // Update progress
            let processed = files_processed.fetch_add(1, Ordering::Relaxed) + 1;
            let bytes = bytes_processed.fetch_add(file.size, Ordering::Relaxed) + file.size;

            // Emit progress every 10 files or so
            if processed % 10 == 0 {
                let _ = app.emit(
                    "scan-progress",
                    ScanProgressEvent {
                        scan_id,
                        phase: "hashing".to_string(),
                        files_scanned: processed,
                        total_files,
                        current_file: Some(file.key.clone()),
                        bytes_processed: bytes,
                    },
                );
            }
        }

        // Save duplicate groups (groups with more than 1 file)
        for (hash, files) in hash_groups {
            if files.len() > 1 {
                let file_size = files[0].size;
                let file_count = files.len() as i64;

                db.save_duplicate_group(scan_id, &hash, hash_type, file_size, &files)?;

                duplicate_groups_count += 1;
                duplicate_files_count += file_count;
                reclaimable_bytes += file_size * (file_count - 1); // Can reclaim all but one copy
            }
        }
    }

    // Complete the scan
    db.complete_scan(
        scan_id,
        duplicate_groups_count,
        duplicate_files_count,
        reclaimable_bytes,
    )?;

    let _ = app.emit(
        "scan-complete",
        ScanCompleteEvent {
            scan_id,
            duplicate_groups: duplicate_groups_count,
            duplicate_files: duplicate_files_count,
            reclaimable_bytes,
        },
    );

    Ok(())
}

/// Compute SHA-256 hash of an S3 object
async fn compute_sha256(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
) -> Result<String, AppError> {
    let response = client.get_object().bucket(bucket).key(key).send().await?;

    let body = response
        .body
        .collect()
        .await
        .map_err(|e| AppError::S3(format!("Failed to read body: {:?}", e)))?;

    let mut hasher = Sha256::new();
    hasher.update(body.into_bytes());
    let result = hasher.finalize();

    Ok(hex::encode(result))
}

/// Cancel a running scan
#[tauri::command(rename_all = "camelCase")]
pub async fn cancel_duplicate_scan(
    scan_state: State<'_, ScanState>,
    db: State<'_, DbManager>,
    scan_id: i64,
) -> Result<(), AppError> {
    // Set cancel flag
    {
        let scans = scan_state.active_scans.read().await;
        if let Some(flag) = scans.get(&scan_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    // Update status in DB
    db.cancel_scan(scan_id)?;

    // Remove from active scans
    {
        let mut scans = scan_state.active_scans.write().await;
        scans.remove(&scan_id);
    }

    Ok(())
}

/// Get scan details and results
#[tauri::command(rename_all = "camelCase")]
pub async fn get_scan(db: State<'_, DbManager>, scan_id: i64) -> Result<Option<DuplicateScan>, AppError> {
    db.get_scan(scan_id)
}

/// Get duplicate groups for a scan
#[tauri::command(rename_all = "camelCase")]
pub async fn get_duplicate_groups(
    db: State<'_, DbManager>,
    scan_id: i64,
) -> Result<Vec<DuplicateGroup>, AppError> {
    db.get_duplicate_groups(scan_id)
}

/// List recent scans
#[tauri::command(rename_all = "camelCase")]
pub async fn list_scans(
    db: State<'_, DbManager>,
    account_id: String,
    bucket: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ScanSummary>, AppError> {
    db.list_scans(&account_id, bucket.as_deref(), limit.unwrap_or(20))
}

/// Delete a scan and its results
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_scan(db: State<'_, DbManager>, scan_id: i64) -> Result<(), AppError> {
    db.delete_scan(scan_id)
}

/// Delete duplicate files result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDuplicatesResult {
    pub deleted_count: usize,
    pub freed_bytes: i64,
    pub errors: Vec<DeleteDuplicateError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDuplicateError {
    pub key: String,
    pub error: String,
}

/// Delete selected duplicate files (keep one, delete rest)
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_duplicates(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    db: State<'_, DbManager>,
    account_id: String,
    bucket: String,
    scan_id: i64,
    keys_to_delete: Vec<String>,
) -> Result<DeleteDuplicatesResult, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(
            &account_id,
            &account.endpoint,
            &account.access_key_id,
            &secret,
            account.provider_type,
            account.region.as_deref(),
        )
        .await?;

    let mut deleted_count = 0usize;
    let mut freed_bytes = 0i64;
    let mut errors = Vec::new();
    let mut deleted_keys = Vec::new();

    // Delete in batches of 1000 (S3 limit)
    for chunk in keys_to_delete.chunks(1000) {
        let objects_to_delete: Vec<aws_sdk_s3::types::ObjectIdentifier> = chunk
            .iter()
            .filter_map(|key| {
                aws_sdk_s3::types::ObjectIdentifier::builder()
                    .key(key)
                    .build()
                    .ok()
            })
            .collect();

        let delete = aws_sdk_s3::types::Delete::builder()
            .set_objects(Some(objects_to_delete))
            .build()
            .map_err(|e| AppError::S3(format!("Failed to build delete request: {:?}", e)))?;

        let response = client
            .delete_objects()
            .bucket(&bucket)
            .delete(delete)
            .send()
            .await?;

        // Track successful deletions
        for deleted in response.deleted() {
            if let Some(key) = deleted.key() {
                deleted_count += 1;
                deleted_keys.push(key.to_string());
            }
        }

        // Track errors
        for err in response.errors() {
            errors.push(DeleteDuplicateError {
                key: err.key().unwrap_or_default().to_string(),
                error: err.message().unwrap_or_default().to_string(),
            });
        }
    }

    // Calculate freed bytes (need to look up sizes)
    // For simplicity, we'll estimate based on the groups
    let groups = db.get_duplicate_groups(scan_id)?;
    for group in &groups {
        let deleted_in_group = group
            .files
            .iter()
            .filter(|f| deleted_keys.contains(&f.key))
            .count();
        freed_bytes += (deleted_in_group as i64) * group.file_size;
    }

    // Update database to reflect deleted files
    if !deleted_keys.is_empty() {
        db.remove_deleted_files(scan_id, &deleted_keys)?;
    }

    Ok(DeleteDuplicatesResult {
        deleted_count,
        freed_bytes,
        errors,
    })
}
