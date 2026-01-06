use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::DbManager;
use crate::error::{AppError, Result};

/// Hash type used for duplicate detection
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HashType {
    /// Fast mode: uses ETag (typically MD5 for single-part uploads)
    Etag,
    /// Accurate mode: uses SHA-256 hash of file content
    Sha256,
}

impl std::fmt::Display for HashType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HashType::Etag => write!(f, "etag"),
            HashType::Sha256 => write!(f, "sha256"),
        }
    }
}

impl TryFrom<&str> for HashType {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "etag" => Ok(HashType::Etag),
            "sha256" => Ok(HashType::Sha256),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown hash type: {}",
                value
            ))),
        }
    }
}

/// Scan status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for ScanStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScanStatus::Running => write!(f, "running"),
            ScanStatus::Completed => write!(f, "completed"),
            ScanStatus::Failed => write!(f, "failed"),
            ScanStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl TryFrom<&str> for ScanStatus {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "running" => Ok(ScanStatus::Running),
            "completed" => Ok(ScanStatus::Completed),
            "failed" => Ok(ScanStatus::Failed),
            "cancelled" => Ok(ScanStatus::Cancelled),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown scan status: {}",
                value
            ))),
        }
    }
}

/// Duplicate scan record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateScan {
    pub id: i64,
    pub account_id: String,
    pub bucket: String,
    pub prefix: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub status: ScanStatus,
    pub total_files: i64,
    pub total_size: i64,
    pub duplicate_groups: i64,
    pub duplicate_files: i64,
    pub reclaimable_bytes: i64,
    pub error_message: Option<String>,
}

/// Duplicate group - files that share the same hash
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub id: i64,
    pub scan_id: i64,
    pub content_hash: String,
    pub hash_type: HashType,
    pub file_size: i64,
    pub file_count: i64,
    pub files: Vec<DuplicateFile>,
}

/// A single file that is part of a duplicate group
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFile {
    pub id: i64,
    pub group_id: i64,
    pub key: String,
    pub etag: Option<String>,
    pub last_modified: Option<i64>,
    pub storage_class: Option<String>,
}

/// Summary of a duplicate scan for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub id: i64,
    pub account_id: String,
    pub bucket: String,
    pub prefix: String,
    pub started_at: i64,
    pub status: ScanStatus,
    pub total_files: i64,
    pub duplicate_groups: i64,
    pub reclaimable_bytes: i64,
}

/// Input for creating a new scan
#[derive(Debug, Clone)]
pub struct NewScan {
    pub account_id: String,
    pub bucket: String,
    pub prefix: String,
}

/// File info collected during scan (before grouping)
#[derive(Debug, Clone)]
pub struct ScannedFile {
    pub key: String,
    pub size: i64,
    pub etag: Option<String>,
    pub last_modified: Option<i64>,
    pub storage_class: Option<String>,
    pub content_hash: Option<String>,
}

