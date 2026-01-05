use crate::credentials::CredentialsManager;
use crate::error::AppError;
use crate::s3::client::S3ClientManager;
use image::ImageFormat;
use serde::Serialize;
use std::io::Cursor;
use tauri::State;

const MAX_PREVIEW_SIZE: i64 = 5 * 1024 * 1024; // 5MB default limit
const MAX_TEXT_PREVIEW_SIZE: i64 = 1024 * 1024; // 1MB for text
const MAX_PDF_SIZE: i64 = 20 * 1024 * 1024; // 20MB for PDFs
const MAX_THUMBNAIL_SOURCE_SIZE: i64 = 10 * 1024 * 1024; // 10MB max source for thumbnails
const DEFAULT_THUMBNAIL_SIZE: u32 = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum PreviewContent {
    Text { content: String, truncated: bool },
    Image {
        base64: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    Json { content: serde_json::Value },
    Pdf { base64: String },
    Unsupported { message: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewData {
    pub content_type: String,
    pub size: i64,
    pub data: PreviewContent,
}

fn get_content_type_from_extension(key: &str) -> Option<&'static str> {
    let ext = key.rsplit('.').next()?.to_lowercase();
    match ext.as_str() {
        // Images
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "bmp" => Some("image/bmp"),

        // Text
        "txt" => Some("text/plain"),
        "md" => Some("text/markdown"),
        "csv" => Some("text/csv"),
        "log" => Some("text/plain"),

        // Code
        "json" => Some("application/json"),
        "js" => Some("application/javascript"),
        "ts" => Some("application/typescript"),
        "jsx" => Some("text/jsx"),
        "tsx" => Some("text/tsx"),
        "html" => Some("text/html"),
        "css" => Some("text/css"),
        "xml" => Some("application/xml"),
        "yaml" | "yml" => Some("application/yaml"),
        "toml" => Some("application/toml"),
        "rs" => Some("text/x-rust"),
        "py" => Some("text/x-python"),
        "go" => Some("text/x-go"),
        "java" => Some("text/x-java"),
        "sh" => Some("text/x-shellscript"),

        // PDF
        "pdf" => Some("application/pdf"),

        _ => None,
    }
}

fn is_pdf_content_type(content_type: &str) -> bool {
    content_type == "application/pdf"
}

fn is_text_content_type(content_type: &str) -> bool {
    content_type.starts_with("text/")
        || content_type == "application/json"
        || content_type == "application/javascript"
        || content_type == "application/typescript"
        || content_type == "application/xml"
        || content_type == "application/yaml"
        || content_type == "application/toml"
}

fn is_image_content_type(content_type: &str) -> bool {
    content_type.starts_with("image/")
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_preview(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    key: String,
    max_size: Option<i64>,
) -> Result<PreviewData, AppError> {
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

    // First, get metadata to check size and content type
    let head = client
        .head_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await?;

    let size = head.content_length().unwrap_or(0);
    let max_allowed = max_size.unwrap_or(MAX_PREVIEW_SIZE);

    // Determine content type
    let content_type = head
        .content_type()
        .map(|s| s.to_string())
        .or_else(|| get_content_type_from_extension(&key).map(|s| s.to_string()))
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Check if we can preview this type
    if !is_text_content_type(&content_type)
        && !is_image_content_type(&content_type)
        && !is_pdf_content_type(&content_type)
    {
        return Ok(PreviewData {
            content_type,
            size,
            data: PreviewContent::Unsupported {
                message: "This file type cannot be previewed".to_string(),
            },
        });
    }

    // Check size limits for images
    if is_image_content_type(&content_type) && size > max_allowed {
        return Ok(PreviewData {
            content_type,
            size,
            data: PreviewContent::Unsupported {
                message: format!("Image too large for preview ({} bytes)", size),
            },
        });
    }

    // Check size limits for PDFs
    if is_pdf_content_type(&content_type) && size > MAX_PDF_SIZE {
        return Ok(PreviewData {
            content_type,
            size,
            data: PreviewContent::Unsupported {
                message: format!("PDF too large for preview ({} bytes)", size),
            },
        });
    }

    // Handle PDF preview
    if is_pdf_content_type(&content_type) {
        let response = client.get_object().bucket(&bucket).key(&key).send().await?;
        let body = response
            .body
            .collect()
            .await
            .map_err(|e| AppError::S3(format!("Failed to read body: {}", e)))?;
        let bytes = body.into_bytes();

        use base64::Engine;
        let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

        return Ok(PreviewData {
            content_type,
            size,
            data: PreviewContent::Pdf { base64 },
        });
    }

    // Fetch the object content
    let mut get_request = client.get_object().bucket(&bucket).key(&key);

    // For text files, limit the range if too large
    let text_limit = MAX_TEXT_PREVIEW_SIZE.min(max_allowed);
    let truncated = if is_text_content_type(&content_type) && size > text_limit {
        get_request = get_request.range(format!("bytes=0-{}", text_limit - 1));
        true
    } else {
        false
    };

    let response = get_request.send().await?;
    let body = response
        .body
        .collect()
        .await
        .map_err(|e| AppError::S3(format!("Failed to read body: {}", e)))?;
    let bytes = body.into_bytes();

    // Process based on content type
    let data = if is_image_content_type(&content_type) {
        use base64::Engine;
        let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        PreviewContent::Image {
            base64,
            mime_type: content_type.clone(),
        }
    } else if content_type == "application/json" {
        // Try to parse as JSON
        match serde_json::from_slice(&bytes) {
            Ok(json) => PreviewContent::Json { content: json },
            Err(_) => {
                // Fall back to text if JSON parsing fails
                let content = String::from_utf8_lossy(&bytes).to_string();
                PreviewContent::Text { content, truncated }
            }
        }
    } else {
        // Text content
        let content = String::from_utf8_lossy(&bytes).to_string();
        PreviewContent::Text { content, truncated }
    };

    Ok(PreviewData {
        content_type,
        size,
        data,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailData {
    pub base64: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_thumbnail(
    credentials: State<'_, CredentialsManager>,
    s3_clients: State<'_, S3ClientManager>,
    account_id: String,
    bucket: String,
    key: String,
    size: Option<u32>,
) -> Result<Option<ThumbnailData>, AppError> {
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

    // First, get metadata to check if this is an image and its size
    let head = client
        .head_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await?;

    let file_size = head.content_length().unwrap_or(0);

    // Determine content type
    let content_type = head
        .content_type()
        .map(|s| s.to_string())
        .or_else(|| get_content_type_from_extension(&key).map(|s| s.to_string()))
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Only process images
    if !is_image_content_type(&content_type) {
        return Ok(None);
    }

    // Skip SVG - we can't resize them with image crate
    if content_type == "image/svg+xml" {
        return Ok(None);
    }

    // Check if source is too large
    if file_size > MAX_THUMBNAIL_SOURCE_SIZE {
        return Ok(None);
    }

    // Fetch the image
    let response = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await?;

    let body = response
        .body
        .collect()
        .await
        .map_err(|e| AppError::S3(format!("Failed to read body: {}", e)))?;
    let bytes = body.into_bytes();

    // Decode the image
    let img = match image::load_from_memory(&bytes) {
        Ok(img) => img,
        Err(_) => return Ok(None), // Can't decode, skip thumbnail
    };

    let thumb_size = size.unwrap_or(DEFAULT_THUMBNAIL_SIZE);

    // Resize to thumbnail
    let thumbnail = img.thumbnail(thumb_size, thumb_size);
    let (width, height) = (thumbnail.width(), thumbnail.height());

    // Encode as JPEG for smaller size
    let mut output = Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut output, ImageFormat::Jpeg)
        .map_err(|e| AppError::S3(format!("Failed to encode thumbnail: {}", e)))?;

    use base64::Engine;
    let base64 = base64::engine::general_purpose::STANDARD.encode(output.into_inner());

    Ok(Some(ThumbnailData {
        base64,
        mime_type: "image/jpeg".to_string(),
        width,
        height,
    }))
}
