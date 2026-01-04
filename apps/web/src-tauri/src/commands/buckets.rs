use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub name: String,
    pub creation_date: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_buckets(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
) -> Result<Vec<Bucket>, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(&account_id, &account.endpoint, &account.access_key_id, &secret)
        .await?;

    let response = client.list_buckets().send().await?;

    let buckets = response
        .buckets()
        .iter()
        .filter_map(|b| {
            b.name().map(|name| Bucket {
                name: name.to_string(),
                creation_date: b.creation_date().map(|d| d.to_string()),
            })
        })
        .collect();

    Ok(buckets)
}
