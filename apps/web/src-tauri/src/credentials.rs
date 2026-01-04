use crate::error::{AppError, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use uuid::Uuid;

const SERVICE_NAME: &str = "com.s3-browser.credentials";
const ACCOUNTS_KEY: &str = "accounts_metadata";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub endpoint: String,
    pub access_key_id: String,
    pub account_id: String, // R2 account ID (used in endpoint)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AccountsMetadata {
    accounts: HashMap<String, AccountMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AccountMetadata {
    name: String,
    endpoint: String,
    access_key_id: String,
    account_id: String,
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
        account_id: String,
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
                account_id: account_id.clone(),
            },
        );
        self.save_metadata(&metadata)?;

        Ok(Account {
            id,
            name,
            endpoint,
            access_key_id,
            account_id,
        })
    }

    pub fn list_accounts(&self) -> Result<Vec<Account>> {
        let metadata = self.load_metadata()?;
        let accounts: Vec<Account> = metadata
            .accounts
            .into_iter()
            .map(|(id, meta)| Account {
                id,
                name: meta.name,
                endpoint: meta.endpoint,
                access_key_id: meta.access_key_id,
                account_id: meta.account_id,
            })
            .collect();
        Ok(accounts)
    }

    pub fn get_account(&self, id: &str) -> Result<Account> {
        let metadata = self.load_metadata()?;
        let meta = metadata
            .accounts
            .get(id)
            .ok_or_else(|| AppError::NotFound(format!("Account not found: {}", id)))?;

        Ok(Account {
            id: id.to_string(),
            name: meta.name.clone(),
            endpoint: meta.endpoint.clone(),
            access_key_id: meta.access_key_id.clone(),
            account_id: meta.account_id.clone(),
        })
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
        account_id: Option<String>,
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
        if let Some(account_id) = account_id {
            meta.account_id = account_id;
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
        Ok(Account {
            id: id.to_string(),
            name: meta.name.clone(),
            endpoint: meta.endpoint.clone(),
            access_key_id: meta.access_key_id.clone(),
            account_id: meta.account_id.clone(),
        })
    }
}

impl Default for CredentialsManager {
    fn default() -> Self {
        Self::new()
    }
}
