use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

/// Analytics progress event sent to frontend
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsProgress {
    pub objects_processed: usize,
    pub current_prefix: String,
}

/// Statistics for a folder/prefix
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStats {
    pub prefix: String,
    pub name: String,
    pub size: i64,
    pub object_count: usize,
}

/// Statistics by content type category
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentTypeStats {
    pub content_type: String,
    pub size: i64,
    pub object_count: usize,
}

/// Statistics by storage class
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageClassStats {
    pub storage_class: String,
    pub size: i64,
    pub object_count: usize,
}

/// Information about a large file
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    pub key: String,
    pub size: i64,
    pub last_modified: Option<String>,
    pub storage_class: Option<String>,
}

/// Complete bucket analytics response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketAnalytics {
    pub total_size: i64,
    pub total_objects: usize,
    pub folders: Vec<FolderStats>,
    pub by_content_type: Vec<ContentTypeStats>,
    pub by_storage_class: Vec<StorageClassStats>,
    pub largest_files: Vec<LargeFile>,
    pub calculated_at: String,
}

/// Categorize a file extension into a content type category
fn categorize_by_extension(key: &str) -> &'static str {
    let ext = key
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "ico" | "bmp" | "tiff" | "heic" => "Images",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "rtf" | "odt" => "Documents",
        "mp4" | "avi" | "mov" | "mkv" | "webm" | "flv" | "wmv" | "m4v" => "Video",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => "Audio",
        "zip" | "tar" | "gz" | "rar" | "7z" | "bz2" | "xz" | "tgz" => "Archives",
        "js" | "ts" | "jsx" | "tsx" | "py" | "rs" | "go" | "java" | "c" | "cpp" | "h" | "hpp" | "cs" | "rb" | "php" | "swift" | "kt" => "Code",
        "json" | "yaml" | "yml" | "xml" | "toml" | "csv" | "ini" | "conf" => "Data",
        "html" | "htm" | "css" | "scss" | "sass" | "less" => "Web",
        _ => "Other",
    }
}

/// Extract the top-level folder from an object key
fn extract_top_folder(key: &str, base_prefix: Option<&str>) -> Option<String> {
    // Remove base prefix if provided
    let relative_key = match base_prefix {
        Some(prefix) if key.starts_with(prefix) => &key[prefix.len()..],
        _ => key,
    };

    // Find the first path segment
    if let Some(slash_pos) = relative_key.find('/') {
        let folder_name = &relative_key[..slash_pos];
        if !folder_name.is_empty() {
            // Return full prefix path for this folder
            return Some(match base_prefix {
                Some(prefix) => format!("{}{}/", prefix, folder_name),
                None => format!("{}/", folder_name),
            });
        }
    }

    None
}

/// Maintains a sorted list of the N largest files
struct TopNTracker {
    files: Vec<LargeFile>,
    capacity: usize,
}

impl TopNTracker {
    fn new(capacity: usize) -> Self {
        Self {
            files: Vec::with_capacity(capacity + 1),
            capacity,
        }
    }

    fn add(&mut self, file: LargeFile) {
        // Find insertion position (sorted by size descending)
        let pos = self.files.iter().position(|f| f.size < file.size).unwrap_or(self.files.len());

        // Only insert if within capacity or larger than smallest
        if pos < self.capacity {
            self.files.insert(pos, file);
            if self.files.len() > self.capacity {
                self.files.pop();
            }
        }
    }

