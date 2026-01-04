use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use serde::Serialize;
use tauri::State;

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
