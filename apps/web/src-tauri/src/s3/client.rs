use crate::error::Result;
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
            .create_client(endpoint, access_key_id, secret_access_key)
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
    ) -> Result<Client> {
        let credentials = Credentials::new(
            access_key_id,
            secret_access_key,
            None, // session token
            None, // expiration
            "s3-browser",
        );

        let config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .endpoint_url(endpoint)
            .region(Region::new("auto")) // R2 uses "auto" region
            .credentials_provider(credentials)
            .force_path_style(true) // Required for R2 compatibility
            .build();

        Ok(Client::from_conf(config))
    }

    pub fn remove_client(&self, account_id: &str) {
        // Use blocking removal since this is called from sync context
        // This is safe because we're just removing from the HashMap
        if let Ok(mut clients) = self.clients.try_write() {
            clients.remove(account_id);
        }
    }

    pub async fn clear_all(&self) {
        let mut clients = self.clients.write().await;
        clients.clear();
    }
}

impl Default for S3ClientManager {
    fn default() -> Self {
        Self::new()
    }
}

// Helper to get R2 endpoint from account ID
pub fn get_r2_endpoint(cloudflare_account_id: &str) -> String {
    format!(
        "https://{}.r2.cloudflarestorage.com",
        cloudflare_account_id
    )
}
