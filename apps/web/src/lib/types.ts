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
export type UploadStatus =
  | "pending"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
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
