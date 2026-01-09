export type ProviderType = "cloudflare_r2" | "aws_s3";

export interface Account {
  id: string;
  name: string;
  endpoint: string;
  accessKeyId: string;
  providerType: ProviderType;
  // Provider-specific fields
  cloudflareAccountId?: string; // R2 only
  region?: string; // AWS S3
  // Legacy field for backwards compatibility
  accountId?: string;
}

// Provider configuration for UI
export interface ProviderConfig {
  value: ProviderType;
  label: string;
  description: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    value: "cloudflare_r2",
    label: "Cloudflare R2",
    description: "S3-compatible object storage from Cloudflare",
  },
  {
    value: "aws_s3",
    label: "Amazon S3",
    description: "Amazon Web Services S3",
  },
];

// R2 location hints for bucket creation
export const R2_LOCATIONS = [
  { value: "wnam", label: "Western North America" },
  { value: "enam", label: "Eastern North America" },
  { value: "weur", label: "Western Europe" },
  { value: "eeur", label: "Eastern Europe" },
  { value: "apac", label: "Asia-Pacific" },
] as const;

// Common AWS S3 regions
export const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
  { value: "ca-central-1", label: "Canada (Central)" },
] as const;

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
  storageClass?: string;
  contentEncoding?: string;
  cacheControl?: string;
  versionId?: string;
  metadata?: Record<string, string>;
}

// Object versioning types
export interface ObjectVersionInfo {
  versionId: string;
  isLatest: boolean;
  isDeleteMarker: boolean;
  lastModified?: string;
  size?: number;
  etag?: string;
  storageClass?: string;
}

export interface ListVersionsResponse {
  key: string;
  versions: ObjectVersionInfo[];
  keyMarker?: string;
  versionIdMarker?: string;
  isTruncated: boolean;
  versioningEnabled: boolean;
}

export interface RestoreVersionResult {
  key: string;
  restoredVersionId: string;
  newVersionId?: string;
}

// Object tagging types
export interface ObjectTag {
  key: string;
  value: string;
}

export interface ObjectTagsResponse {
  objectKey: string;
  tags: ObjectTag[];
}

export type PreviewContent =
  | { type: "Text"; content: string; truncated: boolean }
  | { type: "Image"; base64: string; mimeType: string }
  | { type: "Json"; content: unknown }
  | { type: "Pdf"; base64: string }
  | { type: "Unsupported"; message: string };

// Presigned URL types
export interface PresignedUrlResult {
  url: string;
  expiresAt: string;
}

// Rename types
export interface RenameResult {
  oldKey: string;
  newKey: string;
  objectsRenamed: number;
}

// Copy/Move types
export interface CopyMoveResult {
  objectsCopied: number;
  objectsDeleted: number;
  errors: CopyMoveError[];
}

export interface CopyMoveError {
  sourceKey: string;
  error: string;
}

// Clipboard state for copy/cut operations
export interface ClipboardState {
  keys: string[];
  bucket: string;
  accountId: string;
  operation: "copy" | "cut";
}

// Internal drag state for moving items within the bucket
export interface DragState {
  keys: string[];
  sourcePrefix: string;
}

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

// Bucket configuration types
export interface BucketVersioningConfig {
  status: "Enabled" | "Suspended" | "Disabled" | "Unsupported";
  mfaDelete?: string;
}

export interface CorsRuleConfig {
  allowedHeaders: string[];
  allowedMethods: string[];
  allowedOrigins: string[];
  exposeHeaders: string[];
  maxAgeSeconds?: number;
}

export interface BucketCorsConfig {
  rules: CorsRuleConfig[];
}

export interface LifecycleTransition {
  days?: number;
  storageClass?: string;
}

export interface LifecycleRuleConfig {
  id?: string;
  status: string;
  prefix?: string;
  expirationDays?: number;
  noncurrentVersionExpirationDays?: number;
  abortIncompleteMultipartUploadDays?: number;
  transitions: LifecycleTransition[];
}

export interface BucketLifecycleConfig {
  rules: LifecycleRuleConfig[];
}

export interface BucketEncryptionConfig {
  sseAlgorithm?: string;
  kmsMasterKeyId?: string;
  bucketKeyEnabled?: boolean;
}

export interface BucketLoggingConfig {
  loggingEnabled: boolean;
  targetBucket?: string;
  targetPrefix?: string;
}

export interface BucketConfigSummary {
  versioning: BucketVersioningConfig;
  cors: BucketCorsConfig;
  lifecycle: BucketLifecycleConfig;
  encryption: BucketEncryptionConfig;
  logging: BucketLoggingConfig;
}

// Storage Analytics types
export interface FolderStats {
  prefix: string;
  name: string;
  size: number;
  objectCount: number;
}

export interface ContentTypeStats {
  contentType: string;
  size: number;
  objectCount: number;
}

export interface StorageClassStats {
  storageClass: string;
  size: number;
  objectCount: number;
}

export interface LargeFile {
  key: string;
  size: number;
  lastModified?: string;
  storageClass?: string;
}

