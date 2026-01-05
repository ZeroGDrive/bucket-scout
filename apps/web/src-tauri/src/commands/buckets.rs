use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::provider::ProviderType;
use crate::s3::client::S3ClientManager;
use aws_sdk_s3::types::{
    BucketLocationConstraint, BucketVersioningStatus, CorsConfiguration, CorsRule,
    CreateBucketConfiguration, MfaDeleteStatus, ObjectIdentifier, VersioningConfiguration,
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

// ============================================================================
// Bucket Configuration Commands
// ============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketVersioningConfig {
    pub status: String,           // "Enabled", "Suspended", or "Disabled" (never enabled)
    pub mfa_delete: Option<String>, // "Enabled" or "Disabled"
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_bucket_versioning(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
) -> Result<BucketVersioningConfig, AppError> {
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

    let response = client
        .get_bucket_versioning()
        .bucket(&bucket)
        .send()
        .await?;

    let status = match response.status() {
        Some(BucketVersioningStatus::Enabled) => "Enabled",
        Some(BucketVersioningStatus::Suspended) => "Suspended",
        _ => "Disabled", // Never enabled
    };

    let mfa_delete = response.mfa_delete().map(|m| match m {
        MfaDeleteStatus::Enabled => "Enabled".to_string(),
        MfaDeleteStatus::Disabled => "Disabled".to_string(),
        _ => "Unknown".to_string(),
    });

    Ok(BucketVersioningConfig {
        status: status.to_string(),
        mfa_delete,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn put_bucket_versioning(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    enabled: bool,
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

    let status = if enabled {
        BucketVersioningStatus::Enabled
    } else {
        BucketVersioningStatus::Suspended
    };

    let config = VersioningConfiguration::builder().status(status).build();

    client
        .put_bucket_versioning()
        .bucket(&bucket)
        .versioning_configuration(config)
        .send()
        .await?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorsRuleConfig {
    pub allowed_headers: Vec<String>,
    pub allowed_methods: Vec<String>,
    pub allowed_origins: Vec<String>,
    pub expose_headers: Vec<String>,
    pub max_age_seconds: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketCorsConfig {
    pub rules: Vec<CorsRuleConfig>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_bucket_cors(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
) -> Result<BucketCorsConfig, AppError> {
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

    let response = match client.get_bucket_cors().bucket(&bucket).send().await {
        Ok(resp) => resp,
        Err(e) => {
            // NoSuchCORSConfiguration means CORS is not configured
            let error_str = format!("{:?}", e);
            if error_str.contains("NoSuchCORSConfiguration") || error_str.contains("NoSuchCors") {
                return Ok(BucketCorsConfig { rules: vec![] });
            }
            return Err(e.into());
        }
    };

    let rules = response
        .cors_rules()
        .iter()
        .map(|rule| CorsRuleConfig {
            allowed_headers: rule.allowed_headers().iter().map(|s| s.to_string()).collect(),
            allowed_methods: rule.allowed_methods().iter().map(|s| s.to_string()).collect(),
            allowed_origins: rule.allowed_origins().iter().map(|s| s.to_string()).collect(),
            expose_headers: rule.expose_headers().iter().map(|s| s.to_string()).collect(),
            max_age_seconds: rule.max_age_seconds(),
        })
        .collect();

    Ok(BucketCorsConfig { rules })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn put_bucket_cors(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    rules: Vec<CorsRuleConfig>,
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

    let cors_rules: Vec<CorsRule> = rules
        .into_iter()
        .map(|rule| {
            // Helper to filter empty strings and convert empty Vec to None
            // R2 doesn't like empty arrays or empty strings in XML
            let clean_vec = |v: Vec<String>| -> Option<Vec<String>> {
                let filtered: Vec<String> = v
                    .into_iter()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if filtered.is_empty() {
                    None
                } else {
                    Some(filtered)
                }
            };

            // R2 does NOT support wildcard "*" in AllowedHeaders - filter it out
            // See: https://community.cloudflare.com/t/problem-with-settings-cors-policies-on-r2/432339
            let clean_headers = |v: Vec<String>| -> Option<Vec<String>> {
                let filtered: Vec<String> = v
                    .into_iter()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty() && s != "*")
                    .collect();
                if filtered.is_empty() {
                    None
                } else {
                    Some(filtered)
                }
            };

            let allowed_headers = clean_headers(rule.allowed_headers);
            let allowed_methods = clean_vec(rule.allowed_methods);
            let allowed_origins = clean_vec(rule.allowed_origins);
            let expose_headers = clean_vec(rule.expose_headers);
            let max_age = rule.max_age_seconds;

            // Build CORS rule - only set optional fields if they have values
            // R2 is strict about XML format
            let mut builder = CorsRule::builder();

            // Required fields - must be set
            if let Some(origins) = allowed_origins {
                builder = builder.set_allowed_origins(Some(origins));
            }
            if let Some(methods) = allowed_methods {
                builder = builder.set_allowed_methods(Some(methods));
            }

            // Optional fields - only set if provided and non-empty
            if let Some(headers) = allowed_headers {
                builder = builder.set_allowed_headers(Some(headers));
            }
            if let Some(headers) = expose_headers {
                builder = builder.set_expose_headers(Some(headers));
            }
            if let Some(age) = max_age {
                builder = builder.set_max_age_seconds(Some(age));
            }

            builder.build().expect("CORS rule build should succeed")
        })
        .collect();

    let config = CorsConfiguration::builder()
        .set_cors_rules(Some(cors_rules))
        .build()
        .map_err(|e| AppError::S3(format!("Failed to build CORS config: {}", e)))?;

    client
        .put_bucket_cors()
        .bucket(&bucket)
        .cors_configuration(config)
        .send()
        .await?;

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_bucket_cors(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
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

    client.delete_bucket_cors().bucket(&bucket).send().await?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleRuleConfig {
    pub id: Option<String>,
    pub status: String, // "Enabled" or "Disabled"
    pub prefix: Option<String>,
    pub expiration_days: Option<i32>,
    pub noncurrent_version_expiration_days: Option<i32>,
    pub abort_incomplete_multipart_upload_days: Option<i32>,
    #[serde(default)]
    pub transitions: Vec<LifecycleTransition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleTransition {
    pub days: Option<i32>,
    pub storage_class: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketLifecycleConfig {
    pub rules: Vec<LifecycleRuleConfig>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_bucket_lifecycle(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
) -> Result<BucketLifecycleConfig, AppError> {
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

    let response = match client
        .get_bucket_lifecycle_configuration()
        .bucket(&bucket)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            // NoSuchLifecycleConfiguration means no lifecycle rules
            let error_str = format!("{:?}", e);
            if error_str.contains("NoSuchLifecycleConfiguration") {
                return Ok(BucketLifecycleConfig { rules: vec![] });
            }
            return Err(e.into());
        }
    };

    let rules = response
        .rules()
        .iter()
        .map(|rule| {
            let transitions = rule
                .transitions()
                .iter()
                .map(|t| LifecycleTransition {
                    days: t.days(),
                    storage_class: t.storage_class().map(|s| s.as_str().to_string()),
                })
                .collect();

            LifecycleRuleConfig {
                id: rule.id().map(|s| s.to_string()),
                status: rule.status().as_str().to_string(),
                prefix: rule
                    .filter()
                    .and_then(|f| f.prefix().map(|p| p.to_string())),
                expiration_days: rule.expiration().and_then(|e| e.days()),
                noncurrent_version_expiration_days: rule
                    .noncurrent_version_expiration()
                    .and_then(|e| e.noncurrent_days()),
                abort_incomplete_multipart_upload_days: rule
                    .abort_incomplete_multipart_upload()
                    .and_then(|a| a.days_after_initiation()),
                transitions,
            }
        })
        .collect();

    Ok(BucketLifecycleConfig { rules })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn put_bucket_lifecycle(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    rules: Vec<LifecycleRuleConfig>,
) -> Result<(), AppError> {
    use aws_sdk_s3::types::{
        AbortIncompleteMultipartUpload, BucketLifecycleConfiguration, ExpirationStatus,
        LifecycleExpiration, LifecycleRule, LifecycleRuleFilter, NoncurrentVersionExpiration,
    };

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

    let lifecycle_rules: Vec<LifecycleRule> = rules
        .into_iter()
        .map(|rule| {
            let status = if rule.status == "Enabled" {
                ExpirationStatus::Enabled
            } else {
                ExpirationStatus::Disabled
            };

            let mut builder = LifecycleRule::builder().status(status);

            if let Some(id) = rule.id {
                builder = builder.id(id);
            }

            // Set filter (prefix)
            if let Some(prefix) = rule.prefix {
                let filter = LifecycleRuleFilter::builder().prefix(prefix).build();
                builder = builder.filter(filter);
            }

            // Set expiration
            if let Some(days) = rule.expiration_days {
                builder = builder.expiration(
                    LifecycleExpiration::builder().days(days).build(),
                );
            }

            // Set noncurrent version expiration
            if let Some(days) = rule.noncurrent_version_expiration_days {
                builder = builder.noncurrent_version_expiration(
                    NoncurrentVersionExpiration::builder()
                        .noncurrent_days(days)
                        .build(),
                );
            }

            // Set abort incomplete multipart upload
            if let Some(days) = rule.abort_incomplete_multipart_upload_days {
                builder = builder.abort_incomplete_multipart_upload(
                    AbortIncompleteMultipartUpload::builder()
                        .days_after_initiation(days)
                        .build(),
                );
            }

            builder.build().expect("LifecycleRule build should succeed")
        })
        .collect();

    let config = BucketLifecycleConfiguration::builder()
        .set_rules(Some(lifecycle_rules))
        .build()
        .map_err(|e| AppError::S3(format!("Failed to build lifecycle config: {}", e)))?;

    client
        .put_bucket_lifecycle_configuration()
        .bucket(&bucket)
        .lifecycle_configuration(config)
        .send()
        .await?;

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_bucket_lifecycle(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
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

    client
        .delete_bucket_lifecycle()
        .bucket(&bucket)
        .send()
        .await?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketEncryptionConfig {
    pub sse_algorithm: Option<String>, // "AES256" or "aws:kms"
    pub kms_master_key_id: Option<String>,
    pub bucket_key_enabled: Option<bool>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_bucket_encryption(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
) -> Result<BucketEncryptionConfig, AppError> {
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

    let response = match client.get_bucket_encryption().bucket(&bucket).send().await {
        Ok(resp) => resp,
        Err(e) => {
            // ServerSideEncryptionConfigurationNotFoundError means no encryption config
            let error_str = format!("{:?}", e);
            if error_str.contains("ServerSideEncryptionConfigurationNotFoundError")
                || error_str.contains("NoSuchEncryption")
            {
                return Ok(BucketEncryptionConfig {
                    sse_algorithm: None,
                    kms_master_key_id: None,
                    bucket_key_enabled: None,
                });
            }
            return Err(e.into());
        }
    };

    // Get the first rule (typically there's only one)
    let config = response
        .server_side_encryption_configuration()
        .and_then(|c| c.rules().first())
        .and_then(|r| r.apply_server_side_encryption_by_default())
        .map(|default| BucketEncryptionConfig {
            sse_algorithm: Some(default.sse_algorithm().as_str().to_string()),
            kms_master_key_id: default.kms_master_key_id().map(|k| k.to_string()),
            bucket_key_enabled: response
                .server_side_encryption_configuration()
                .and_then(|c| c.rules().first())
                .and_then(|r| r.bucket_key_enabled()),
        })
        .unwrap_or(BucketEncryptionConfig {
            sse_algorithm: None,
            kms_master_key_id: None,
            bucket_key_enabled: None,
        });

    Ok(config)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketLoggingConfig {
    pub logging_enabled: bool,
    pub target_bucket: Option<String>,
    pub target_prefix: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_bucket_logging(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
) -> Result<BucketLoggingConfig, AppError> {
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

    let response = client.get_bucket_logging().bucket(&bucket).send().await?;

    let config = match response.logging_enabled() {
        Some(log) => BucketLoggingConfig {
            logging_enabled: true,
            target_bucket: Some(log.target_bucket().to_string()),
            target_prefix: Some(log.target_prefix().to_string()),
        },
        None => BucketLoggingConfig {
            logging_enabled: false,
            target_bucket: None,
            target_prefix: None,
        },
    };

    Ok(config)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketConfigSummary {
    pub versioning: BucketVersioningConfig,
    pub cors: BucketCorsConfig,
    pub lifecycle: BucketLifecycleConfig,
    pub encryption: BucketEncryptionConfig,
    pub logging: BucketLoggingConfig,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_bucket_config(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
) -> Result<BucketConfigSummary, AppError> {
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

    // Fetch all configurations in parallel using tokio::join!
    // Handle "NotImplemented" errors gracefully for providers like R2
    let (versioning_result, cors_result, lifecycle_result, encryption_result, logging_result) =
        tokio::join!(
            async {
                match client.get_bucket_versioning().bucket(&bucket).send().await {
                    Ok(resp) => {
                        let status = match resp.status() {
                            Some(BucketVersioningStatus::Enabled) => "Enabled",
                            Some(BucketVersioningStatus::Suspended) => "Suspended",
                            _ => "Disabled",
                        };
                        let mfa_delete = resp.mfa_delete().map(|m| match m {
                            MfaDeleteStatus::Enabled => "Enabled".to_string(),
                            MfaDeleteStatus::Disabled => "Disabled".to_string(),
                            _ => "Unknown".to_string(),
                        });
                        Ok::<_, AppError>(BucketVersioningConfig {
                            status: status.to_string(),
                            mfa_delete,
                        })
                    }
                    Err(e) => {
                        let error_str = format!("{:?}", e);
                        if error_str.contains("NotImplemented") {
                            // R2 and some providers don't support versioning API
                            Ok(BucketVersioningConfig {
                                status: "Unsupported".to_string(),
                                mfa_delete: None,
                            })
                        } else {
                            Err(e.into())
                        }
                    }
                }
            },
            async {
                match client.get_bucket_cors().bucket(&bucket).send().await {
                    Ok(resp) => {
                        let rules = resp
                            .cors_rules()
                            .iter()
                            .map(|rule| CorsRuleConfig {
                                allowed_headers: rule
                                    .allowed_headers()
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect(),
                                allowed_methods: rule
                                    .allowed_methods()
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect(),
                                allowed_origins: rule
                                    .allowed_origins()
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect(),
                                expose_headers: rule
                                    .expose_headers()
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect(),
                                max_age_seconds: rule.max_age_seconds(),
                            })
                            .collect();
                        Ok::<_, AppError>(BucketCorsConfig { rules })
                    }
                    Err(e) => {
                        let error_str = format!("{:?}", e);
                        if error_str.contains("NoSuchCORSConfiguration")
                            || error_str.contains("NoSuchCors")
                            || error_str.contains("NotImplemented")
                        {
                            Ok(BucketCorsConfig { rules: vec![] })
                        } else {
                            Err(e.into())
                        }
                    }
                }
            },
            async {
                match client
                    .get_bucket_lifecycle_configuration()
                    .bucket(&bucket)
                    .send()
                    .await
                {
                    Ok(resp) => {
                        let rules = resp
                            .rules()
                            .iter()
                            .map(|rule| {
                                let transitions = rule
                                    .transitions()
                                    .iter()
                                    .map(|t| LifecycleTransition {
                                        days: t.days(),
                                        storage_class: t
                                            .storage_class()
                                            .map(|s| s.as_str().to_string()),
                                    })
                                    .collect();
                                LifecycleRuleConfig {
                                    id: rule.id().map(|s| s.to_string()),
                                    status: rule.status().as_str().to_string(),
                                    prefix: rule
                                        .filter()
                                        .and_then(|f| f.prefix().map(|p| p.to_string())),
                                    expiration_days: rule.expiration().and_then(|e| e.days()),
                                    noncurrent_version_expiration_days: rule
                                        .noncurrent_version_expiration()
                                        .and_then(|e| e.noncurrent_days()),
                                    abort_incomplete_multipart_upload_days: rule
                                        .abort_incomplete_multipart_upload()
                                        .and_then(|a| a.days_after_initiation()),
                                    transitions,
                                }
                            })
                            .collect();
                        Ok::<_, AppError>(BucketLifecycleConfig { rules })
                    }
                    Err(e) => {
                        let error_str = format!("{:?}", e);
                        if error_str.contains("NoSuchLifecycleConfiguration")
                            || error_str.contains("NotImplemented")
                        {
                            Ok(BucketLifecycleConfig { rules: vec![] })
                        } else {
                            Err(e.into())
                        }
                    }
                }
            },
            async {
                match client.get_bucket_encryption().bucket(&bucket).send().await {
                    Ok(resp) => {
                        let config = resp
                            .server_side_encryption_configuration()
                            .and_then(|c| c.rules().first())
                            .and_then(|r| r.apply_server_side_encryption_by_default())
                            .map(|default| BucketEncryptionConfig {
                                sse_algorithm: Some(default.sse_algorithm().as_str().to_string()),
                                kms_master_key_id: default
                                    .kms_master_key_id()
                                    .map(|k| k.to_string()),
                                bucket_key_enabled: resp
                                    .server_side_encryption_configuration()
                                    .and_then(|c| c.rules().first())
                                    .and_then(|r| r.bucket_key_enabled()),
                            })
                            .unwrap_or(BucketEncryptionConfig {
                                sse_algorithm: None,
                                kms_master_key_id: None,
                                bucket_key_enabled: None,
                            });
                        Ok::<_, AppError>(config)
                    }
                    Err(e) => {
                        let error_str = format!("{:?}", e);
                        if error_str.contains("ServerSideEncryptionConfigurationNotFoundError")
                            || error_str.contains("NoSuchEncryption")
                            || error_str.contains("NotImplemented")
                        {
                            Ok(BucketEncryptionConfig {
                                sse_algorithm: None,
                                kms_master_key_id: None,
                                bucket_key_enabled: None,
                            })
                        } else {
                            Err(e.into())
                        }
                    }
                }
            },
            async {
                match client.get_bucket_logging().bucket(&bucket).send().await {
                    Ok(resp) => {
                        let config = match resp.logging_enabled() {
                            Some(log) => BucketLoggingConfig {
                                logging_enabled: true,
                                target_bucket: Some(log.target_bucket().to_string()),
                                target_prefix: Some(log.target_prefix().to_string()),
                            },
                            None => BucketLoggingConfig {
                                logging_enabled: false,
                                target_bucket: None,
                                target_prefix: None,
                            },
                        };
                        Ok::<_, AppError>(config)
                    }
                    Err(e) => {
                        let error_str = format!("{:?}", e);
                        if error_str.contains("NotImplemented") {
                            Ok(BucketLoggingConfig {
                                logging_enabled: false,
                                target_bucket: None,
                                target_prefix: None,
                            })
                        } else {
                            Err(e.into())
                        }
                    }
                }
            }
        );

    Ok(BucketConfigSummary {
        versioning: versioning_result?,
        cors: cors_result?,
        lifecycle: lifecycle_result?,
        encryption: encryption_result?,
        logging: logging_result?,
    })
}
