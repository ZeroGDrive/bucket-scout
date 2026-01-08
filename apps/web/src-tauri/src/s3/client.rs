use crate::error::{AppError, Result};
use crate::provider::ProviderType;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region};
use aws_sdk_s3::Client;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Cache key for S3 clients - either account-level or bucket-specific
#[derive(Hash, Eq, PartialEq, Clone)]
struct ClientCacheKey {
    account_id: String,
    bucket: Option<String>,
    region: Option<String>,
}

pub struct S3ClientManager {
    /// Client cache keyed by (account_id, bucket, region)
    clients: RwLock<HashMap<ClientCacheKey, Arc<Client>>>,
    /// Cached bucket regions: (account_id, bucket) -> region
    bucket_regions: RwLock<HashMap<(String, String), String>>,
    /// Credentials cache for creating new clients
    credentials_cache: RwLock<HashMap<String, StoredCredentials>>,
}

struct StoredCredentials {
    endpoint: String,
    access_key_id: String,
    secret_access_key: String,
    provider_type: ProviderType,
    default_region: Option<String>,
}

impl S3ClientManager {
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
            bucket_regions: RwLock::new(HashMap::new()),
            credentials_cache: RwLock::new(HashMap::new()),
        }
    }

    /// Get or create a client for an account (used for account-level operations like list_buckets)
    pub async fn get_or_create_client(
        &self,
        account_id: &str,
        endpoint: &str,
        access_key_id: &str,
        secret_access_key: &str,
        provider_type: ProviderType,
        region: Option<&str>,
    ) -> Result<Arc<Client>> {
        let cache_key = ClientCacheKey {
            account_id: account_id.to_string(),
            bucket: None,
            region: region.map(|s| s.to_string()),
        };

        // Check if client exists in cache
        {
            let clients = self.clients.read().await;
            if let Some(client) = clients.get(&cache_key) {
                return Ok(client.clone());
            }
        }

        // Store credentials for future use
        {
            let mut creds = self.credentials_cache.write().await;
            creds.insert(
                account_id.to_string(),
                StoredCredentials {
                    endpoint: endpoint.to_string(),
                    access_key_id: access_key_id.to_string(),
                    secret_access_key: secret_access_key.to_string(),
                    provider_type,
                    default_region: region.map(|s| s.to_string()),
                },
            );
        }

        // Create new client
        let client = self
            .create_client(endpoint, access_key_id, secret_access_key, provider_type, region)
            .await?;
        let client = Arc::new(client);

        // Cache the client
        {
            let mut clients = self.clients.write().await;
            clients.insert(cache_key, client.clone());
        }

        Ok(client)
    }

    /// Get or create a client for a specific bucket, handling region detection
    pub async fn get_or_create_bucket_client(
        &self,
        account_id: &str,
        bucket: &str,
        endpoint: &str,
        access_key_id: &str,
        secret_access_key: &str,
        provider_type: ProviderType,
        region: Option<&str>,
    ) -> Result<Arc<Client>> {
        // For non-AWS providers, just use the regular client
        if provider_type != ProviderType::AwsS3 {
            return self
                .get_or_create_client(
                    account_id,
                    endpoint,
                    access_key_id,
                    secret_access_key,
                    provider_type,
                    region,
                )
                .await;
        }

        // Check if we have a cached region for this bucket
        let bucket_region = {
            let regions = self.bucket_regions.read().await;
            regions
                .get(&(account_id.to_string(), bucket.to_string()))
                .cloned()
        };

        // If we have a cached region, use it
        let effective_region = bucket_region.as_deref().or(region);

        let cache_key = ClientCacheKey {
            account_id: account_id.to_string(),
            bucket: Some(bucket.to_string()),
            region: effective_region.map(|s| s.to_string()),
        };

        // Check if bucket-specific client exists in cache
        {
            let clients = self.clients.read().await;
            if let Some(client) = clients.get(&cache_key) {
                return Ok(client.clone());
            }
        }

        // Store credentials for future use
        {
            let mut creds = self.credentials_cache.write().await;
            creds.insert(
                account_id.to_string(),
                StoredCredentials {
                    endpoint: endpoint.to_string(),
                    access_key_id: access_key_id.to_string(),
                    secret_access_key: secret_access_key.to_string(),
                    provider_type,
                    default_region: region.map(|s| s.to_string()),
                },
            );
        }

        // Create client
        let client = self
            .create_client(
                endpoint,
                access_key_id,
                secret_access_key,
                provider_type,
                effective_region,
            )
            .await?;
        let client = Arc::new(client);

        // Cache the client
        {
            let mut clients = self.clients.write().await;
            clients.insert(cache_key, client.clone());
        }

        Ok(client)
    }

    /// Store bucket region after detection (called when a redirect error occurs)
    pub async fn cache_bucket_region(&self, account_id: &str, bucket: &str, region: &str) {
        let mut regions = self.bucket_regions.write().await;
        regions.insert(
            (account_id.to_string(), bucket.to_string()),
            region.to_string(),
        );

        // Also remove any old cached client for this bucket (it has wrong region)
        let mut clients = self.clients.write().await;
        clients.retain(|key, _| {
            !(key.account_id == account_id && key.bucket.as_deref() == Some(bucket))
        });
    }

    /// Create a client with a specific region (for retry after redirect)
    pub async fn create_client_with_region(
        &self,
        account_id: &str,
        bucket: &str,
        region: &str,
    ) -> Result<Arc<Client>> {
        // Get stored credentials
        let creds = {
            let cache = self.credentials_cache.read().await;
            cache.get(account_id).cloned()
        };

        let creds = creds.ok_or_else(|| {
            AppError::Credential("No cached credentials for account".to_string())
        })?;

        // Cache the bucket region for future use
        self.cache_bucket_region(account_id, bucket, region).await;

        // Create client with the correct region
        let client = self
            .create_client(
                &creds.endpoint,
                &creds.access_key_id,
                &creds.secret_access_key,
                creds.provider_type,
                Some(region),
            )
            .await?;
        let client = Arc::new(client);

        // Cache the client
        let cache_key = ClientCacheKey {
            account_id: account_id.to_string(),
            bucket: Some(bucket.to_string()),
            region: Some(region.to_string()),
        };
        {
            let mut clients = self.clients.write().await;
            clients.insert(cache_key, client.clone());
        }

        Ok(client)
    }

    async fn create_client(
        &self,
        endpoint: &str,
        access_key_id: &str,
        secret_access_key: &str,
        provider_type: ProviderType,
        region: Option<&str>,
    ) -> Result<Client> {
        let credentials = Credentials::new(
            access_key_id,
            secret_access_key,
            None, // session token
            None, // expiration
            "bucketscout",
        );

        // Use provided region or default for the provider
        let region_str = region.unwrap_or(provider_type.default_region());

        let mut config_builder = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(region_str.to_string()))
            .credentials_provider(credentials)
            .force_path_style(provider_type.force_path_style());

        // Only set endpoint for providers that need it (R2, MinIO, etc.)
        // AWS S3 uses the default endpoint based on region
        if !endpoint.is_empty() {
            config_builder = config_builder.endpoint_url(endpoint);
        }

        Ok(Client::from_conf(config_builder.build()))
    }

    pub fn remove_client(&self, account_id: &str) {
        // Use blocking removal since this is called from sync context
        // This is safe because we're just removing from the HashMap
        if let Ok(mut clients) = self.clients.try_write() {
            clients.retain(|key, _| key.account_id != account_id);
        }
        if let Ok(mut regions) = self.bucket_regions.try_write() {
            regions.retain(|(aid, _), _| aid != account_id);
        }
        if let Ok(mut creds) = self.credentials_cache.try_write() {
            creds.remove(account_id);
        }
    }
}

