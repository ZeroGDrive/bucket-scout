use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
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

    Ok(ObjectMetadata {
        key: key.clone(),
        size: response.content_length().unwrap_or(0),
        content_type: response.content_type().map(|s| s.to_string()),
        last_modified: response.last_modified().map(|d| d.to_string()),
        etag: response.e_tag().map(|e| e.trim_matches('"').to_string()),
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