    fn into_vec(self) -> Vec<LargeFile> {
        self.files
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_bucket_analytics(
    app: AppHandle,
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    prefix: Option<String>,
    top_n_largest: Option<usize>,
    top_n_folders: Option<usize>,
) -> Result<BucketAnalytics, AppError> {
    let account = credentials.get_account(&account_id)?;
    let secret = credentials.get_secret_key(&account_id)?;

    let client = s3_clients
        .get_or_create_client(
            &account_id,
            &account.endpoint,
            &account.access_key_id,
            &secret,
            account.provider_type,
            account.region.as_deref(),
        )
        .await?;

    let top_n_largest = top_n_largest.unwrap_or(20);
    let top_n_folders = top_n_folders.unwrap_or(10);

    // Accumulators
    let mut total_size: i64 = 0;
    let mut total_objects: usize = 0;
    let mut folder_stats: HashMap<String, (i64, usize)> = HashMap::new(); // prefix -> (size, count)
    let mut content_type_stats: HashMap<&str, (i64, usize)> = HashMap::new();
    let mut storage_class_stats: HashMap<String, (i64, usize)> = HashMap::new();
    let mut largest_tracker = TopNTracker::new(top_n_largest);

    let mut continuation_token: Option<String> = None;
    let prefix_ref = prefix.as_deref();

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(&bucket);

        // No delimiter - flat listing to get all objects
        if let Some(ref p) = prefix {
            request = request.prefix(p);
        }

        if let Some(token) = &continuation_token {
            request = request.continuation_token(token);
        }

        let response = request.send().await?;

        for obj in response.contents() {
            let key = match obj.key() {
                Some(k) => k,
                None => continue,
            };

            // Skip folder placeholders (keys ending with /)
            if key.ends_with('/') {
                continue;
            }

            let size = obj.size().unwrap_or(0);
            let storage_class = obj.storage_class().map(|s| s.as_str().to_string());

            // Update totals
            total_size += size;
            total_objects += 1;

            // Update folder stats
            if let Some(folder_prefix) = extract_top_folder(key, prefix_ref) {
                let entry = folder_stats.entry(folder_prefix).or_insert((0, 0));
                entry.0 += size;
                entry.1 += 1;
            }

            // Update content type stats
            let category = categorize_by_extension(key);
            let entry = content_type_stats.entry(category).or_insert((0, 0));
            entry.0 += size;
            entry.1 += 1;

            // Update storage class stats
            let storage_class_key = storage_class.clone().unwrap_or_else(|| "STANDARD".to_string());
            let entry = storage_class_stats.entry(storage_class_key).or_insert((0, 0));
            entry.0 += size;
            entry.1 += 1;

            // Track large files
            largest_tracker.add(LargeFile {
                key: key.to_string(),
                size,
                last_modified: obj.last_modified().map(|d| d.to_string()),
                storage_class,
            });

            // Emit progress every 1000 objects
            if total_objects % 1000 == 0 {
                let _ = app.emit("analytics-progress", AnalyticsProgress {
                    objects_processed: total_objects,
                    current_prefix: key.rsplit('/').nth(1).unwrap_or("").to_string(),
                });
            }
        }

        // Check for more pages
        if response.is_truncated() == Some(true) {
            continuation_token = response.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    // Convert folder stats to sorted vec (top N by size)
    let mut folders: Vec<FolderStats> = folder_stats
        .into_iter()
        .map(|(prefix, (size, count))| {
            let name = prefix
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .unwrap_or(&prefix)
                .to_string();
            FolderStats {
                prefix,
                name,
                size,
                object_count: count,
            }
        })
        .collect();
    folders.sort_by(|a, b| b.size.cmp(&a.size));
    folders.truncate(top_n_folders);

    // Convert content type stats to sorted vec
    let mut by_content_type: Vec<ContentTypeStats> = content_type_stats
        .into_iter()
        .map(|(content_type, (size, count))| ContentTypeStats {
            content_type: content_type.to_string(),
            size,
            object_count: count,
        })
        .collect();
    by_content_type.sort_by(|a, b| b.size.cmp(&a.size));

    // Convert storage class stats to sorted vec
    let mut by_storage_class: Vec<StorageClassStats> = storage_class_stats
        .into_iter()
        .map(|(storage_class, (size, count))| StorageClassStats {
            storage_class,
            size,
            object_count: count,
        })
        .collect();
    by_storage_class.sort_by(|a, b| b.size.cmp(&a.size));

    Ok(BucketAnalytics {
        total_size,
        total_objects,
        folders,
        by_content_type,
        by_storage_class,
        largest_files: largest_tracker.into_vec(),
        calculated_at: Utc::now().to_rfc3339(),
    })
}
