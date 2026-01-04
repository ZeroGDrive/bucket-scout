use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::types::ObjectIdentifier;
use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncReadExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct S3Object {
    pub key: String,
    pub size: i64,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub is_folder: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListObjectsResponse {
    pub objects: Vec<S3Object>,
    pub folders: Vec<String>,
    pub continuation_token: Option<String>,
    pub is_truncated: bool,
    pub prefix: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_objects(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    prefix: Option<String>,
    continuation_token: Option<String>,
    max_keys: Option<i32>,
) -> Result<ListObjectsResponse, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let mut request = client
        .list_objects_v2()
        .bucket(&bucket)
        .delimiter("/"); // Use delimiter for folder-like browsing

    if let Some(ref p) = prefix {
        request = request.prefix(p);
    }

    if let Some(token) = continuation_token {
        request = request.continuation_token(token);
    }

    if let Some(max) = max_keys {
        request = request.max_keys(max);
    }

    let response = request.send().await?;

    // Parse regular objects (files)
    let objects: Vec<S3Object> = response
        .contents()
        .iter()
        .filter_map(|obj| {
            let key = obj.key()?;
            // Skip the prefix itself if it's returned
            if prefix.as_ref().map_or(false, |p| key == p) {
                return None;
            }
            Some(S3Object {
                key: key.to_string(),
                size: obj.size().unwrap_or(0),
                last_modified: obj.last_modified().map(|d| d.to_string()),
                etag: obj.e_tag().map(|e| e.trim_matches('"').to_string()),
                is_folder: false,
            })
        })
        .collect();

    // Parse common prefixes (folders)
    let folders: Vec<String> = response
        .common_prefixes()
        .iter()
        .filter_map(|cp| cp.prefix().map(|p| p.to_string()))
        .collect();

    Ok(ListObjectsResponse {
        objects,
        folders,
        continuation_token: response.next_continuation_token().map(|s| s.to_string()),
        is_truncated: response.is_truncated().unwrap_or(false),
        prefix,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_object_metadata(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    key: String,
) -> Result<ObjectMetadata, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let response = client.head_object().bucket(&bucket).key(&key).send().await?;

    // Convert user metadata to HashMap
    let metadata = response.metadata().map(|m| {
        m.iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<std::collections::HashMap<String, String>>()
    });

    Ok(ObjectMetadata {
        key: key.clone(),
        size: response.content_length().unwrap_or(0),
        content_type: response.content_type().map(|s| s.to_string()),
        last_modified: response.last_modified().map(|d| d.to_string()),
        etag: response.e_tag().map(|e| e.trim_matches('"').to_string()),
        storage_class: response.storage_class().map(|s| s.as_str().to_string()),
        content_encoding: response.content_encoding().map(|s| s.to_string()),
        cache_control: response.cache_control().map(|s| s.to_string()),
        version_id: response.version_id().map(|s| s.to_string()),
        metadata,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectMetadata {
    pub key: String,
    pub size: i64,
    pub content_type: Option<String>,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub storage_class: Option<String>,
    pub content_encoding: Option<String>,
    pub cache_control: Option<String>,
    pub version_id: Option<String>,
    pub metadata: Option<std::collections::HashMap<String, String>>,
}

// Upload event types for progress tracking (using global events)
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadStarted {
    pub upload_id: String,
    pub file_name: String,
    pub total_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    pub upload_id: String,
    pub bytes_uploaded: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadCompleted {
    pub upload_id: String,
    pub key: String,
    pub etag: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadFailed {
    pub upload_id: String,
    pub error: String,
}

const MULTIPART_THRESHOLD: u64 = 5 * 1024 * 1024; // 5MB
const PART_SIZE: usize = 5 * 1024 * 1024; // 5MB per part

#[tauri::command(rename_all = "camelCase")]
pub async fn upload_object(
    app: AppHandle,
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    file_path: PathBuf,
    key: String,
    content_type: Option<String>,
    upload_id: String,
) -> Result<(), AppError> {
    // Read file metadata
    let metadata = tokio::fs::metadata(&file_path)
        .await
        .map_err(|e| AppError::InvalidInput(format!("Cannot read file: {}", e)))?;
    let total_bytes = metadata.len();
    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Emit started event
    let _ = app.emit(
        "upload-started",
        UploadStarted {
            upload_id: upload_id.clone(),
            file_name: file_name.clone(),
            total_bytes,
        },
    );

    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;
    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    // Determine content type
    let mime = content_type.unwrap_or_else(|| {
        mime_guess::from_path(&file_path)
            .first_or_octet_stream()
            .to_string()
    });

    let result = if total_bytes > MULTIPART_THRESHOLD {
        upload_multipart(&client, &bucket, &key, &file_path, &mime, total_bytes, &upload_id, &app)
            .await
    } else {
        upload_single(&client, &bucket, &key, &file_path, &mime, total_bytes, &upload_id, &app)
            .await
    };

    match result {
        Ok(etag) => {
            let _ = app.emit(
                "upload-completed",
                UploadCompleted {
                    upload_id,
                    key,
                    etag,
                },
            );
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "upload-failed",
                UploadFailed {
                    upload_id,
                    error: e.to_string(),
                },
            );
            Err(e)
        }
    }
}

async fn upload_single(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    file_path: &PathBuf,
    content_type: &str,
    total_bytes: u64,
    upload_id: &str,
    app: &AppHandle,
) -> Result<Option<String>, AppError> {
    let body = tokio::fs::read(file_path)
        .await
        .map_err(|e| AppError::InvalidInput(format!("Failed to read file: {}", e)))?;

    let response = client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(aws_sdk_s3::primitives::ByteStream::from(body))
        .content_type(content_type)
        .send()
        .await?;

    // Emit 100% progress after successful upload
    let _ = app.emit(
        "upload-progress",
        UploadProgress {
            upload_id: upload_id.to_string(),
            bytes_uploaded: total_bytes,
            total_bytes,
        },
    );

    Ok(response.e_tag().map(|s| s.trim_matches('"').to_string()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub deleted: usize,
    pub errors: Vec<DeleteError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteError {
    pub key: String,
    pub error: String,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_objects(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    keys: Vec<String>,
) -> Result<DeleteResult, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let mut all_keys_to_delete: Vec<String> = Vec::new();

    // For each key, if it's a folder (ends with /), list all objects with that prefix
    for key in &keys {
        if key.ends_with('/') {
            // It's a folder - recursively list all objects
            let mut continuation_token: Option<String> = None;
            loop {
                let mut request = client
                    .list_objects_v2()
                    .bucket(&bucket)
                    .prefix(key);

                if let Some(token) = &continuation_token {
                    request = request.continuation_token(token);
                }

                let response = request.send().await?;

                for obj in response.contents() {
                    if let Some(obj_key) = obj.key() {
                        all_keys_to_delete.push(obj_key.to_string());
                    }
                }

                if response.is_truncated() == Some(true) {
                    continuation_token = response.next_continuation_token().map(|s| s.to_string());
                } else {
                    break;
                }
            }
        } else {
            all_keys_to_delete.push(key.clone());
        }
    }

    if all_keys_to_delete.is_empty() {
        return Ok(DeleteResult {
            deleted: 0,
            errors: vec![],
        });
    }

    let mut total_deleted = 0;
    let mut all_errors: Vec<DeleteError> = Vec::new();

    // S3 delete_objects can handle up to 1000 objects per call
    for chunk in all_keys_to_delete.chunks(1000) {
        let objects_to_delete: Vec<ObjectIdentifier> = chunk
            .iter()
            .filter_map(|key| {
                ObjectIdentifier::builder()
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

        // Count successful deletions
        total_deleted += response.deleted().len();

        // Collect errors
        for err in response.errors() {
            all_errors.push(DeleteError {
                key: err.key().unwrap_or_default().to_string(),
                error: err.message().unwrap_or_default().to_string(),
            });
        }
    }

    Ok(DeleteResult {
        deleted: total_deleted,
        errors: all_errors,
    })
}

async fn upload_multipart(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    file_path: &PathBuf,
    content_type: &str,
    total_bytes: u64,
    upload_id: &str,
    app: &AppHandle,
) -> Result<Option<String>, AppError> {
    // Initiate multipart upload
    let create_response = client
        .create_multipart_upload()
        .bucket(bucket)
        .key(key)
        .content_type(content_type)
        .send()
        .await?;

    let s3_upload_id = create_response
        .upload_id()
        .ok_or_else(|| AppError::S3("No upload ID returned".into()))?
        .to_string();

    let mut file = tokio::fs::File::open(file_path)
        .await
        .map_err(|e| AppError::InvalidInput(format!("Cannot open file: {}", e)))?;

    let mut part_number = 1;
    let mut completed_parts = Vec::new();
    let mut bytes_uploaded: u64 = 0;

    // Clone values needed for abort
    let client = Arc::new(client.clone());
    let bucket_clone = bucket.to_string();
    let key_clone = key.to_string();
    let s3_upload_id_clone = s3_upload_id.clone();

    loop {
        let mut buffer = vec![0u8; PART_SIZE];
        let bytes_read = file
            .read(&mut buffer)
            .await
            .map_err(|e| AppError::InvalidInput(format!("Read error: {}", e)))?;

        if bytes_read == 0 {
            break;
        }

        buffer.truncate(bytes_read);

        let upload_part_response = match client
            .upload_part()
            .bucket(bucket)
            .key(key)
            .upload_id(&s3_upload_id)
            .part_number(part_number)
            .body(aws_sdk_s3::primitives::ByteStream::from(buffer))
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                // Attempt to abort on failure
                let _ = client
                    .abort_multipart_upload()
                    .bucket(&bucket_clone)
                    .key(&key_clone)
                    .upload_id(&s3_upload_id_clone)
                    .send()
                    .await;
                return Err(AppError::S3(format!("{:?}", e)));
            }
        };

        bytes_uploaded += bytes_read as u64;

        // Emit progress
        let _ = app.emit(
            "upload-progress",
            UploadProgress {
                upload_id: upload_id.to_string(),
                bytes_uploaded,
                total_bytes,
            },
        );

        completed_parts.push(
            aws_sdk_s3::types::CompletedPart::builder()
                .e_tag(upload_part_response.e_tag().unwrap_or_default())
                .part_number(part_number)
                .build(),
        );

        part_number += 1;
    }

    // Complete multipart upload
    let completed_upload = aws_sdk_s3::types::CompletedMultipartUpload::builder()
        .set_parts(Some(completed_parts))
        .build();

    let complete_response = client
        .complete_multipart_upload()
        .bucket(bucket)
        .key(key)
        .upload_id(&s3_upload_id)
        .multipart_upload(completed_upload)
        .send()
        .await?;

    Ok(complete_response
        .e_tag()
        .map(|s| s.trim_matches('"').to_string()))
}

/// Create a folder in S3 by creating a zero-byte object with a trailing slash
#[tauri::command(rename_all = "camelCase")]
pub async fn create_folder(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    prefix: String,
    folder_name: String,
) -> Result<String, AppError> {
    // Validate folder name
    if folder_name.is_empty() {
        return Err(AppError::InvalidInput("Folder name cannot be empty".into()));
    }
    if folder_name.contains('/') || folder_name.contains('\\') {
        return Err(AppError::InvalidInput(
            "Folder name cannot contain slashes".into(),
        ));
    }

    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    // Construct the full key with trailing slash
    let key = format!("{}{}/", prefix, folder_name);

    // Create a zero-byte object to represent the folder
    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(aws_sdk_s3::primitives::ByteStream::from(Vec::new()))
        .send()
        .await?;

    Ok(key)
}

// Download event types for progress tracking
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStarted {
    pub download_id: String,
    pub file_name: String,
    pub total_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub download_id: String,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCompleted {
    pub download_id: String,
    pub key: String,
    pub path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFailed {
    pub download_id: String,
    pub error: String,
}

const DOWNLOAD_CHUNK_SIZE: usize = 64 * 1024; // 64KB chunks

/// Download an object from S3 to local filesystem
#[tauri::command(rename_all = "camelCase")]
pub async fn download_object(
    app: AppHandle,
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    key: String,
    destination: String,
    download_id: String,
) -> Result<String, AppError> {
    let file_name = key.rsplit('/').next().unwrap_or(&key).to_string();

    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    // Get the object
    let response = match client.get_object().bucket(&bucket).key(&key).send().await {
        Ok(resp) => resp,
        Err(e) => {
            let _ = app.emit(
                "download-failed",
                DownloadFailed {
                    download_id,
                    error: format!("{:?}", e),
                },
            );
            return Err(AppError::S3(format!("{:?}", e)));
        }
    };

    let total_bytes = response.content_length().unwrap_or(0) as u64;

    // Emit started event
    let _ = app.emit(
        "download-started",
        DownloadStarted {
            download_id: download_id.clone(),
            file_name: file_name.clone(),
            total_bytes,
        },
    );

    // Create destination path
    let dest_path = PathBuf::from(&destination).join(&file_name);

    // Create parent directories if needed
    if let Some(parent) = dest_path.parent() {
        if let Err(e) = tokio::fs::create_dir_all(parent).await {
            let _ = app.emit(
                "download-failed",
                DownloadFailed {
                    download_id,
                    error: format!("Failed to create directory: {}", e),
                },
            );
            return Err(AppError::InvalidInput(format!(
                "Failed to create directory: {}",
                e
            )));
        }
    }

    // Create the file
    let mut file = match tokio::fs::File::create(&dest_path).await {
        Ok(f) => f,
        Err(e) => {
            let _ = app.emit(
                "download-failed",
                DownloadFailed {
                    download_id,
                    error: format!("Failed to create file: {}", e),
                },
            );
            return Err(AppError::InvalidInput(format!(
                "Failed to create file: {}",
                e
            )));
        }
    };

    // Stream the body to file
    let mut body = response.body.into_async_read();
    let mut bytes_downloaded: u64 = 0;
    let mut buffer = vec![0u8; DOWNLOAD_CHUNK_SIZE];

    use tokio::io::AsyncWriteExt;

    loop {
        let bytes_read = match body.read(&mut buffer).await {
            Ok(0) => break, // EOF
            Ok(n) => n,
            Err(e) => {
                let _ = app.emit(
                    "download-failed",
                    DownloadFailed {
                        download_id,
                        error: format!("Read error: {}", e),
                    },
                );
                return Err(AppError::InvalidInput(format!("Read error: {}", e)));
            }
        };

        if let Err(e) = file.write_all(&buffer[..bytes_read]).await {
            let _ = app.emit(
                "download-failed",
                DownloadFailed {
                    download_id,
                    error: format!("Write error: {}", e),
                },
            );
            return Err(AppError::InvalidInput(format!("Write error: {}", e)));
        }

        bytes_downloaded += bytes_read as u64;

        // Emit progress
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                download_id: download_id.clone(),
                bytes_downloaded,
                total_bytes,
            },
        );
    }

    // Flush and sync
    if let Err(e) = file.sync_all().await {
        let _ = app.emit(
            "download-failed",
            DownloadFailed {
                download_id,
                error: format!("Sync error: {}", e),
            },
        );
        return Err(AppError::InvalidInput(format!("Sync error: {}", e)));
    }

    let final_path = dest_path.to_string_lossy().to_string();

    // Emit completed event
    let _ = app.emit(
        "download-completed",
        DownloadCompleted {
            download_id,
            key,
            path: final_path.clone(),
        },
    );

    Ok(final_path)
}

/// Search for objects recursively within a prefix
#[tauri::command(rename_all = "camelCase")]
pub async fn search_objects(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    prefix: String,
    query: String,
    max_results: Option<u32>,
) -> Result<Vec<S3Object>, AppError> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let max = max_results.unwrap_or(100) as usize;
    let query_lower = query.to_lowercase();
    let mut results: Vec<S3Object> = Vec::new();
    let mut continuation_token: Option<String> = None;

    // List all objects recursively (no delimiter) and filter by query
    loop {
        let mut request = client.list_objects_v2().bucket(&bucket);

        if !prefix.is_empty() {
            request = request.prefix(&prefix);
        }

        if let Some(token) = &continuation_token {
            request = request.continuation_token(token);
        }

        let response = request.send().await?;

        for obj in response.contents() {
            if let Some(key) = obj.key() {
                // Get the file name from the key
                let name = key.rsplit('/').next().unwrap_or(key);

                // Case-insensitive search
                if name.to_lowercase().contains(&query_lower) {
                    results.push(S3Object {
                        key: key.to_string(),
                        size: obj.size().unwrap_or(0),
                        last_modified: obj.last_modified().map(|d| d.to_string()),
                        etag: obj.e_tag().map(|e| e.trim_matches('"').to_string()),
                        is_folder: key.ends_with('/'),
                    });

                    if results.len() >= max {
                        return Ok(results);
                    }
                }
            }
        }

        if response.is_truncated() == Some(true) {
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(results)
}

// Presigned URL types
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignedUrlResult {
    pub url: String,
    pub expires_at: String,
}

/// Generate a presigned URL for downloading an object
#[tauri::command(rename_all = "camelCase")]
pub async fn generate_presigned_url(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    key: String,
    expires_in_seconds: u64,
) -> Result<PresignedUrlResult, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let expires_in = Duration::from_secs(expires_in_seconds);
    let presigning_config = PresigningConfig::expires_in(expires_in)
        .map_err(|e| AppError::InvalidInput(format!("Invalid expiry duration: {}", e)))?;

    let presigned_request = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .presigned(presigning_config)
        .await
        .map_err(|e| AppError::S3(format!("Failed to generate presigned URL: {:?}", e)))?;

    let expires_at = chrono::Utc::now() + chrono::Duration::seconds(expires_in_seconds as i64);

    Ok(PresignedUrlResult {
        url: presigned_request.uri().to_string(),
        expires_at: expires_at.to_rfc3339(),
    })
}

// Rename types
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub old_key: String,
    pub new_key: String,
    pub objects_renamed: usize,
}

/// Rename an object or folder by copying to new key and deleting old key
#[tauri::command(rename_all = "camelCase")]
pub async fn rename_object(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    old_key: String,
    new_name: String,
) -> Result<RenameResult, AppError> {
    // Validate new name
    if new_name.is_empty() {
        return Err(AppError::InvalidInput("New name cannot be empty".into()));
    }
    if new_name.contains('/') || new_name.contains('\\') {
        return Err(AppError::InvalidInput(
            "New name cannot contain slashes".into(),
        ));
    }

    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let is_folder = old_key.ends_with('/');

    // Calculate new key by replacing the last component of the path
    let new_key = if is_folder {
        // For folders: replace the folder name
        let parts: Vec<&str> = old_key.trim_end_matches('/').split('/').collect();
        if parts.len() == 1 {
            format!("{}/", new_name)
        } else {
            let parent = parts[..parts.len() - 1].join("/");
            format!("{}/{}/", parent, new_name)
        }
    } else {
        // For files: replace the file name
        let parts: Vec<&str> = old_key.split('/').collect();
        if parts.len() == 1 {
            new_name.clone()
        } else {
            let parent = parts[..parts.len() - 1].join("/");
            format!("{}/{}", parent, new_name)
        }
    };

    let mut objects_renamed = 0;

    if is_folder {
        // For folders, we need to copy all objects with the old prefix to the new prefix
        let mut continuation_token: Option<String> = None;

        loop {
            let mut request = client.list_objects_v2().bucket(&bucket).prefix(&old_key);

            if let Some(token) = &continuation_token {
                request = request.continuation_token(token);
            }

            let response = request.send().await?;

            for obj in response.contents() {
                if let Some(obj_key) = obj.key() {
                    // Calculate the new key by replacing the old prefix with the new one
                    let relative_path = obj_key.strip_prefix(&old_key).unwrap_or(obj_key);
                    let dest_key = format!("{}{}", new_key, relative_path);

                    // Copy to new location
                    let copy_source = format!(
                        "{}/{}",
                        bucket,
                        urlencoding::encode(obj_key)
                    );

                    client
                        .copy_object()
                        .bucket(&bucket)
                        .key(&dest_key)
                        .copy_source(&copy_source)
                        .send()
                        .await
                        .map_err(|e| {
                            AppError::S3(format!("Failed to copy {}: {:?}", obj_key, e))
                        })?;

                    // Delete old object
                    client
                        .delete_object()
                        .bucket(&bucket)
                        .key(obj_key)
                        .send()
                        .await
                        .map_err(|e| {
                            AppError::S3(format!("Failed to delete {}: {:?}", obj_key, e))
                        })?;

                    objects_renamed += 1;
                }
            }

            if response.is_truncated() == Some(true) {
                continuation_token = response.next_continuation_token().map(|s| s.to_string());
            } else {
                break;
            }
        }
    } else {
        // For single files, just copy and delete
        let copy_source = format!(
            "{}/{}",
            bucket,
            urlencoding::encode(&old_key)
        );

        client
            .copy_object()
            .bucket(&bucket)
            .key(&new_key)
            .copy_source(&copy_source)
            .send()
            .await
            .map_err(|e| AppError::S3(format!("Failed to copy object: {:?}", e)))?;

        client
            .delete_object()
            .bucket(&bucket)
            .key(&old_key)
            .send()
            .await
            .map_err(|e| AppError::S3(format!("Failed to delete old object: {:?}", e)))?;

        objects_renamed = 1;
    }

    Ok(RenameResult {
        old_key,
        new_key,
        objects_renamed,
    })
}

// Copy/Move types
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyMoveResult {
    pub objects_copied: usize,
    pub objects_deleted: usize,
    pub errors: Vec<CopyMoveError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyMoveError {
    pub source_key: String,
    pub error: String,
}

/// Copy or move objects to a destination prefix
#[tauri::command(rename_all = "camelCase")]
pub async fn copy_objects(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    source_keys: Vec<String>,
    destination_prefix: String,
    delete_source: bool,
) -> Result<CopyMoveResult, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let mut objects_copied = 0;
    let mut objects_deleted = 0;
    let mut errors: Vec<CopyMoveError> = Vec::new();

    for source_key in &source_keys {
        let is_folder = source_key.ends_with('/');

        if is_folder {
            // For folders, copy all objects recursively
            let mut continuation_token: Option<String> = None;

            loop {
                let mut request = client.list_objects_v2().bucket(&bucket).prefix(source_key);

                if let Some(token) = &continuation_token {
                    request = request.continuation_token(token);
                }

                let response = match request.send().await {
                    Ok(r) => r,
                    Err(e) => {
                        errors.push(CopyMoveError {
                            source_key: source_key.clone(),
                            error: format!("Failed to list folder: {:?}", e),
                        });
                        break;
                    }
                };

                for obj in response.contents() {
                    if let Some(obj_key) = obj.key() {
                        // Get the relative path within the folder
                        let folder_name = source_key
                            .trim_end_matches('/')
                            .split('/')
                            .last()
                            .unwrap_or("");
                        let relative_path = obj_key.strip_prefix(source_key).unwrap_or(obj_key);
                        let dest_key =
                            format!("{}{}/{}", destination_prefix, folder_name, relative_path);

                        // Copy the object
                        let copy_source = format!(
                            "{}/{}",
                            bucket,
                            urlencoding::encode(obj_key)
                        );

                        match client
                            .copy_object()
                            .bucket(&bucket)
                            .key(&dest_key)
                            .copy_source(&copy_source)
                            .send()
                            .await
                        {
                            Ok(_) => {
                                objects_copied += 1;

                                // Delete if moving
                                if delete_source {
                                    match client
                                        .delete_object()
                                        .bucket(&bucket)
                                        .key(obj_key)
                                        .send()
                                        .await
                                    {
                                        Ok(_) => objects_deleted += 1,
                                        Err(e) => errors.push(CopyMoveError {
                                            source_key: obj_key.to_string(),
                                            error: format!("Failed to delete: {:?}", e),
                                        }),
                                    }
                                }
                            }
                            Err(e) => {
                                errors.push(CopyMoveError {
                                    source_key: obj_key.to_string(),
                                    error: format!("Failed to copy: {:?}", e),
                                });
                            }
                        }
                    }
                }

                if response.is_truncated() == Some(true) {
                    continuation_token = response.next_continuation_token().map(|s| s.to_string());
                } else {
                    break;
                }
            }
        } else {
            // For single files
            let file_name = source_key.split('/').last().unwrap_or(source_key);
            let dest_key = format!("{}{}", destination_prefix, file_name);

            let copy_source = format!(
                "{}/{}",
                bucket,
                urlencoding::encode(source_key)
            );

            match client
                .copy_object()
                .bucket(&bucket)
                .key(&dest_key)
                .copy_source(&copy_source)
                .send()
                .await
            {
                Ok(_) => {
                    objects_copied += 1;

                    // Delete if moving
                    if delete_source {
                        match client
                            .delete_object()
                            .bucket(&bucket)
                            .key(source_key)
                            .send()
                            .await
                        {
                            Ok(_) => objects_deleted += 1,
                            Err(e) => errors.push(CopyMoveError {
                                source_key: source_key.clone(),
                                error: format!("Failed to delete: {:?}", e),
                            }),
                        }
                    }
                }
                Err(e) => {
                    errors.push(CopyMoveError {
                        source_key: source_key.clone(),
                        error: format!("Failed to copy: {:?}", e),
                    });
                }
            }
        }
    }

    Ok(CopyMoveResult {
        objects_copied,
        objects_deleted,
        errors,
    })
}

/// Copy or move objects across buckets (same or different accounts)
#[tauri::command(rename_all = "camelCase")]
pub async fn copy_objects_across_buckets(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    source_account_id: String,
    source_bucket: String,
    dest_account_id: String,
    dest_bucket: String,
    source_keys: Vec<String>,
    destination_prefix: String,
    delete_source: bool,
) -> Result<CopyMoveResult, AppError> {
    let source_account = credentials.get_account(&source_account_id)?;
    let source_secret = credentials.get_secret_key(&source_account_id)?;
    let source_client = s3_clients
        .get_or_create_client(
            &source_account_id,
            &source_account.endpoint,
            &source_account.access_key_id,
            &source_secret,
        )
        .await?;

    let dest_account = credentials.get_account(&dest_account_id)?;
    let dest_secret = credentials.get_secret_key(&dest_account_id)?;
    let dest_client = s3_clients
        .get_or_create_client(
            &dest_account_id,
            &dest_account.endpoint,
            &dest_account.access_key_id,
            &dest_secret,
        )
        .await?;

    let mut objects_copied = 0;
    let mut objects_deleted = 0;
    let mut errors: Vec<CopyMoveError> = Vec::new();

    // Check if same account and bucket - can use S3 copy
    let same_account = source_account_id == dest_account_id;
    let same_bucket = source_bucket == dest_bucket;

    for source_key in &source_keys {
        let is_folder = source_key.ends_with('/');

        if is_folder {
            // For folders, copy all objects recursively
            let mut continuation_token: Option<String> = None;

            loop {
                let mut request = source_client
                    .list_objects_v2()
                    .bucket(&source_bucket)
                    .prefix(source_key);

                if let Some(token) = &continuation_token {
                    request = request.continuation_token(token);
                }

                let response = match request.send().await {
                    Ok(r) => r,
                    Err(e) => {
                        errors.push(CopyMoveError {
                            source_key: source_key.clone(),
                            error: format!("Failed to list folder: {:?}", e),
                        });
                        break;
                    }
                };

                for obj in response.contents() {
                    if let Some(obj_key) = obj.key() {
                        // Get the relative path within the folder
                        let folder_name = source_key
                            .trim_end_matches('/')
                            .split('/')
                            .last()
                            .unwrap_or("");
                        let relative_path = obj_key.strip_prefix(source_key).unwrap_or(obj_key);
                        let dest_key =
                            format!("{}{}/{}", destination_prefix, folder_name, relative_path);

                        let result = if same_account {
                            // Same account: use S3 copy
                            let copy_source = format!(
                                "{}/{}",
                                source_bucket,
                                urlencoding::encode(obj_key)
                            );
                            dest_client
                                .copy_object()
                                .bucket(&dest_bucket)
                                .key(&dest_key)
                                .copy_source(&copy_source)
                                .send()
                                .await
                                .map(|_| ())
                                .map_err(|e| format!("{:?}", e))
                        } else {
                            // Different accounts: download and upload
                            copy_via_download_upload(
                                &source_client,
                                &dest_client,
                                &source_bucket,
                                &dest_bucket,
                                obj_key,
                                &dest_key,
                            )
                            .await
                        };

                        match result {
                            Ok(_) => {
                                objects_copied += 1;

                                // Delete source if moving
                                if delete_source {
                                    match source_client
                                        .delete_object()
                                        .bucket(&source_bucket)
                                        .key(obj_key)
                                        .send()
                                        .await
                                    {
                                        Ok(_) => objects_deleted += 1,
                                        Err(e) => errors.push(CopyMoveError {
                                            source_key: obj_key.to_string(),
                                            error: format!("Failed to delete: {:?}", e),
                                        }),
                                    }
                                }
                            }
                            Err(e) => {
                                errors.push(CopyMoveError {
                                    source_key: obj_key.to_string(),
                                    error: format!("Failed to copy: {}", e),
                                });
                            }
                        }
                    }
                }

                if response.is_truncated() == Some(true) {
                    continuation_token = response.next_continuation_token().map(|s| s.to_string());
                } else {
                    break;
                }
            }
        } else {
            // For single files
            let file_name = source_key.split('/').last().unwrap_or(source_key);
            let dest_key = format!("{}{}", destination_prefix, file_name);

            let result = if same_account {
                // Same account: use S3 copy
                let copy_source = format!(
                    "{}/{}",
                    source_bucket,
                    urlencoding::encode(source_key)
                );
                dest_client
                    .copy_object()
                    .bucket(&dest_bucket)
                    .key(&dest_key)
                    .copy_source(&copy_source)
                    .send()
                    .await
                    .map(|_| ())
                    .map_err(|e| format!("{:?}", e))
            } else {
                // Different accounts: download and upload
                copy_via_download_upload(
                    &source_client,
                    &dest_client,
                    &source_bucket,
                    &dest_bucket,
                    source_key,
                    &dest_key,
                )
                .await
            };

            match result {
                Ok(_) => {
                    objects_copied += 1;

                    // Delete source if moving
                    if delete_source {
                        match source_client
                            .delete_object()
                            .bucket(&source_bucket)
                            .key(source_key)
                            .send()
                            .await
                        {
                            Ok(_) => objects_deleted += 1,
                            Err(e) => errors.push(CopyMoveError {
                                source_key: source_key.clone(),
                                error: format!("Failed to delete: {:?}", e),
                            }),
                        }
                    }
                }
                Err(e) => {
                    errors.push(CopyMoveError {
                        source_key: source_key.clone(),
                        error: format!("Failed to copy: {}", e),
                    });
                }
            }
        }
    }

    Ok(CopyMoveResult {
        objects_copied,
        objects_deleted,
        errors,
    })
}

/// Helper function to copy an object by downloading from source and uploading to destination
async fn copy_via_download_upload(
    source_client: &aws_sdk_s3::Client,
    dest_client: &aws_sdk_s3::Client,
    source_bucket: &str,
    dest_bucket: &str,
    source_key: &str,
    dest_key: &str,
) -> Result<(), String> {
    // Download from source
    let response = source_client
        .get_object()
        .bucket(source_bucket)
        .key(source_key)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {:?}", e))?;

    let content_type = response
        .content_type()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    let body = response
        .body
        .collect()
        .await
        .map_err(|e| format!("Failed to read body: {:?}", e))?;

    // Upload to destination
    dest_client
        .put_object()
        .bucket(dest_bucket)
        .key(dest_key)
        .body(aws_sdk_s3::primitives::ByteStream::from(body.into_bytes()))
        .content_type(&content_type)
        .send()
        .await
        .map_err(|e| format!("Failed to upload: {:?}", e))?;

    Ok(())
}

// Folder download event types
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDownloadProgress {
    pub download_id: String,
    pub files_processed: usize,
    pub total_files: usize,
    pub bytes_downloaded: u64,
}

/// Download a folder as a ZIP file
#[tauri::command(rename_all = "camelCase")]
pub async fn download_folder(
    app: AppHandle,
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    prefix: String,
    destination: String,
    download_id: String,
) -> Result<String, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    // List all objects with this prefix
    let mut all_objects: Vec<(String, i64)> = Vec::new();
    let mut continuation_token: Option<String> = None;

    loop {
        let mut request = client.list_objects_v2().bucket(&bucket).prefix(&prefix);

        if let Some(token) = &continuation_token {
            request = request.continuation_token(token);
        }

        let response = request.send().await?;

        for obj in response.contents() {
            if let Some(key) = obj.key() {
                // Skip folder markers (keys ending with /)
                if !key.ends_with('/') {
                    all_objects.push((key.to_string(), obj.size().unwrap_or(0)));
                }
            }
        }

        if response.is_truncated() == Some(true) {
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    if all_objects.is_empty() {
        return Err(AppError::InvalidInput("Folder is empty".into()));
    }

    let total_files = all_objects.len();

    // Create ZIP file name from folder name
    let folder_name = prefix
        .trim_end_matches('/')
        .split('/')
        .last()
        .unwrap_or("folder");
    let zip_filename = format!("{}.zip", folder_name);
    let zip_path = PathBuf::from(&destination).join(&zip_filename);

    // Create the ZIP file
    let zip_file = std::fs::File::create(&zip_path)
        .map_err(|e| AppError::InvalidInput(format!("Failed to create ZIP file: {}", e)))?;
    let mut zip = zip::ZipWriter::new(zip_file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));

    let mut files_processed = 0usize;
    let mut bytes_downloaded = 0u64;

    for (object_key, _size) in &all_objects {
        // Get the object from S3
        let response = match client.get_object().bucket(&bucket).key(object_key).send().await {
            Ok(r) => r,
            Err(e) => {
                // Log error but continue with other files
                log::warn!("Failed to download {}: {:?}", object_key, e);
                continue;
            }
        };

        let body = match response.body.collect().await {
            Ok(b) => b.into_bytes(),
            Err(e) => {
                log::warn!("Failed to read body for {}: {:?}", object_key, e);
                continue;
            }
        };

        bytes_downloaded += body.len() as u64;

        // Calculate path within ZIP (strip the prefix)
        let relative_path = object_key.strip_prefix(&prefix).unwrap_or(object_key);

        // Add file to ZIP
        if let Err(e) = zip.start_file(relative_path, options) {
            log::warn!("Failed to start file in ZIP {}: {:?}", relative_path, e);
            continue;
        }

        if let Err(e) = zip.write_all(&body) {
            log::warn!("Failed to write to ZIP {}: {:?}", relative_path, e);
            continue;
        }

        files_processed += 1;

        // Emit progress
        let _ = app.emit(
            "folder-download-progress",
            FolderDownloadProgress {
                download_id: download_id.clone(),
                files_processed,
                total_files,
                bytes_downloaded,
            },
        );
    }

    // Finalize ZIP
    zip.finish()
        .map_err(|e| AppError::InvalidInput(format!("Failed to finalize ZIP: {}", e)))?;

    let final_path = zip_path.to_string_lossy().to_string();

    // Emit completed
    let _ = app.emit(
        "download-completed",
        DownloadCompleted {
            download_id,
            key: prefix,
            path: final_path.clone(),
        },
    );

    Ok(final_path)
}
