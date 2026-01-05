use crate::credentials::{Account, CredentialsManager};
use crate::error::AppError;
use crate::provider::ProviderType;
use crate::s3::client::S3ClientManager;
use tauri::State;

#[tauri::command(rename_all = "camelCase")]
pub async fn add_account(
    credentials: State<'_, CredentialsManager>,
    name: String,
    endpoint: String,
    access_key_id: String,
    secret_access_key: String,
    provider_type: ProviderType,
    cloudflare_account_id: Option<String>,
    region: Option<String>,
) -> Result<Account, AppError> {
    credentials.add_account(
        name,
        endpoint,
        access_key_id,
        secret_access_key,
        provider_type,
        cloudflare_account_id,
        region,
    )
}

#[tauri::command]
pub async fn list_accounts(
    credentials: State<'_, CredentialsManager>,
) -> Result<Vec<Account>, AppError> {
    credentials.list_accounts()
}

#[tauri::command]
pub async fn get_account(
    credentials: State<'_, CredentialsManager>,
    id: String,
) -> Result<Account, AppError> {
    credentials.get_account(&id)
}

#[tauri::command]
pub async fn remove_account(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    id: String,
) -> Result<(), AppError> {
    // Remove from S3 client cache
    s3_clients.remove_client(&id);
    // Remove from credentials store
    credentials.remove_account(&id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_account(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    id: String,
    name: Option<String>,
    endpoint: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
    provider_type: Option<ProviderType>,
    cloudflare_account_id: Option<String>,
    region: Option<String>,
) -> Result<Account, AppError> {
    // Invalidate cached S3 client if credentials or provider config changed
    if access_key_id.is_some()
        || secret_access_key.is_some()
        || endpoint.is_some()
        || provider_type.is_some()
        || region.is_some()
    {
        s3_clients.remove_client(&id);
    }

    credentials.update_account(
        &id,
        name,
        endpoint,
        access_key_id,
        secret_access_key,
        provider_type,
        cloudflare_account_id,
        region,
    )
}

#[tauri::command]
pub async fn test_connection(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    id: String,
) -> Result<bool, AppError> {
    let account = credentials.get_account(&id)?;
    let secret = credentials.get_secret_key(&id)?;

    let client = s3_clients
        .get_or_create_client(
            &id,
            &account.endpoint,
            &account.access_key_id,
            &secret,
            account.provider_type,
            account.region.as_deref(),
        )
        .await?;

    // Try to list buckets as a connection test
    match client.list_buckets().send().await {
        Ok(_) => Ok(true),
        Err(e) => Err(AppError::S3(format!("Connection test failed: {:?}", e))),
    }
}
