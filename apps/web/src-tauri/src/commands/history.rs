use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::operations::{
    NewOperation, Operation, OperationFilter, OperationStats, OperationStatus, OperationType,
};
use crate::db::DbManager;
use crate::error::Result;

/// Response for paginated operations
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationsResponse {
    pub operations: Vec<Operation>,
    pub total: i64,
    pub has_more: bool,
}

/// Export format
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Csv,
    Json,
}

/// Get operations with pagination
#[tauri::command]
pub async fn get_operations(
    db: State<'_, DbManager>,
    filter: OperationFilter,
) -> Result<OperationsResponse> {
    let total = db.count_operations(&filter)?;
    let operations = db.query_operations(&filter)?;
    let limit = filter.limit.unwrap_or(100);
    let offset = filter.offset.unwrap_or(0);
    let has_more = (offset + operations.len() as i64) < total;

    Ok(OperationsResponse {
        operations,
        total,
        has_more,
    })
}

/// Get operation statistics
#[tauri::command]
pub async fn get_operation_stats(
    db: State<'_, DbManager>,
    account_id: Option<String>,
    bucket: Option<String>,
    days: Option<i64>,
) -> Result<OperationStats> {
    db.get_operation_stats(
        account_id.as_deref(),
        bucket.as_deref(),
        days.unwrap_or(30),
    )
}

/// Cleanup old operations
#[tauri::command]
pub async fn cleanup_history(db: State<'_, DbManager>, days: Option<i64>) -> Result<usize> {
    db.cleanup_old_operations(days.unwrap_or(30))
}

/// Export operations to CSV or JSON
#[tauri::command]
pub async fn export_operations(
    db: State<'_, DbManager>,
    filter: OperationFilter,
    format: ExportFormat,
) -> Result<String> {
    // Get all operations matching filter (no limit for export)
    let mut export_filter = filter;
    export_filter.limit = Some(10000); // Reasonable max for export
    export_filter.offset = None;

    let operations = db.query_operations(&export_filter)?;

    match format {
        ExportFormat::Csv => {
            let mut csv = String::from(
                "id,timestamp,account_id,bucket,operation,source_key,dest_key,size,duration_ms,status,error_message\n",
            );

            for op in operations {
                csv.push_str(&format!(
                    "{},{},{},{},{},{},{},{},{},{},{}\n",
                    op.id,
                    op.timestamp,
                    escape_csv(&op.account_id),
                    escape_csv(&op.bucket),
                    op.operation.to_string(),
                    escape_csv(&op.source_key.unwrap_or_default()),
                    escape_csv(&op.dest_key.unwrap_or_default()),
                    op.size.unwrap_or(0),
                    op.duration_ms.unwrap_or(0),
                    op.status.to_string(),
                    escape_csv(&op.error_message.unwrap_or_default()),
                ));
            }

            Ok(csv)
        }
        ExportFormat::Json => {
            serde_json::to_string_pretty(&operations)
                .map_err(|e| crate::error::AppError::Storage(format!("Failed to serialize: {}", e)))
        }
    }
}

/// Get a single operation by ID
#[tauri::command]
pub async fn get_operation(db: State<'_, DbManager>, id: i64) -> Result<Option<Operation>> {
    db.get_operation(id)
}

/// Input for logging an operation from the frontend
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogOperationInput {
    pub account_id: String,
    pub bucket: String,
    pub operation: OperationType,
    pub source_key: Option<String>,
    pub dest_key: Option<String>,
    pub size: Option<i64>,
    pub status: OperationStatus,
    pub duration_ms: Option<i64>,
    pub error_message: Option<String>,
}

/// Log an operation (called from frontend after S3 operations)
#[tauri::command]
pub async fn log_operation(db: State<'_, DbManager>, input: LogOperationInput) -> Result<i64> {
    let op = NewOperation {
        account_id: input.account_id,
        bucket: input.bucket,
        operation: input.operation,
        source_key: input.source_key,
        dest_key: input.dest_key,
        size: input.size,
        status: input.status.clone(),
        metadata: None,
    };

    let id = db.log_operation(&op)?;

    // If operation is already completed/failed, update with duration and error
    if input.status == OperationStatus::Completed || input.status == OperationStatus::Failed {
        db.update_operation_status(
            id,
            input.status,
            input.duration_ms,
            input.error_message.as_deref(),
        )?;
    }

    Ok(id)
}

/// Update an operation's status (for long-running operations)
#[tauri::command]
pub async fn update_operation(
    db: State<'_, DbManager>,
    id: i64,
    status: OperationStatus,
    duration_ms: Option<i64>,
    error_message: Option<String>,
) -> Result<()> {
    db.update_operation_status(id, status, duration_ms, error_message.as_deref())
}

/// Helper function to escape CSV values
fn escape_csv(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
