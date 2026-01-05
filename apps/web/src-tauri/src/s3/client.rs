use crate::error::Result;
use crate::provider::ProviderType;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region};
use aws_sdk_s3::Client;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct S3ClientManager {
    clients: RwLock<HashMap<String, Arc<Client>>>,
}

impl S3ClientManager {
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
        }
    }

    pub async fn get_or_create_client(
        &self,
        account_id: &str,
        endpoint: &str,
        access_key_id: &str,
        secret_access_key: &str,
        provider_type: ProviderType,
        region: Option<&str>,
    ) -> Result<Arc<Client>> {
        // Check if client exists in cache
        {
            let clients = self.clients.read().await;
            if let Some(client) = clients.get(account_id) {
                return Ok(client.clone());
            }
        }

        // Create new client
        let client = self
            .create_client(endpoint, access_key_id, secret_access_key, provider_type, region)
            .await?;
        let client = Arc::new(client);

        // Cache the client
        {
            let mut clients = self.clients.write().await;
            clients.insert(account_id.to_string(), client.clone());
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
            clients.remove(account_id);
        }
    }
}

impl Default for S3ClientManager {
    fn default() -> Self {
        Self::new()
    }
}
