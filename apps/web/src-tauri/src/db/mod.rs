pub mod duplicates;
pub mod migrations;
pub mod operations;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;

use crate::error::{AppError, Result};

/// Database manager with connection pooling
#[derive(Clone)]
pub struct DbManager {
    pool: Pool<SqliteConnectionManager>,
}

impl DbManager {
    /// Create a new database manager
    pub fn new() -> Result<Self> {
        let db_path = get_db_path()?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::Storage(format!("Failed to create database directory: {}", e))
            })?;
        }

        let manager = SqliteConnectionManager::file(&db_path);
        let pool = Pool::builder()
            .max_size(4)
            .build(manager)
            .map_err(|e| AppError::Storage(format!("Failed to create connection pool: {}", e)))?;

        // Initialize database with WAL mode and run migrations
        {
            let conn = pool.get().map_err(|e| {
                AppError::Storage(format!("Failed to get connection: {}", e))
            })?;

            // Enable WAL mode for better concurrent access
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;",
            )
            .map_err(|e| AppError::Storage(format!("Failed to configure database: {}", e)))?;

            // Run migrations
            migrations::run_migrations(&conn)?;
        }

        log::info!("Database initialized at {:?}", db_path);

        Ok(Self { pool })
    }

    /// Get a connection from the pool
    pub fn get_conn(
        &self,
    ) -> Result<r2d2::PooledConnection<SqliteConnectionManager>> {
        self.pool
            .get()
            .map_err(|e| AppError::Storage(format!("Failed to get database connection: {}", e)))
    }
}

/// Get the database path for the current platform
fn get_db_path() -> Result<PathBuf> {
    let data_dir = dirs::data_dir().ok_or_else(|| {
        AppError::Storage("Could not determine data directory".to_string())
    })?;

    Ok(data_dir.join("bucketscout").join("data.db"))
}