impl DbManager {
    /// Create a new duplicate scan record
    pub fn create_scan(&self, scan: &NewScan) -> Result<i64> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            INSERT INTO duplicate_scans (account_id, bucket, prefix, started_at, status)
            VALUES (?1, ?2, ?3, ?4, 'running')
            "#,
            params![scan.account_id, scan.bucket, scan.prefix, now],
        )
        .map_err(|e| AppError::Storage(format!("Failed to create scan: {}", e)))?;

        Ok(conn.last_insert_rowid())
    }

    /// Update scan progress
    pub fn update_scan_progress(
        &self,
        scan_id: i64,
        total_files: i64,
        total_size: i64,
    ) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute(
            "UPDATE duplicate_scans SET total_files = ?1, total_size = ?2 WHERE id = ?3",
            params![total_files, total_size, scan_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to update scan progress: {}", e)))?;

        Ok(())
    }

    /// Complete a scan with results
    pub fn complete_scan(
        &self,
        scan_id: i64,
        duplicate_groups: i64,
        duplicate_files: i64,
        reclaimable_bytes: i64,
    ) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            UPDATE duplicate_scans
            SET completed_at = ?1, status = 'completed',
                duplicate_groups = ?2, duplicate_files = ?3, reclaimable_bytes = ?4
            WHERE id = ?5
            "#,
            params![now, duplicate_groups, duplicate_files, reclaimable_bytes, scan_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to complete scan: {}", e)))?;

        Ok(())
    }

    /// Mark scan as failed
    pub fn fail_scan(&self, scan_id: i64, error: &str) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            UPDATE duplicate_scans
            SET completed_at = ?1, status = 'failed', error_message = ?2
            WHERE id = ?3
            "#,
            params![now, error, scan_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to update scan status: {}", e)))?;

        Ok(())
    }

    /// Cancel a running scan
    pub fn cancel_scan(&self, scan_id: i64) -> Result<()> {
        let conn = self.get_conn()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            r#"
            UPDATE duplicate_scans
            SET completed_at = ?1, status = 'cancelled'
            WHERE id = ?2 AND status = 'running'
            "#,
            params![now, scan_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to cancel scan: {}", e)))?;

        Ok(())
    }

    /// Get a scan by ID
    pub fn get_scan(&self, scan_id: i64) -> Result<Option<DuplicateScan>> {
        let conn = self.get_conn()?;

        let result = conn.query_row(
            r#"
            SELECT id, account_id, bucket, prefix, started_at, completed_at, status,
                   total_files, total_size, duplicate_groups, duplicate_files,
                   reclaimable_bytes, error_message
            FROM duplicate_scans
            WHERE id = ?1
            "#,
            params![scan_id],
            |row| {
                let status_str: String = row.get("status")?;
                Ok(DuplicateScan {
                    id: row.get("id")?,
                    account_id: row.get("account_id")?,
                    bucket: row.get("bucket")?,
                    prefix: row.get("prefix")?,
                    started_at: row.get("started_at")?,
                    completed_at: row.get("completed_at")?,
                    status: ScanStatus::try_from(status_str.as_str())
                        .unwrap_or(ScanStatus::Running),
                    total_files: row.get("total_files")?,
                    total_size: row.get("total_size")?,
                    duplicate_groups: row.get("duplicate_groups")?,
                    duplicate_files: row.get("duplicate_files")?,
                    reclaimable_bytes: row.get("reclaimable_bytes")?,
                    error_message: row.get("error_message")?,
                })
            },
        );

        match result {
            Ok(scan) => Ok(Some(scan)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Storage(format!("Failed to get scan: {}", e))),
        }
    }

    /// List recent scans for an account/bucket
    pub fn list_scans(
        &self,
        account_id: &str,
        bucket: Option<&str>,
        limit: i64,
    ) -> Result<Vec<ScanSummary>> {
        let conn = self.get_conn()?;

        let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(b) = bucket {
            (
                r#"
                SELECT id, account_id, bucket, prefix, started_at, status,
                       total_files, duplicate_groups, reclaimable_bytes
                FROM duplicate_scans
                WHERE account_id = ?1 AND bucket = ?2
                ORDER BY started_at DESC
                LIMIT ?3
                "#
                .to_string(),
                vec![
                    Box::new(account_id.to_string()),
                    Box::new(b.to_string()),
                    Box::new(limit),
                ],
            )
        } else {
            (
                r#"
                SELECT id, account_id, bucket, prefix, started_at, status,
                       total_files, duplicate_groups, reclaimable_bytes
                FROM duplicate_scans
                WHERE account_id = ?1
                ORDER BY started_at DESC
                LIMIT ?2
                "#
                .to_string(),
                vec![Box::new(account_id.to_string()), Box::new(limit)],
            )
        };

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let scans = stmt
            .query_map(params_refs.as_slice(), |row| {
                let status_str: String = row.get("status")?;
                Ok(ScanSummary {
                    id: row.get("id")?,
                    account_id: row.get("account_id")?,
                    bucket: row.get("bucket")?,
                    prefix: row.get("prefix")?,
                    started_at: row.get("started_at")?,
                    status: ScanStatus::try_from(status_str.as_str())
                        .unwrap_or(ScanStatus::Running),
                    total_files: row.get("total_files")?,
                    duplicate_groups: row.get("duplicate_groups")?,
                    reclaimable_bytes: row.get("reclaimable_bytes")?,
                })
            })
            .map_err(|e| AppError::Storage(format!("Failed to list scans: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(scans)
    }

    /// Save a duplicate group with its files
    pub fn save_duplicate_group(
        &self,
        scan_id: i64,
        content_hash: &str,
        hash_type: HashType,
        file_size: i64,
        files: &[ScannedFile],
    ) -> Result<i64> {
        let conn = self.get_conn()?;

        // Insert group
        conn.execute(
            r#"
            INSERT INTO duplicate_groups (scan_id, content_hash, hash_type, file_size, file_count)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![
                scan_id,
                content_hash,
                hash_type.to_string(),
                file_size,
                files.len() as i64
            ],
        )
        .map_err(|e| AppError::Storage(format!("Failed to insert duplicate group: {}", e)))?;

        let group_id = conn.last_insert_rowid();

        // Insert files
        for file in files {
            conn.execute(
                r#"
                INSERT INTO duplicate_files (group_id, key, etag, last_modified, storage_class)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                params![
                    group_id,
                    file.key,
                    file.etag,
                    file.last_modified,
                    file.storage_class
                ],
            )
            .map_err(|e| AppError::Storage(format!("Failed to insert duplicate file: {}", e)))?;
        }

        Ok(group_id)
    }

    /// Get all duplicate groups for a scan
    pub fn get_duplicate_groups(&self, scan_id: i64) -> Result<Vec<DuplicateGroup>> {
        let conn = self.get_conn()?;

        let mut stmt = conn
            .prepare(
                r#"
            SELECT id, scan_id, content_hash, hash_type, file_size, file_count
            FROM duplicate_groups
            WHERE scan_id = ?1
            ORDER BY file_size * file_count DESC
            "#,
            )
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let groups: Vec<(i64, i64, String, String, i64, i64)> = stmt
            .query_map(params![scan_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })
            .map_err(|e| AppError::Storage(format!("Failed to get groups: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        let mut result = Vec::new();
        for (id, scan_id, content_hash, hash_type_str, file_size, file_count) in groups {
            let files = self.get_duplicate_files(id)?;
            result.push(DuplicateGroup {
                id,
                scan_id,
                content_hash,
                hash_type: HashType::try_from(hash_type_str.as_str()).unwrap_or(HashType::Etag),
                file_size,
                file_count,
                files,
            });
        }

        Ok(result)
    }

    /// Get files in a duplicate group
    fn get_duplicate_files(&self, group_id: i64) -> Result<Vec<DuplicateFile>> {
        let conn = self.get_conn()?;

        let mut stmt = conn
            .prepare(
                r#"
            SELECT id, group_id, key, etag, last_modified, storage_class
            FROM duplicate_files
            WHERE group_id = ?1
            ORDER BY key ASC
            "#,
            )
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let files = stmt
            .query_map(params![group_id], |row| {
                Ok(DuplicateFile {
                    id: row.get("id")?,
                    group_id: row.get("group_id")?,
                    key: row.get("key")?,
                    etag: row.get("etag")?,
                    last_modified: row.get("last_modified")?,
                    storage_class: row.get("storage_class")?,
                })
            })
            .map_err(|e| AppError::Storage(format!("Failed to get files: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(files)
    }

    /// Delete a scan and all its groups/files (cascade delete handled by FK)
    pub fn delete_scan(&self, scan_id: i64) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute("DELETE FROM duplicate_scans WHERE id = ?1", params![scan_id])
            .map_err(|e| AppError::Storage(format!("Failed to delete scan: {}", e)))?;

        Ok(())
    }

    /// Remove files from duplicate groups after deletion
    pub fn remove_deleted_files(&self, scan_id: i64, deleted_keys: &[String]) -> Result<()> {
        let conn = self.get_conn()?;

        // Get all group IDs for this scan
        let mut stmt = conn
            .prepare("SELECT id FROM duplicate_groups WHERE scan_id = ?1")
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let group_ids: Vec<i64> = stmt
            .query_map(params![scan_id], |row| row.get(0))
            .map_err(|e| AppError::Storage(format!("Failed to get group IDs: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        // Delete the files from all groups
        for key in deleted_keys {
            conn.execute(
                "DELETE FROM duplicate_files WHERE key = ?1 AND group_id IN (SELECT id FROM duplicate_groups WHERE scan_id = ?2)",
                params![key, scan_id],
            )
            .map_err(|e| AppError::Storage(format!("Failed to delete file record: {}", e)))?;
        }

        // Update file counts and remove empty groups
        for group_id in group_ids {
            // Update file count
            conn.execute(
                r#"
                UPDATE duplicate_groups
                SET file_count = (SELECT COUNT(*) FROM duplicate_files WHERE group_id = ?1)
                WHERE id = ?1
                "#,
                params![group_id],
            )
            .map_err(|e| AppError::Storage(format!("Failed to update file count: {}", e)))?;

            // Delete groups with less than 2 files (no longer duplicates)
            conn.execute(
                "DELETE FROM duplicate_groups WHERE id = ?1 AND file_count < 2",
                params![group_id],
            )
            .map_err(|e| AppError::Storage(format!("Failed to delete empty group: {}", e)))?;
        }

        // Update scan stats
        let stats: (i64, i64, i64) = conn
            .query_row(
                r#"
                SELECT
                    COUNT(DISTINCT dg.id) as groups,
                    COALESCE(SUM(dg.file_count), 0) as files,
                    COALESCE(SUM(dg.file_size * (dg.file_count - 1)), 0) as reclaimable
                FROM duplicate_groups dg
                WHERE dg.scan_id = ?1
                "#,
                params![scan_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap_or((0, 0, 0));

        conn.execute(
            r#"
            UPDATE duplicate_scans
            SET duplicate_groups = ?1, duplicate_files = ?2, reclaimable_bytes = ?3
            WHERE id = ?4
            "#,
            params![stats.0, stats.1, stats.2, scan_id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to update scan stats: {}", e)))?;

        Ok(())
    }
}
