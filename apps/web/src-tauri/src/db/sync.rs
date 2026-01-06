use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::DbManager;
use crate::error::{AppError, Result};

/// Sync direction for a pair
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncDirection {
    /// Upload only (local -> remote)
    UploadOnly,
    /// Download only (remote -> local)
    DownloadOnly,
}

impl std::fmt::Display for SyncDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncDirection::UploadOnly => write!(f, "upload_only"),
            SyncDirection::DownloadOnly => write!(f, "download_only"),
        }
    }
}

impl TryFrom<&str> for SyncDirection {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "upload_only" => Ok(SyncDirection::UploadOnly),
            "download_only" => Ok(SyncDirection::DownloadOnly),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown sync direction: {}",
                value
            ))),
        }
    }
}

/// Status of a sync pair
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncPairStatus {
    /// Not currently syncing
    Idle,
    /// Sync in progress
    Syncing,
    /// Last sync failed
    Error,
}

impl std::fmt::Display for SyncPairStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncPairStatus::Idle => write!(f, "idle"),
            SyncPairStatus::Syncing => write!(f, "syncing"),
            SyncPairStatus::Error => write!(f, "error"),
        }
    }
}

impl TryFrom<&str> for SyncPairStatus {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "idle" => Ok(SyncPairStatus::Idle),
            "syncing" => Ok(SyncPairStatus::Syncing),
            "error" => Ok(SyncPairStatus::Error),
            // Legacy support for existing DB entries
            "has_conflicts" => Ok(SyncPairStatus::Error),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown sync status: {}",
                value
            ))),
        }
    }
}

/// Sync session status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncSessionStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for SyncSessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncSessionStatus::Running => write!(f, "running"),
            SyncSessionStatus::Completed => write!(f, "completed"),
            SyncSessionStatus::Failed => write!(f, "failed"),
            SyncSessionStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl TryFrom<&str> for SyncSessionStatus {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "running" => Ok(SyncSessionStatus::Running),
            "completed" => Ok(SyncSessionStatus::Completed),
            "failed" => Ok(SyncSessionStatus::Failed),
            "cancelled" => Ok(SyncSessionStatus::Cancelled),
            // Legacy support
            "waiting_for_conflicts" => Ok(SyncSessionStatus::Completed),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown session status: {}",
                value
            ))),
        }
    }
}

/// A sync pair configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPair {
    pub id: i64,
    pub name: String,
    pub local_path: String,
    pub account_id: String,
    pub bucket: String,
    pub remote_prefix: String,
    pub sync_direction: SyncDirection,
    pub delete_propagation: bool,
    pub status: SyncPairStatus,
    pub last_sync_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: i64,
}

/// Input for creating a new sync pair
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSyncPair {
    pub name: String,
    pub local_path: String,
    pub account_id: String,
    pub bucket: String,
    pub remote_prefix: String,
    pub sync_direction: SyncDirection,
    pub delete_propagation: bool,
}

/// Tracked file state (local or remote)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackedFile {
    pub id: i64,
    pub sync_pair_id: i64,
    pub relative_path: String,
    pub size: i64,
    pub mtime_ms: Option<i64>,
    pub etag: Option<String>,
    pub content_hash: Option<String>,
    pub is_deleted: bool,
    pub last_seen_at: i64,
}

/// Change detected during sync
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChangeType {
    /// File is new (not in previous snapshot)
    New,
    /// File was modified (different hash/size/mtime)
    Modified,
    /// File was deleted (in previous snapshot but not current)
    Deleted,
    /// File unchanged
    Unchanged,
}

/// A detected change during sync analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedChange {
    pub relative_path: String,
    pub change_type: ChangeType,
    pub size: Option<i64>,
    pub mtime: Option<i64>,
    pub hash: Option<String>,
}

/// Sync session record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSession {
    pub id: i64,
    pub sync_pair_id: i64,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub status: SyncSessionStatus,
    pub files_uploaded: i64,
    pub files_downloaded: i64,
    pub files_deleted_local: i64,
    pub files_deleted_remote: i64,
    pub bytes_transferred: i64,
    pub error_message: Option<String>,
}

/// Summary for sync preview (dry-run)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPreview {
    pub to_upload: Vec<DetectedChange>,
    pub to_download: Vec<DetectedChange>,
    pub to_delete_local: Vec<DetectedChange>,
    pub to_delete_remote: Vec<DetectedChange>,
}

impl DbManager {
    // ==================== Sync Pairs ====================