export interface BucketAnalytics {
  totalSize: number;
  totalObjects: number;
  folders: FolderStats[];
  byContentType: ContentTypeStats[];
  byStorageClass: StorageClassStats[];
  largestFiles: LargeFile[];
  calculatedAt: string;
}

// Analytics progress event
export interface AnalyticsProgressPayload {
  objectsProcessed: number;
  currentPrefix: string;
}

// Operations History types
export type OperationType =
  | "upload"
  | "download"
  | "delete"
  | "copy"
  | "move"
  | "rename"
  | "create_folder";

export type OperationStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export interface Operation {
  id: number;
  timestamp: number;
  accountId: string;
  bucket: string;
  operation: OperationType;
  sourceKey?: string;
  destKey?: string;
  size?: number;
  durationMs?: number;
  status: OperationStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface OperationFilter {
  accountId?: string;
  bucket?: string;
  operation?: OperationType;
  status?: OperationStatus;
  fromTimestamp?: number;
  toTimestamp?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface OperationsResponse {
  operations: Operation[];
  total: number;
  hasMore: boolean;
}

export interface OperationStats {
  totalOperations: number;
  totalBytes: number;
  completed: number;
  failed: number;
  byType: { operation: string; count: number }[];
}

export interface LogOperationInput {
  accountId: string;
  bucket: string;
  operation: OperationType;
  sourceKey?: string;
  destKey?: string;
  size?: number;
  status: OperationStatus;
  durationMs?: number;
  errorMessage?: string;
}

// Duplicate Detection types
export type HashType = "etag" | "sha256";
export type ScanStatus = "running" | "completed" | "failed" | "cancelled";

export interface DuplicateScan {
  id: number;
  accountId: string;
  bucket: string;
  prefix: string;
  startedAt: number;
  completedAt?: number;
  status: ScanStatus;
  totalFiles: number;
  totalSize: number;
  duplicateGroups: number;
  duplicateFiles: number;
  reclaimableBytes: number;
  errorMessage?: string;
}

export interface DuplicateGroup {
  id: number;
  scanId: number;
  contentHash: string;
  hashType: HashType;
  fileSize: number;
  fileCount: number;
  files: DuplicateFile[];
}

export interface DuplicateFile {
  id: number;
  groupId: number;
  key: string;
  etag?: string;
  lastModified?: number;
  storageClass?: string;
}

export interface ScanSummary {
  id: number;
  accountId: string;
  bucket: string;
  prefix: string;
  startedAt: number;
  status: ScanStatus;
  totalFiles: number;
  duplicateGroups: number;
  reclaimableBytes: number;
}

export interface DeleteDuplicatesResult {
  deletedCount: number;
  freedBytes: number;
  errors: { key: string; error: string }[];
}

// Scan progress events
export interface ScanProgressPayload {
  scanId: number;
  phase: string;
  filesScanned: number;
  totalFiles: number;
  currentFile?: string;
  bytesProcessed: number;
}

export interface ScanCompletePayload {
  scanId: number;
  duplicateGroups: number;
  duplicateFiles: number;
  reclaimableBytes: number;
}

export interface ScanErrorPayload {
  scanId: number;
  error: string;
}

// ==================== Folder Sync types ====================

export type SyncDirection = "upload_only" | "download_only";
export type SyncPairStatus = "idle" | "syncing" | "error";
export type SyncSessionStatus = "running" | "completed" | "failed" | "cancelled";
export type ChangeType = "new" | "modified" | "deleted" | "unchanged";

export interface SyncPair {
  id: number;
  name: string;
  localPath: string;
  accountId: string;
  bucket: string;
  remotePrefix: string;
  syncDirection: SyncDirection;
  deletePropagation: boolean;
  status: SyncPairStatus;
  lastSyncAt?: number;
  lastError?: string;
  createdAt: number;
}

export interface DetectedChange {
  relativePath: string;
  changeType: ChangeType;
  size?: number;
  mtime?: number;
  hash?: string;
}

export interface SyncPreview {
  toUpload: DetectedChange[];
  toDownload: DetectedChange[];
  toDeleteLocal: DetectedChange[];
  toDeleteRemote: DetectedChange[];
}

export interface SyncSession {
  id: number;
  syncPairId: number;
  startedAt: number;
  completedAt?: number;
  status: SyncSessionStatus;
  filesUploaded: number;
  filesDownloaded: number;
  filesDeletedLocal: number;
  filesDeletedRemote: number;
  bytesTransferred: number;
  errorMessage?: string;
}

// Sync progress events
export interface SyncProgressPayload {
  pairId: number;
  sessionId: number;
  phase: string;
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  bytesTransferred: number;
}

export interface SyncCompletePayload {
  pairId: number;
  sessionId: number;
  filesUploaded: number;
  filesDownloaded: number;
  filesDeletedLocal: number;
  filesDeletedRemote: number;
}

export interface SyncErrorPayload {
  pairId: number;
  sessionId?: number;
  error: string;
}
