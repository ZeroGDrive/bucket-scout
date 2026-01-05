use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};

use super::DbManager;
use crate::error::{AppError, Result};

/// Operation types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OperationType {
    Upload,
    Download,
    Delete,
    Copy,
    Move,
    Rename,
    CreateFolder,
}

impl std::fmt::Display for OperationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OperationType::Upload => write!(f, "upload"),
            OperationType::Download => write!(f, "download"),
            OperationType::Delete => write!(f, "delete"),
            OperationType::Copy => write!(f, "copy"),
            OperationType::Move => write!(f, "move"),
            OperationType::Rename => write!(f, "rename"),
            OperationType::CreateFolder => write!(f, "create_folder"),
        }
    }
}

impl TryFrom<&str> for OperationType {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "upload" => Ok(OperationType::Upload),
            "download" => Ok(OperationType::Download),
            "delete" => Ok(OperationType::Delete),
            "copy" => Ok(OperationType::Copy),
            "move" => Ok(OperationType::Move),
            "rename" => Ok(OperationType::Rename),
            "create_folder" => Ok(OperationType::CreateFolder),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown operation type: {}",
                value
            ))),
        }
    }
}

/// Operation status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OperationStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for OperationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OperationStatus::Pending => write!(f, "pending"),
            OperationStatus::InProgress => write!(f, "in_progress"),
            OperationStatus::Completed => write!(f, "completed"),
            OperationStatus::Failed => write!(f, "failed"),
            OperationStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl TryFrom<&str> for OperationStatus {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "pending" => Ok(OperationStatus::Pending),
            "in_progress" => Ok(OperationStatus::InProgress),
            "completed" => Ok(OperationStatus::Completed),
            "failed" => Ok(OperationStatus::Failed),
            "cancelled" => Ok(OperationStatus::Cancelled),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown operation status: {}",
                value
            ))),
        }
    }
}

/// Operation record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: i64,
    pub timestamp: i64,
    pub account_id: String,
    pub bucket: String,
    pub operation: OperationType,
    pub source_key: Option<String>,
    pub dest_key: Option<String>,
    pub size: Option<i64>,
    pub duration_ms: Option<i64>,
    pub status: OperationStatus,
    pub error_message: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

impl Operation {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let operation_str: String = row.get("operation")?;
        let status_str: String = row.get("status")?;
        let metadata_str: Option<String> = row.get("metadata")?;

        Ok(Operation {
            id: row.get("id")?,
            timestamp: row.get("timestamp")?,
            account_id: row.get("account_id")?,
            bucket: row.get("bucket")?,
            operation: OperationType::try_from(operation_str.as_str())
                .unwrap_or(OperationType::Upload),
            source_key: row.get("source_key")?,
            dest_key: row.get("dest_key")?,
            size: row.get("size")?,
            duration_ms: row.get("duration_ms")?,
            status: OperationStatus::try_from(status_str.as_str())
                .unwrap_or(OperationStatus::Pending),
            error_message: row.get("error_message")?,
            metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()),
        })
    }
}

/// New operation to insert
#[derive(Debug, Clone)]
pub struct NewOperation {
    pub account_id: String,
    pub bucket: String,
    pub operation: OperationType,
    pub source_key: Option<String>,
    pub dest_key: Option<String>,
    pub size: Option<i64>,
    pub status: OperationStatus,
    pub metadata: Option<serde_json::Value>,
}

impl Default for NewOperation {
    fn default() -> Self {
        Self {
            account_id: String::new(),
            bucket: String::new(),
            operation: OperationType::Upload,
            source_key: None,
            dest_key: None,
            size: None,
            status: OperationStatus::Pending,
            metadata: None,
        }
    }
}