impl Clone for StoredCredentials {
    fn clone(&self) -> Self {
        Self {
            endpoint: self.endpoint.clone(),
            access_key_id: self.access_key_id.clone(),
            secret_access_key: self.secret_access_key.clone(),
            provider_type: self.provider_type,
            default_region: self.default_region.clone(),
        }
    }
}

impl Default for S3ClientManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Extract bucket region from a PermanentRedirect error
/// The region is typically in the x-amz-bucket-region header or in the error XML
pub fn extract_region_from_redirect_error(error_str: &str) -> Option<String> {
    // Try to extract from x-amz-bucket-region header
    if let Some(start) = error_str.find("x-amz-bucket-region") {
        // Format: "x-amz-bucket-region": HeaderValue { _private: H1("eu-north-1") }
        if let Some(region_start) = error_str[start..].find("H1(\"") {
            let region_begin = start + region_start + 4;
            if let Some(region_end) = error_str[region_begin..].find("\")") {
                let region = &error_str[region_begin..region_begin + region_end];
                return Some(region.to_string());
            }
        }
    }

    // Try to extract from Endpoint in error XML
    // Format: <Endpoint>bucket-name.s3.eu-north-1.amazonaws.com</Endpoint>
    if let Some(start) = error_str.find("<Endpoint>") {
        let endpoint_start = start + 10;
        if let Some(end) = error_str[endpoint_start..].find("</Endpoint>") {
            let endpoint = &error_str[endpoint_start..endpoint_start + end];
            // Parse region from endpoint like "bucket.s3.eu-north-1.amazonaws.com"
            let parts: Vec<&str> = endpoint.split('.').collect();
            // Look for the region pattern (s3.{region}.amazonaws.com)
            for (i, part) in parts.iter().enumerate() {
                if *part == "s3" && i + 2 < parts.len() && parts[i + 2] == "amazonaws" {
                    return Some(parts[i + 1].to_string());
                }
            }
        }
    }

    None
}

/// Check if an error is a PermanentRedirect (301) that indicates wrong region
pub fn is_redirect_error(error_str: &str) -> bool {
    error_str.contains("PermanentRedirect")
        || (error_str.contains("301") && error_str.contains("x-amz-bucket-region"))
}
