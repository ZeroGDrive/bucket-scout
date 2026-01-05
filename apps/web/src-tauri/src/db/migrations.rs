use rusqlite::Connection;

use crate::error::{AppError, Result};

/// Current schema version
const SCHEMA_VERSION: i32 = 1;

/// Run database migrations
pub fn run_migrations(conn: &Connection) -> Result<()> {
    let current_version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| AppError::Storage(format!("Failed to get schema version: {}", e)))?;

    log::info!(
        "Database schema version: {}, target: {}",
        current_version,
        SCHEMA_VERSION
    );

    if current_version < 1 {
        migrate_v1(conn)?;
    }

    // Set the current schema version
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|e| AppError::Storage(format!("Failed to update schema version: {}", e)))?;

    Ok(())
}

/// Migration v1: Initial schema with operations history
fn migrate_v1(conn: &Connection) -> Result<()> {
    log::info!("Running migration v1: Operations history schema");

    conn.execute_batch(
        r#"
        -- Operations history table
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

            -- Context
            account_id TEXT NOT NULL,
            bucket TEXT NOT NULL,

            -- Operation details
            operation TEXT NOT NULL,
            source_key TEXT,
            dest_key TEXT,

            -- Metrics
            size INTEGER,
            duration_ms INTEGER,

            -- Status
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,

            -- Extensibility
            metadata TEXT
        );

        -- Indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_ops_timestamp ON operations(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_ops_account_bucket ON operations(account_id, bucket);
        CREATE INDEX IF NOT EXISTS idx_ops_status ON operations(status) WHERE status IN ('pending', 'in_progress');
        CREATE INDEX IF NOT EXISTS idx_ops_operation ON operations(operation);

        -- Duplicate scans table
        CREATE TABLE IF NOT EXISTS duplicate_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            bucket TEXT NOT NULL,
            prefix TEXT DEFAULT '',
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            status TEXT NOT NULL DEFAULT 'running',
            total_files INTEGER DEFAULT 0,
            total_size INTEGER DEFAULT 0,
            duplicate_groups INTEGER DEFAULT 0,
            duplicate_files INTEGER DEFAULT 0,
            reclaimable_bytes INTEGER DEFAULT 0,
            error_message TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_dup_scans_account ON duplicate_scans(account_id, bucket);

        -- Duplicate groups table
        CREATE TABLE IF NOT EXISTS duplicate_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id INTEGER NOT NULL REFERENCES duplicate_scans(id) ON DELETE CASCADE,
            content_hash TEXT NOT NULL,
            hash_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_count INTEGER NOT NULL,
            UNIQUE(scan_id, content_hash)
        );

        CREATE INDEX IF NOT EXISTS idx_dup_groups_scan ON duplicate_groups(scan_id);

        -- Duplicate files table
        CREATE TABLE IF NOT EXISTS duplicate_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            etag TEXT,
            last_modified INTEGER,
            storage_class TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_dup_files_group ON duplicate_files(group_id);

        -- Sync pairs configuration
        CREATE TABLE IF NOT EXISTS sync_pairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            local_path TEXT NOT NULL,
            account_id TEXT NOT NULL,
            bucket TEXT NOT NULL,
            remote_prefix TEXT DEFAULT '',

            -- Settings
            sync_direction TEXT DEFAULT 'bidirectional',
            delete_propagation INTEGER DEFAULT 1,

            -- State
            status TEXT DEFAULT 'idle',
            last_sync_at INTEGER,
            last_error TEXT,

            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

            UNIQUE(local_path, account_id, bucket, remote_prefix)
        );

        -- Local file state snapshot
        CREATE TABLE IF NOT EXISTS sync_local_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_pair_id INTEGER NOT NULL REFERENCES sync_pairs(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL,
            size INTEGER NOT NULL,
            mtime_ms INTEGER NOT NULL,
            content_hash TEXT,
            is_deleted INTEGER DEFAULT 0,
            last_seen_at INTEGER NOT NULL,

            UNIQUE(sync_pair_id, relative_path)
        );

        CREATE INDEX IF NOT EXISTS idx_sync_local_pair ON sync_local_files(sync_pair_id);

        -- Remote file state snapshot
        CREATE TABLE IF NOT EXISTS sync_remote_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_pair_id INTEGER NOT NULL REFERENCES sync_pairs(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL,
            size INTEGER NOT NULL,
            etag TEXT,
            content_hash TEXT,
            last_modified INTEGER,
            is_deleted INTEGER DEFAULT 0,
            last_seen_at INTEGER NOT NULL,

            UNIQUE(sync_pair_id, relative_path)
        );

        CREATE INDEX IF NOT EXISTS idx_sync_remote_pair ON sync_remote_files(sync_pair_id);

        -- Pending conflicts awaiting user resolution
        CREATE TABLE IF NOT EXISTS sync_conflicts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_pair_id INTEGER NOT NULL REFERENCES sync_pairs(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL,

            local_size INTEGER,
            local_mtime INTEGER,
            local_hash TEXT,

            remote_size INTEGER,
            remote_mtime INTEGER,
            remote_hash TEXT,

            resolution TEXT,
            resolved_at INTEGER,

            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

            UNIQUE(sync_pair_id, relative_path)
        );

        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_unresolved ON sync_conflicts(sync_pair_id)
            WHERE resolution IS NULL;

        -- Sync session tracking
        CREATE TABLE IF NOT EXISTS sync_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_pair_id INTEGER NOT NULL REFERENCES sync_pairs(id) ON DELETE CASCADE,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            status TEXT NOT NULL,

            files_uploaded INTEGER DEFAULT 0,
            files_downloaded INTEGER DEFAULT 0,
            files_deleted_local INTEGER DEFAULT 0,
            files_deleted_remote INTEGER DEFAULT 0,
            conflicts_found INTEGER DEFAULT 0,
            bytes_transferred INTEGER DEFAULT 0,

            error_message TEXT
        );
        "#,
    )
    .map_err(|e| AppError::Storage(format!("Failed to run migration v1: {}", e)))?;

    log::info!("Migration v1 completed successfully");
    Ok(())
}