/// Filter for querying operations
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationFilter {
    pub account_id: Option<String>,
    pub bucket: Option<String>,
    pub operation: Option<OperationType>,
    pub status: Option<OperationStatus>,
    pub from_timestamp: Option<i64>,
    pub to_timestamp: Option<i64>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Statistics for operations
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationStats {
    pub total_operations: i64,
    pub total_bytes: i64,
    pub completed: i64,
    pub failed: i64,
    pub by_type: Vec<TypeCount>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeCount {
    pub operation: String,
    pub count: i64,
}

impl DbManager {
    /// Log a new operation
    pub fn log_operation(&self, op: &NewOperation) -> Result<i64> {
        let conn = self.get_conn()?;
        let metadata_str = op
            .metadata
            .as_ref()
            .map(|m| serde_json::to_string(m).unwrap_or_default());

        conn.execute(
            r#"
            INSERT INTO operations (account_id, bucket, operation, source_key, dest_key, size, status, metadata)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                op.account_id,
                op.bucket,
                op.operation.to_string(),
                op.source_key,
                op.dest_key,
                op.size,
                op.status.to_string(),
                metadata_str,
            ],
        )
        .map_err(|e| AppError::Storage(format!("Failed to log operation: {}", e)))?;

        Ok(conn.last_insert_rowid())
    }

    /// Log a completed operation with duration (convenience method)
    pub fn log_completed_operation(
        &self,
        account_id: &str,
        bucket: &str,
        operation: OperationType,
        source_key: Option<&str>,
        dest_key: Option<&str>,
        size: Option<i64>,
        duration_ms: i64,
        error: Option<&str>,
    ) -> Result<i64> {
        let conn = self.get_conn()?;
        let status = if error.is_some() {
            OperationStatus::Failed
        } else {
            OperationStatus::Completed
        };

        conn.execute(
            r#"
            INSERT INTO operations (account_id, bucket, operation, source_key, dest_key, size, duration_ms, status, error_message)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                account_id,
                bucket,
                operation.to_string(),
                source_key,
                dest_key,
                size,
                duration_ms,
                status.to_string(),
                error,
            ],
        )
        .map_err(|e| AppError::Storage(format!("Failed to log operation: {}", e)))?;

        Ok(conn.last_insert_rowid())
    }

    /// Update operation status
    pub fn update_operation_status(
        &self,
        id: i64,
        status: OperationStatus,
        duration_ms: Option<i64>,
        error: Option<&str>,
    ) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute(
            "UPDATE operations SET status = ?1, duration_ms = ?2, error_message = ?3 WHERE id = ?4",
            params![status.to_string(), duration_ms, error, id],
        )
        .map_err(|e| AppError::Storage(format!("Failed to update operation status: {}", e)))?;

        Ok(())
    }

    /// Query operations with filters
    pub fn query_operations(&self, filter: &OperationFilter) -> Result<Vec<Operation>> {
        let conn = self.get_conn()?;

        let mut sql = String::from(
            r#"
            SELECT id, timestamp, account_id, bucket, operation, source_key, dest_key,
                   size, duration_ms, status, error_message, metadata
            FROM operations
            WHERE 1=1
            "#,
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(account_id) = &filter.account_id {
            sql.push_str(" AND account_id = ?");
            params.push(Box::new(account_id.clone()));
        }

        if let Some(bucket) = &filter.bucket {
            sql.push_str(" AND bucket = ?");
            params.push(Box::new(bucket.clone()));
        }

        if let Some(operation) = &filter.operation {
            sql.push_str(" AND operation = ?");
            params.push(Box::new(operation.to_string()));
        }

        if let Some(status) = &filter.status {
            sql.push_str(" AND status = ?");
            params.push(Box::new(status.to_string()));
        }

        if let Some(from_ts) = filter.from_timestamp {
            sql.push_str(" AND timestamp >= ?");
            params.push(Box::new(from_ts));
        }

        if let Some(to_ts) = filter.to_timestamp {
            sql.push_str(" AND timestamp <= ?");
            params.push(Box::new(to_ts));
        }

        if let Some(search) = &filter.search {
            sql.push_str(" AND (source_key LIKE ? OR dest_key LIKE ?)");
            let pattern = format!("%{}%", search);
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern));
        }

        sql.push_str(" ORDER BY timestamp DESC");

        if let Some(limit) = filter.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        } else {
            sql.push_str(" LIMIT 100"); // Default limit
        }

        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::Storage(format!("Failed to prepare query: {}", e)))?;

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let operations = stmt
            .query_map(params_refs.as_slice(), |row| Operation::from_row(row))
            .map_err(|e| AppError::Storage(format!("Failed to query operations: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(operations)
    }

    /// Get operation statistics
    pub fn get_operation_stats(
        &self,
        account_id: Option<&str>,
        bucket: Option<&str>,
        days: i64,
    ) -> Result<OperationStats> {
        let conn = self.get_conn()?;
        let cutoff = chrono::Utc::now().timestamp() - (days * 86400);

        let mut base_where = format!("timestamp >= {}", cutoff);
        if let Some(aid) = account_id {
            base_where.push_str(&format!(" AND account_id = '{}'", aid));
        }
        if let Some(b) = bucket {
            base_where.push_str(&format!(" AND bucket = '{}'", b));
        }

        // Total operations
        let total_operations: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM operations WHERE {}", base_where),
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Total bytes
        let total_bytes: i64 = conn
            .query_row(
                &format!(
                    "SELECT COALESCE(SUM(size), 0) FROM operations WHERE {}",
                    base_where
                ),
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Completed count
        let completed: i64 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM operations WHERE {} AND status = 'completed'",
                    base_where
                ),
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Failed count
        let failed: i64 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM operations WHERE {} AND status = 'failed'",
                    base_where
                ),
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // By type
        let mut stmt = conn
            .prepare(&format!(
                "SELECT operation, COUNT(*) as count FROM operations WHERE {} GROUP BY operation ORDER BY count DESC",
                base_where
            ))
            .map_err(|e| AppError::Storage(format!("Failed to prepare stats query: {}", e)))?;

        let by_type: Vec<TypeCount> = stmt
            .query_map([], |row| {
                Ok(TypeCount {
                    operation: row.get(0)?,
                    count: row.get(1)?,
                })
            })
            .map_err(|e| AppError::Storage(format!("Failed to get stats by type: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(OperationStats {
            total_operations,
            total_bytes,
            completed,
            failed,
            by_type,
        })
    }

    /// Cleanup old operations (older than specified days)
    pub fn cleanup_old_operations(&self, days: i64) -> Result<usize> {
        let conn = self.get_conn()?;
        let cutoff = chrono::Utc::now().timestamp() - (days * 86400);

        let deleted = conn
            .execute("DELETE FROM operations WHERE timestamp < ?1", params![cutoff])
            .map_err(|e| AppError::Storage(format!("Failed to cleanup operations: {}", e)))?;

        log::info!("Cleaned up {} old operations (older than {} days)", deleted, days);
        Ok(deleted)
    }

    /// Get a single operation by ID
    pub fn get_operation(&self, id: i64) -> Result<Option<Operation>> {
        let conn = self.get_conn()?;

        let result = conn.query_row(
            r#"
            SELECT id, timestamp, account_id, bucket, operation, source_key, dest_key,
                   size, duration_ms, status, error_message, metadata
            FROM operations
            WHERE id = ?1
            "#,
            params![id],
            |row| Operation::from_row(row),
        );

        match result {
            Ok(op) => Ok(Some(op)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Storage(format!("Failed to get operation: {}", e))),
        }
    }

    /// Count total operations matching filter
    pub fn count_operations(&self, filter: &OperationFilter) -> Result<i64> {
        let conn = self.get_conn()?;

        let mut sql = String::from("SELECT COUNT(*) FROM operations WHERE 1=1");
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(account_id) = &filter.account_id {
            sql.push_str(" AND account_id = ?");
            params.push(Box::new(account_id.clone()));
        }

        if let Some(bucket) = &filter.bucket {
            sql.push_str(" AND bucket = ?");
            params.push(Box::new(bucket.clone()));
        }

        if let Some(operation) = &filter.operation {
            sql.push_str(" AND operation = ?");
            params.push(Box::new(operation.to_string()));
        }

        if let Some(status) = &filter.status {
            sql.push_str(" AND status = ?");
            params.push(Box::new(status.to_string()));
        }

        if let Some(from_ts) = filter.from_timestamp {
            sql.push_str(" AND timestamp >= ?");
            params.push(Box::new(from_ts));
        }

        if let Some(to_ts) = filter.to_timestamp {
            sql.push_str(" AND timestamp <= ?");
            params.push(Box::new(to_ts));
        }

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let count: i64 = conn
            .query_row(&sql, params_refs.as_slice(), |row| row.get(0))
            .map_err(|e| AppError::Storage(format!("Failed to count operations: {}", e)))?;

        Ok(count)
    }
}
