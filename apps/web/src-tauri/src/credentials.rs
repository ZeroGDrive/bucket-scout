use crate::error::{AppError, Result};
use crate::provider::ProviderType;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use uuid::Uuid;

const SERVICE_NAME: &str = "com.bucketscout.credentials";
const ACCOUNTS_KEY: &str = "accounts_metadata";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub endpoint: String,
    pub access_key_id: String,
    pub provider_type: ProviderType,
    // Provider-specific fields
    pub cloudflare_account_id: Option<String>, // R2 only
    pub region: Option<String>,                // AWS S3
    // Legacy field for backwards compatibility during migration
    #[serde(skip_serializing)]
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AccountsMetadata {
    accounts: HashMap<String, AccountMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountMetadata {
    name: String,
    endpoint: String,
    access_key_id: String,
    #[serde(default)]
    provider_type: ProviderType,
    // Provider-specific fields
    cloudflare_account_id: Option<String>,
    region: Option<String>,
    // Legacy field for migration
    #[serde(rename = "account_id")]
    legacy_account_id: Option<String>,
}

impl Default for AccountsMetadata {
    fn default() -> Self {
        Self {
            accounts: HashMap::new(),
        }
    }
}

pub struct CredentialsManager {
    metadata_cache: RwLock<Option<AccountsMetadata>>,
}

impl CredentialsManager {
    pub fn new() -> Self {
        Self {
            metadata_cache: RwLock::new(None),
        }
    }

    fn get_metadata_entry() -> Result<Entry> {
        Entry::new(SERVICE_NAME, ACCOUNTS_KEY).map_err(|e| AppError::Credential(e.to_string()))
    }

    fn get_secret_entry(account_id: &str) -> Result<Entry> {
        let key = format!("secret_{}", account_id);
        Entry::new(SERVICE_NAME, &key).map_err(|e| AppError::Credential(e.to_string()))
    }

    fn load_metadata(&self) -> Result<AccountsMetadata> {
        // Check cache first
        if let Ok(cache) = self.metadata_cache.read() {
            if let Some(ref metadata) = *cache {
                return Ok(metadata.clone());
            }
        }

        let entry = Self::get_metadata_entry()?;
        let metadata = match entry.get_password() {
            Ok(json) => serde_json::from_str(&json)
                .map_err(|e| AppError::Storage(format!("Failed to parse metadata: {}", e)))?,
            Err(keyring::Error::NoEntry) => AccountsMetadata::default(),
            Err(e) => return Err(AppError::Credential(e.to_string())),
        };

        // Update cache
        if let Ok(mut cache) = self.metadata_cache.write() {
            *cache = Some(metadata.clone());
        }

        Ok(metadata)
    }

    fn save_metadata(&self, metadata: &AccountsMetadata) -> Result<()> {
        let entry = Self::get_metadata_entry()?;
        let json = serde_json::to_string(metadata)
            .map_err(|e| AppError::Storage(format!("Failed to serialize metadata: {}", e)))?;
        entry
            .set_password(&json)
            .map_err(|e| AppError::Credential(e.to_string()))?;

        // Update cache
        if let Ok(mut cache) = self.metadata_cache.write() {
            *cache = Some(metadata.clone());
        }

        Ok(())
    }

    pub fn add_account(
        &self,
        name: String,
        endpoint: String,
        access_key_id: String,
        secret_access_key: String,
        provider_type: ProviderType,
        cloudflare_account_id: Option<String>,
        region: Option<String>,
    ) -> Result<Account> {
        let id = Uuid::new_v4().to_string();

        // Store the secret key in keychain
        let secret_entry = Self::get_secret_entry(&id)?;
        secret_entry
            .set_password(&secret_access_key)
            .map_err(|e| AppError::Credential(e.to_string()))?;

        // Store metadata
        let mut metadata = self.load_metadata()?;
        metadata.accounts.insert(
            id.clone(),
            AccountMetadata {
                name: name.clone(),
                endpoint: endpoint.clone(),
                access_key_id: access_key_id.clone(),
                provider_type,
                cloudflare_account_id: cloudflare_account_id.clone(),
                region: region.clone(),
                legacy_account_id: None,
            },
        );
        self.save_metadata(&metadata)?;

        Ok(Account {
            id,
            name,
            endpoint,
            access_key_id,
            provider_type,
            cloudflare_account_id,
            region,
            account_id: None,
        })
    }

    pub fn list_accounts(&self) -> Result<Vec<Account>> {
        let metadata = self.load_metadata()?;
        let accounts: Vec<Account> = metadata
            .accounts
            .into_iter()
            .map(|(id, meta)| Self::metadata_to_account(id, meta))
            .collect();
        Ok(accounts)
    }

    pub fn get_account(&self, id: &str) -> Result<Account> {
        let metadata = self.load_metadata()?;
        let meta = metadata
            .accounts
            .get(id)
            .ok_or_else(|| AppError::NotFound(format!("Account not found: {}", id)))?;

        Ok(Self::metadata_to_account(id.to_string(), meta.clone()))
    }

    /// Convert AccountMetadata to Account, handling migration from legacy format
    fn metadata_to_account(id: String, meta: AccountMetadata) -> Account {
        // Handle legacy accounts: if cloudflare_account_id is None but legacy_account_id exists,
        // this is an old R2 account that needs migration
        let cloudflare_account_id = meta
            .cloudflare_account_id
            .or(meta.legacy_account_id.clone());

        Account {
            id,
            name: meta.name,
            endpoint: meta.endpoint,
            access_key_id: meta.access_key_id,
            provider_type: meta.provider_type,
            cloudflare_account_id,
            region: meta.region,
            account_id: meta.legacy_account_id, // Keep for API compatibility
        }
    }

    pub fn get_secret_key(&self, account_id: &str) -> Result<String> {
        let entry = Self::get_secret_entry(account_id)?;
        entry
            .get_password()
            .map_err(|e| AppError::Credential(format!("Failed to get secret key: {}", e)))
    }

    pub fn remove_account(&self, id: &str) -> Result<()> {
        // Remove secret key
        if let Ok(entry) = Self::get_secret_entry(id) {
            let _ = entry.delete_credential(); // Ignore if doesn't exist
        }

        // Remove from metadata
        let mut metadata = self.load_metadata()?;
        metadata.accounts.remove(id);
        self.save_metadata(&metadata)?;

        Ok(())
    }

    pub fn update_account(
        &self,
        id: &str,
        name: Option<String>,
        endpoint: Option<String>,
        access_key_id: Option<String>,
        secret_access_key: Option<String>,
        provider_type: Option<ProviderType>,
        cloudflare_account_id: Option<String>,
        region: Option<String>,
    ) -> Result<Account> {
        let mut metadata = self.load_metadata()?;
        let meta = metadata
            .accounts
            .get_mut(id)
            .ok_or_else(|| AppError::NotFound(format!("Account not found: {}", id)))?;

        if let Some(name) = name {
            meta.name = name;
        }
        if let Some(endpoint) = endpoint {
            meta.endpoint = endpoint;
        }
        if let Some(access_key_id) = access_key_id {
            meta.access_key_id = access_key_id;
        }
        if let Some(provider_type) = provider_type {
            meta.provider_type = provider_type;
        }
        if cloudflare_account_id.is_some() {
            meta.cloudflare_account_id = cloudflare_account_id;
        }
        if region.is_some() {
            meta.region = region;
        }

        // Update secret if provided
        if let Some(secret) = secret_access_key {
            let entry = Self::get_secret_entry(id)?;
            entry
                .set_password(&secret)
                .map_err(|e| AppError::Credential(e.to_string()))?;
        }

        self.save_metadata(&metadata)?;

        let meta = metadata.accounts.get(id).unwrap();
        Ok(Self::metadata_to_account(id.to_string(), meta.clone()))
    }
}

impl Default for CredentialsManager {
    fn default() -> Self {
        Self::new()
    }
}
