export interface Account {
  id: string;
  name: string;
  endpoint: string;
  accessKeyId: string;
  accountId: string; // R2 Cloudflare account ID
}

export interface Bucket {
  name: string;
  creationDate?: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified?: string;
  etag?: string;
  isFolder: boolean;
}

export interface ListObjectsResponse {
  objects: S3Object[];
  folders: string[];
  continuationToken?: string;
  isTruncated: boolean;
  prefix?: string;
}

export interface ObjectMetadata {
  key: string;
  size: number;
  contentType?: string;
  lastModified?: string;
  etag?: string;
}

export type PreviewContent =
  | { type: "Text"; content: string; truncated: boolean }
  | { type: "Image"; base64: string; mimeType: string }
  | { type: "Json"; content: unknown }
  | { type: "Unsupported"; message: string };

export interface PreviewData {
  contentType: string;
  size: number;
  data: PreviewContent;
}

// For file display
export interface FileItem {
  name: string;
  key: string;
  size: number;
  lastModified?: string;
  isFolder: boolean;
}

// Thumbnail data
export interface ThumbnailData {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}

// Upload types
export type UploadStatus = "pending" | "uploading" | "completed" | "failed" | "cancelled";

export interface UploadItem {
  id: string;
  file: File | null; // null when using native file path
  filePath?: string; // native file path for Tauri drag and drop
  key: string;
  status: UploadStatus;
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// Upload event payloads (used with Tauri global events)
export interface UploadStartedPayload {
  uploadId: string;
  fileName: string;
  totalBytes: number;
}

export interface UploadProgressPayload {
  uploadId: string;
  bytesUploaded: number;
  totalBytes: number;
}

export interface UploadCompletedPayload {
  uploadId: string;
  key: string;
  etag?: string;
}

export interface UploadFailedPayload {
  uploadId: string;
  error: string;
}

// Delete types
export interface DeleteResult {
  deleted: number;
  errors: DeleteError[];
}

export interface DeleteError {
  key: string;
  error: string;
}

// Download types
export type DownloadStatus = "pending" | "downloading" | "completed" | "failed" | "cancelled";

export interface DownloadItem {
  id: string;
  key: string;
  fileName: string;
  status: DownloadStatus;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  path?: string; // Final downloaded file path
}

// Download event payloads (used with Tauri global events)
export interface DownloadStartedPayload {
  downloadId: string;
  fileName: string;
  totalBytes: number;
}

export interface DownloadProgressPayload {
  downloadId: string;
  bytesDownloaded: number;
  totalBytes: number;
}

export interface DownloadCompletedPayload {
  downloadId: string;
  key: string;
  path: string;
}

export interface DownloadFailedPayload {
  downloadId: string;
  error: string;
}
