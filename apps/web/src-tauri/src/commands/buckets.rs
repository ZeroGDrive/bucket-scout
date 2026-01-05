use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::provider::ProviderType;
use crate::s3::client::S3ClientManager;
use aws_sdk_s3::types::{
    BucketLocationConstraint, CreateBucketConfiguration, ObjectIdentifier,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub name: String,
    pub creation_date: Option<String>,
}

/// Validates S3 bucket name according to AWS naming rules
fn validate_bucket_name(name: &str) -> Result<(), AppError> {
    if name.len() < 3 || name.len() > 63 {
        return Err(AppError::InvalidInput(
            "Bucket name must be 3-63 characters".into(),
        ));
    }

    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.')
    {
        return Err(AppError::InvalidInput(
            "Bucket name can only contain lowercase letters, numbers, hyphens, and periods".into(),
        ));
    }

    if name.starts_with('-') || name.ends_with('-') {
        return Err(AppError::InvalidInput(
            "Bucket name cannot start or end with a hyphen".into(),
        ));
    }

    if name.starts_with('.') || name.ends_with('.') {
        return Err(AppError::InvalidInput(
            "Bucket name cannot start or end with a period".into(),
        ));
    }

    // Check for IP address-like names
    if name.chars().filter(|&c| c == '.').count() == 3
        && name.split('.').all(|part| part.parse::<u8>().is_ok())
    {
        return Err(AppError::InvalidInput(
            "Bucket name cannot be formatted as an IP address".into(),
        ));
    }

    Ok(())
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
        .get_or_create_client(
            &account_id,
            &account.endpoint,
            &account.access_key_id,
            &secret,
            account.provider_type,
            account.region.as_deref(),
        )
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

#[tauri::command(rename_all = "camelCase")]
pub async fn create_bucket(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket_name: String,
    location: Option<String>, // R2 location hint (wnam, enam, etc.) or AWS region
) -> Result<(), AppError> {
    // Validate bucket name
    validate_bucket_name(&bucket_name)?;

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

    let mut request = client.create_bucket().bucket(&bucket_name);

    // Handle location constraint based on provider
    match account.provider_type {
        ProviderType::AwsS3 => {
            // AWS S3 requires location constraint for non-us-east-1 regions
            if let Some(loc) = &location {
                if loc != "us-east-1" {
                    let constraint = BucketLocationConstraint::from(loc.as_str());
                    let config = CreateBucketConfiguration::builder()
                        .location_constraint(constraint)
                        .build();
                    request = request.create_bucket_configuration(config);
                }
            } else if let Some(region) = &account.region {
                if region != "us-east-1" {
                    let constraint = BucketLocationConstraint::from(region.as_str());
                    let config = CreateBucketConfiguration::builder()
                        .location_constraint(constraint)
                        .build();
                    request = request.create_bucket_configuration(config);
                }
            }
        }
        ProviderType::CloudflareR2 => {
            // R2 uses location hints via custom header
            // Unfortunately, AWS SDK doesn't support custom headers easily here
            // R2 will use automatic location if not specified
            // For now, location hint would need to be set via Cloudflare API
        }
    }

    request.send().await?;

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_bucket(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket_name: String,
    force: bool, // If true, delete all objects first
) -> Result<(), AppError> {
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

    if force {
        // Delete all objects in the bucket first
        delete_all_objects(&client, &bucket_name).await?;
    }

    client.delete_bucket().bucket(&bucket_name).send().await?;

    Ok(())
}

/// Helper to delete all objects in a bucket
async fn delete_all_objects(
    client: &aws_sdk_s3::Client,
    bucket: &str,
) -> Result<(), AppError> {
    let mut continuation_token: Option<String> = None;

    loop {
        let mut request = client.list_objects_v2().bucket(bucket);

        if let Some(token) = continuation_token {
            request = request.continuation_token(token);
        }

        let response = request.send().await?;

        let objects: Vec<ObjectIdentifier> = response
            .contents()
            .iter()
            .filter_map(|obj| {
                obj.key().map(|key| {
                    ObjectIdentifier::builder()
                        .key(key)
                        .build()
                        .expect("key is required")
                })
            })
            .collect();

        if !objects.is_empty() {
            // Delete in batches of 1000 (S3 limit)
            for chunk in objects.chunks(1000) {
                let delete = aws_sdk_s3::types::Delete::builder()
                    .set_objects(Some(chunk.to_vec()))
                    .build()
                    .map_err(|e| AppError::S3(format!("Failed to build delete request: {}", e)))?;

                client
                    .delete_objects()
                    .bucket(bucket)
                    .delete(delete)
                    .send()
                    .await?;
            }
        }

        if response.is_truncated() == Some(true) {
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(())
}