    /// Create a new sync pair
    pub fn create_sync_pair(&self, pair: &NewSyncPair) -> Result<i64> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            INSERT INTO sync_pairs (name, local_path, account_id, bucket, remote_prefix,
                                    sync_direction, delete_propagation, status, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'idle', ?8)
            "#,
            params![
                pair.name,
                pair.local_path,
                pair.account_id,
                pair.bucket,
                pair.remote_prefix,
                pair.sync_direction.to_string(),
                pair.delete_propagation as i32,
                now
            ],
        )
        .map_err(|e| AppError::Storage(format!("Failed to create sync pair: {}", e)))?;

        Ok(conn.last_insert_rowid())
    }

    /// Get a sync pair by ID
    pub fn get_sync_pair(&self, pair_id: i64) -> Result<Option<SyncPair>> {
        let conn = self.get_conn()?;

        let result = conn.query_row(
            r#"
            SELECT id, name, local_path, account_id, bucket, remote_prefix,
                   sync_direction, delete_propagation, status, last_sync_at,
                   last_error, created_at
            FROM sync_pairs
            WHERE id = ?1
            "#,
            params![pair_id],
            |row| {
                let direction_str: String = row.get("sync_direction")?;
                let status_str: String = row.get("status")?;
                let delete_prop: i32 = row.get("delete_propagation")?;
                Ok(SyncPair {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    local_path: row.get("local_path")?,
                    account_id: row.get("account_id")?,
                    bucket: row.get("bucket")?,
                    remote_prefix: row.get("remote_prefix")?,
                    sync_direction: SyncDirection::try_from(direction_str.as_str())
                        .unwrap_or(SyncDirection::UploadOnly),
                    delete_propagation: delete_prop != 0,
                    status: SyncPairStatus::try_from(status_str.as_str())
                        .unwrap_or(SyncPairStatus::Idle),
                    last_sync_at: row.get("last_sync_at")?,
                    last_error: row.get("last_error")?,
                    created_at: row.get("created_at")?,
                })
            },
        );

        match result {
            Ok(pair) => Ok(Some(pair)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Storage(format!("Failed to get sync pair: {}", e))),
        }
    }

    /// List all sync pairs for an account
    pub fn list_sync_pairs(&self, account_id: &str) -> Result<Vec<SyncPair>> {
        let conn = self.get_conn()?;

        let mut stmt = conn
            .prepare(
                r#"
            SELECT id, name, local_path, account_id, bucket, remote_prefix,
                   sync_direction, delete_propagation, status, last_sync_at,
                   last_error, created_at
            FROM sync_pairs
            WHERE account_id = ?1
            ORDER BY name ASC
            "#,
            )
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let pairs = stmt
            .query_map(params![account_id], |row| {
                let direction_str: String = row.get("sync_direction")?;
                let status_str: String = row.get("status")?;
                let delete_prop: i32 = row.get("delete_propagation")?;
                Ok(SyncPair {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    local_path: row.get("local_path")?,
                    account_id: row.get("account_id")?,
                    bucket: row.get("bucket")?,
                    remote_prefix: row.get("remote_prefix")?,
                    sync_direction: SyncDirection::try_from(direction_str.as_str())
                        .unwrap_or(SyncDirection::UploadOnly),
                    delete_propagation: delete_prop != 0,
                    status: SyncPairStatus::try_from(status_str.as_str())
                        .unwrap_or(SyncPairStatus::Idle),
                    last_sync_at: row.get("last_sync_at")?,
                    last_error: row.get("last_error")?,
                    created_at: row.get("created_at")?,
                })
            })
            .map_err(|e| AppError::Storage(format!("Failed to list sync pairs: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(pairs)
    }

    /// Update sync pair status
    pub fn update_sync_pair_status(&self, pair_id: i64, status: SyncPairStatus) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute(
            "UPDATE sync_pairs SET status = ?1 WHERE id = ?2",
            params![status.to_string(), pair_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to update sync pair status: {}", e)))?;

        Ok(())
    }

    /// Mark sync pair as synced
    pub fn mark_sync_completed(&self, pair_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "UPDATE sync_pairs SET status = 'idle', last_sync_at = ?1, last_error = NULL WHERE id = ?2",
            params![now, pair_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to mark sync completed: {}", e)))?;

        Ok(())
    }

    /// Mark sync pair as failed
    pub fn mark_sync_failed(&self, pair_id: i64, error: &str) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute(
            "UPDATE sync_pairs SET status = 'error', last_error = ?1 WHERE id = ?2",
            params![error, pair_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to mark sync failed: {}", e)))?;

        Ok(())
    }

    /// Delete a sync pair and all its data
    pub fn delete_sync_pair(&self, pair_id: i64) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute("DELETE FROM sync_pairs WHERE id = ?1", params![pair_id])
            .map_err(|e| AppError::Storage(format!("Failed to delete sync pair: {}", e)))?;

        Ok(())
    }

    // ==================== File State Tracking ====================

    /// Save local file state
    pub fn save_local_file_state(
        &self,
        pair_id: i64,
        relative_path: &str,
        size: i64,
        mtime_ms: i64,
        content_hash: Option<&str>,
    ) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            INSERT INTO sync_local_files (sync_pair_id, relative_path, size, mtime_ms, content_hash, is_deleted, last_seen_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)
            ON CONFLICT(sync_pair_id, relative_path) DO UPDATE SET
                size = excluded.size,
                mtime_ms = excluded.mtime_ms,
                content_hash = excluded.content_hash,
                is_deleted = 0,
                last_seen_at = excluded.last_seen_at
            "#,
            params![pair_id, relative_path, size, mtime_ms, content_hash, now],
        )
        .map_err(|e| AppError::Storage(format!("Failed to save local file state: {}", e)))?;

        Ok(())
    }

    /// Mark local file as deleted
    pub fn mark_local_file_deleted(&self, pair_id: i64, relative_path: &str) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            UPDATE sync_local_files
            SET is_deleted = 1, last_seen_at = ?1
            WHERE sync_pair_id = ?2 AND relative_path = ?3
            "#,
            params![now, pair_id, relative_path],
        )
        .map_err(|e| AppError::Storage(format!("Failed to mark local file deleted: {}", e)))?;

        Ok(())
    }

    /// Get all tracked local files for a sync pair
    pub fn get_local_file_states(&self, pair_id: i64) -> Result<Vec<TrackedFile>> {
        let conn = self.get_conn()?;

        let mut stmt = conn
            .prepare(
                r#"
            SELECT id, sync_pair_id, relative_path, size, mtime_ms, NULL as etag,
                   content_hash, is_deleted, last_seen_at
            FROM sync_local_files
            WHERE sync_pair_id = ?1
            "#,
            )
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let files = stmt
            .query_map(params![pair_id], |row| {
                let is_deleted: i32 = row.get("is_deleted")?;
                Ok(TrackedFile {
                    id: row.get("id")?,
                    sync_pair_id: row.get("sync_pair_id")?,
                    relative_path: row.get("relative_path")?,
                    size: row.get("size")?,
                    mtime_ms: row.get("mtime_ms")?,
                    etag: row.get("etag")?,
                    content_hash: row.get("content_hash")?,
                    is_deleted: is_deleted != 0,
                    last_seen_at: row.get("last_seen_at")?,
                })
            })
            .map_err(|e| AppError::Storage(format!("Failed to get local files: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(files)
    }

    /// Save remote file state
    pub fn save_remote_file_state(
        &self,
        pair_id: i64,
        relative_path: &str,
        size: i64,
        etag: Option<&str>,
        last_modified: Option<i64>,
        content_hash: Option<&str>,
    ) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            INSERT INTO sync_remote_files (sync_pair_id, relative_path, size, etag, last_modified, content_hash, is_deleted, last_seen_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)
            ON CONFLICT(sync_pair_id, relative_path) DO UPDATE SET
                size = excluded.size,
                etag = excluded.etag,
                last_modified = excluded.last_modified,
                content_hash = excluded.content_hash,
                is_deleted = 0,
                last_seen_at = excluded.last_seen_at
            "#,
            params![pair_id, relative_path, size, etag, last_modified, content_hash, now],
        )
        .map_err(|e| AppError::Storage(format!("Failed to save remote file state: {}", e)))?;

        Ok(())
    }

    /// Mark remote file as deleted
    pub fn mark_remote_file_deleted(&self, pair_id: i64, relative_path: &str) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            UPDATE sync_remote_files
            SET is_deleted = 1, last_seen_at = ?1
            WHERE sync_pair_id = ?2 AND relative_path = ?3
            "#,
            params![now, pair_id, relative_path],
        )
        .map_err(|e| AppError::Storage(format!("Failed to mark remote file deleted: {}", e)))?;

        Ok(())
    }

    /// Get all tracked remote files for a sync pair
    pub fn get_remote_file_states(&self, pair_id: i64) -> Result<Vec<TrackedFile>> {
        let conn = self.get_conn()?;

        let mut stmt = conn
            .prepare(
                r#"
            SELECT id, sync_pair_id, relative_path, size, last_modified as mtime_ms,
                   etag, content_hash, is_deleted, last_seen_at
            FROM sync_remote_files
            WHERE sync_pair_id = ?1
            "#,
            )
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let files = stmt
            .query_map(params![pair_id], |row| {
                let is_deleted: i32 = row.get("is_deleted")?;
                Ok(TrackedFile {
                    id: row.get("id")?,
                    sync_pair_id: row.get("sync_pair_id")?,
                    relative_path: row.get("relative_path")?,
                    size: row.get("size")?,
                    mtime_ms: row.get("mtime_ms")?,
                    etag: row.get("etag")?,
                    content_hash: row.get("content_hash")?,
                    is_deleted: is_deleted != 0,
                    last_seen_at: row.get("last_seen_at")?,
                })
            })
            .map_err(|e| AppError::Storage(format!("Failed to get remote files: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(files)
    }

    /// Clear all tracked files for a sync pair (for resync)
    pub fn clear_tracked_files(&self, pair_id: i64) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute(
            "DELETE FROM sync_local_files WHERE sync_pair_id = ?1",
            params![pair_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to clear local files: {}", e)))?;

        conn.execute(
            "DELETE FROM sync_remote_files WHERE sync_pair_id = ?1",
            params![pair_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to clear remote files: {}", e)))?;

        Ok(())
    }

    // ==================== Sync Sessions ====================

    /// Create a sync session
    pub fn create_sync_session(&self, pair_id: i64) -> Result<i64> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            INSERT INTO sync_sessions (sync_pair_id, started_at, status)
            VALUES (?1, ?2, 'running')
            "#,
            params![pair_id, now],
        )
        .map_err(|e| AppError::Storage(format!("Failed to create sync session: {}", e)))?;

        Ok(conn.last_insert_rowid())
    }

    /// Update sync session progress
    pub fn update_sync_session_progress(
        &self,
        session_id: i64,
        files_uploaded: i64,
        files_downloaded: i64,
        files_deleted_local: i64,
        files_deleted_remote: i64,
        bytes_transferred: i64,
    ) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute(
            r#"
            UPDATE sync_sessions
            SET files_uploaded = ?1, files_downloaded = ?2,
                files_deleted_local = ?3, files_deleted_remote = ?4,
                bytes_transferred = ?5
            WHERE id = ?6
            "#,
            params![
                files_uploaded,
                files_downloaded,
                files_deleted_local,
                files_deleted_remote,
                bytes_transferred,
                session_id
            ],
        )
        .map_err(|e| AppError::Storage(format!("Failed to update session progress: {}", e)))?;

        Ok(())
    }

    /// Complete a sync session
    pub fn complete_sync_session(&self, session_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            UPDATE sync_sessions
            SET completed_at = ?1, status = 'completed'
            WHERE id = ?2
            "#,
            params![now, session_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to complete session: {}", e)))?;

        Ok(())
    }

    /// Fail a sync session
    pub fn fail_sync_session(&self, session_id: i64, error: &str) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            UPDATE sync_sessions
            SET completed_at = ?1, status = 'failed', error_message = ?2
            WHERE id = ?3
            "#,
            params![now, error, session_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to mark session failed: {}", e)))?;

        Ok(())
    }

    /// Get recent sync sessions for a pair
    pub fn get_sync_sessions(&self, pair_id: i64, limit: i64) -> Result<Vec<SyncSession>> {
        let conn = self.get_conn()?;

        let mut stmt = conn
            .prepare(
                r#"
            SELECT id, sync_pair_id, started_at, completed_at, status,
                   files_uploaded, files_downloaded, files_deleted_local,
                   files_deleted_remote, bytes_transferred, error_message
            FROM sync_sessions
            WHERE sync_pair_id = ?1
            ORDER BY started_at DESC
            LIMIT ?2
            "#,
            )
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let sessions = stmt
            .query_map(params![pair_id, limit], |row| {
                let status_str: String = row.get("status")?;
                Ok(SyncSession {
                    id: row.get("id")?,
                    sync_pair_id: row.get("sync_pair_id")?,
                    started_at: row.get("started_at")?,
                    completed_at: row.get("completed_at")?,
                    status: SyncSessionStatus::try_from(status_str.as_str())
                        .unwrap_or(SyncSessionStatus::Running),
                    files_uploaded: row.get("files_uploaded")?,
                    files_downloaded: row.get("files_downloaded")?,
                    files_deleted_local: row.get("files_deleted_local")?,
                    files_deleted_remote: row.get("files_deleted_remote")?,
                    bytes_transferred: row.get("bytes_transferred")?,
                    error_message: row.get("error_message")?,
                })
            })
            .map_err(|e| AppError::Storage(format!("Failed to get sessions: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(sessions)
    }
}
