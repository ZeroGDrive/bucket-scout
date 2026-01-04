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
