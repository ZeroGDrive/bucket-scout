import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  Bucket,
  ListObjectsResponse,
  ObjectMetadata,
  PreviewData,
  ThumbnailData,
  DeleteResult,
  S3Object,
  PresignedUrlResult,
  RenameResult,
  CopyMoveResult,
  ProviderType,
  ListVersionsResponse,
  RestoreVersionResult,
  ObjectTag,
  ObjectTagsResponse,
  BucketConfigSummary,
  BucketVersioningConfig,
  BucketCorsConfig,
  BucketLifecycleConfig,
  BucketEncryptionConfig,
  BucketLoggingConfig,
  CorsRuleConfig,
  LifecycleRuleConfig,
  BucketAnalytics,
  // History types
  Operation,
  OperationFilter,
  OperationsResponse,
  OperationStats,
  OperationStatus,
  LogOperationInput,
} from "./types";

// Credentials commands
export const credentials = {
  add: (params: {
    name: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    providerType: ProviderType;
    cloudflareAccountId?: string;
    region?: string;
  }) =>
    invoke<Account>("add_account", {
      name: params.name,
      endpoint: params.endpoint,
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      providerType: params.providerType,
      cloudflareAccountId: params.cloudflareAccountId,
      region: params.region,
    }),

  list: () => invoke<Account[]>("list_accounts"),

  get: (id: string) => invoke<Account>("get_account", { id }),

  remove: (id: string) => invoke<void>("remove_account", { id }),

  update: (params: {
    id: string;
    name?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    providerType?: ProviderType;
    cloudflareAccountId?: string;
    region?: string;
  }) =>
    invoke<Account>("update_account", {
      id: params.id,
      name: params.name,
      endpoint: params.endpoint,
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      providerType: params.providerType,
      cloudflareAccountId: params.cloudflareAccountId,
      region: params.region,
    }),

  testConnection: (id: string) => invoke<boolean>("test_connection", { id }),
};

// Bucket commands
export const buckets = {
  list: (accountId: string) => invoke<Bucket[]>("list_buckets", { accountId }),
  create: (params: { accountId: string; bucketName: string; location?: string }) =>
    invoke<void>("create_bucket", {
      accountId: params.accountId,
      bucketName: params.bucketName,
      location: params.location,
    }),
  delete: (params: { accountId: string; bucketName: string; force: boolean }) =>
    invoke<void>("delete_bucket", {
      accountId: params.accountId,
      bucketName: params.bucketName,
      force: params.force,
    }),

  // Bucket configuration commands
  getConfig: (params: { accountId: string; bucket: string }) =>
    invoke<BucketConfigSummary>("get_bucket_config", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  getVersioning: (params: { accountId: string; bucket: string }) =>
    invoke<BucketVersioningConfig>("get_bucket_versioning", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  setVersioning: (params: { accountId: string; bucket: string; enabled: boolean }) =>
    invoke<void>("put_bucket_versioning", {
      accountId: params.accountId,
      bucket: params.bucket,
      enabled: params.enabled,
    }),

  getCors: (params: { accountId: string; bucket: string }) =>
    invoke<BucketCorsConfig>("get_bucket_cors", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  setCors: (params: { accountId: string; bucket: string; rules: CorsRuleConfig[] }) =>
    invoke<void>("put_bucket_cors", {
      accountId: params.accountId,
      bucket: params.bucket,
      rules: params.rules,
    }),

  deleteCors: (params: { accountId: string; bucket: string }) =>
    invoke<void>("delete_bucket_cors", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  getLifecycle: (params: { accountId: string; bucket: string }) =>
    invoke<BucketLifecycleConfig>("get_bucket_lifecycle", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  setLifecycle: (params: {
    accountId: string;
    bucket: string;
    rules: LifecycleRuleConfig[];
  }) =>
    invoke<void>("put_bucket_lifecycle", {
      accountId: params.accountId,
      bucket: params.bucket,
      rules: params.rules,
    }),

  deleteLifecycle: (params: { accountId: string; bucket: string }) =>
    invoke<void>("delete_bucket_lifecycle", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  getEncryption: (params: { accountId: string; bucket: string }) =>
    invoke<BucketEncryptionConfig>("get_bucket_encryption", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  getLogging: (params: { accountId: string; bucket: string }) =>
    invoke<BucketLoggingConfig>("get_bucket_logging", {
      accountId: params.accountId,
      bucket: params.bucket,
    }),

  getAnalytics: (params: {
    accountId: string;
    bucket: string;
    prefix?: string;
    topNLargest?: number;
    topNFolders?: number;
  }) =>
    invoke<BucketAnalytics>("get_bucket_analytics", {
      accountId: params.accountId,
      bucket: params.bucket,
      prefix: params.prefix,
      topNLargest: params.topNLargest,
      topNFolders: params.topNFolders,
    }),
};

// Object commands
export const objects = {
  list: (params: {
    accountId: string;
    bucket: string;
    prefix?: string;
    continuationToken?: string;
    maxKeys?: number;
  }) =>
    invoke<ListObjectsResponse>("list_objects", {
      accountId: params.accountId,
      bucket: params.bucket,
      prefix: params.prefix,
      continuationToken: params.continuationToken,
      maxKeys: params.maxKeys,
    }),

  getMetadata: (params: { accountId: string; bucket: string; key: string }) =>
    invoke<ObjectMetadata>("get_object_metadata", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
    }),

  upload: (params: {
    accountId: string;
    bucket: string;
    filePath: string;
    key: string;
    contentType?: string;
    uploadId: string;
  }) =>
    invoke<void>("upload_object", {
      accountId: params.accountId,
      bucket: params.bucket,
      filePath: params.filePath,
      key: params.key,
      contentType: params.contentType,
      uploadId: params.uploadId,
    }),

  delete: (params: { accountId: string; bucket: string; keys: string[] }) =>
    invoke<DeleteResult>("delete_objects", {
      accountId: params.accountId,
      bucket: params.bucket,
      keys: params.keys,
    }),

  createFolder: (params: {
    accountId: string;
    bucket: string;
    prefix: string;
    folderName: string;
  }) =>
    invoke<string>("create_folder", {
      accountId: params.accountId,
      bucket: params.bucket,
      prefix: params.prefix,
      folderName: params.folderName,
    }),

  search: (params: {
    accountId: string;
    bucket: string;
    prefix: string;
    query: string;
    maxResults?: number;
  }) =>
    invoke<S3Object[]>("search_objects", {
      accountId: params.accountId,
      bucket: params.bucket,
      prefix: params.prefix,
      query: params.query,
      maxResults: params.maxResults,
    }),

  download: (params: {
    accountId: string;
    bucket: string;
    key: string;
    destination: string;
    downloadId: string;
  }) =>
    invoke<string>("download_object", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      destination: params.destination,
      downloadId: params.downloadId,
    }),

  generatePresignedUrl: (params: {
    accountId: string;
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }) =>
    invoke<PresignedUrlResult>("generate_presigned_url", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      expiresInSeconds: params.expiresInSeconds,
    }),

  rename: (params: { accountId: string; bucket: string; oldKey: string; newName: string }) =>
    invoke<RenameResult>("rename_object", {
      accountId: params.accountId,
      bucket: params.bucket,
      oldKey: params.oldKey,
      newName: params.newName,
    }),

  copyObjects: (params: {
    accountId: string;
    bucket: string;
    sourceKeys: string[];
    destinationPrefix: string;
    deleteSource: boolean;
  }) =>
    invoke<CopyMoveResult>("copy_objects", {
      accountId: params.accountId,
      bucket: params.bucket,
      sourceKeys: params.sourceKeys,
      destinationPrefix: params.destinationPrefix,
      deleteSource: params.deleteSource,
    }),

  copyObjectsAcrossBuckets: (params: {
    sourceAccountId: string;
    sourceBucket: string;
    destAccountId: string;
    destBucket: string;
    sourceKeys: string[];
    destinationPrefix: string;
    deleteSource: boolean;
  }) =>
    invoke<CopyMoveResult>("copy_objects_across_buckets", {
      sourceAccountId: params.sourceAccountId,
      sourceBucket: params.sourceBucket,
      destAccountId: params.destAccountId,
      destBucket: params.destBucket,
      sourceKeys: params.sourceKeys,
      destinationPrefix: params.destinationPrefix,
      deleteSource: params.deleteSource,
    }),

  downloadFolder: (params: {
    accountId: string;
    bucket: string;
    prefix: string;
    destination: string;
    downloadId: string;
  }) =>
    invoke<string>("download_folder", {
      accountId: params.accountId,
      bucket: params.bucket,
      prefix: params.prefix,
      destination: params.destination,
      downloadId: params.downloadId,
    }),

  updateMetadata: (params: {
    accountId: string;
    bucket: string;
    key: string;
    contentType?: string;
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    customMetadata?: Record<string, string>;
  }) =>
    invoke<ObjectMetadata>("update_object_metadata", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      contentType: params.contentType,
      cacheControl: params.cacheControl,
      contentDisposition: params.contentDisposition,
      contentEncoding: params.contentEncoding,
      customMetadata: params.customMetadata,
    }),

  listVersions: (params: {
    accountId: string;
    bucket: string;
    key: string;
    keyMarker?: string;
    versionIdMarker?: string;
    maxKeys?: number;
  }) =>
    invoke<ListVersionsResponse>("list_object_versions", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      keyMarker: params.keyMarker,
      versionIdMarker: params.versionIdMarker,
      maxKeys: params.maxKeys,
    }),

  restoreVersion: (params: {
    accountId: string;
    bucket: string;
    key: string;
    versionId: string;
  }) =>
    invoke<RestoreVersionResult>("restore_object_version", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      versionId: params.versionId,
    }),

  getTags: (params: { accountId: string; bucket: string; key: string }) =>
    invoke<ObjectTagsResponse>("get_object_tagging", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
    }),

  setTags: (params: { accountId: string; bucket: string; key: string; tags: ObjectTag[] }) =>
    invoke<ObjectTagsResponse>("put_object_tagging", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      tags: params.tags,
    }),

  deleteTags: (params: { accountId: string; bucket: string; key: string }) =>
    invoke<void>("delete_object_tagging", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
    }),
};

// Preview commands
export const preview = {
  get: (params: { accountId: string; bucket: string; key: string; maxSize?: number }) =>
    invoke<PreviewData>("get_preview", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      maxSize: params.maxSize,
    }),

  getThumbnail: (params: { accountId: string; bucket: string; key: string; size?: number }) =>
    invoke<ThumbnailData | null>("get_thumbnail", {
      accountId: params.accountId,
      bucket: params.bucket,
      key: params.key,
      size: params.size,
    }),
};

// History commands
export const history = {
  getOperations: (filter: OperationFilter) =>
    invoke<OperationsResponse>("get_operations", { filter }),

  getOperation: (id: number) => invoke<Operation | null>("get_operation", { id }),

  getStats: (params: { accountId?: string; bucket?: string; days?: number }) =>
    invoke<OperationStats>("get_operation_stats", {
      accountId: params.accountId,
      bucket: params.bucket,
      days: params.days,
    }),

  cleanup: (days?: number) => invoke<number>("cleanup_history", { days }),

  export: (params: { filter: OperationFilter; format: "csv" | "json" }) =>
    invoke<string>("export_operations", {
      filter: params.filter,
      format: params.format,
    }),

  log: (input: LogOperationInput) => invoke<number>("log_operation", { input }),

  updateStatus: (params: {
    id: number;
    status: OperationStatus;
    durationMs?: number;
    errorMessage?: string;
  }) =>
    invoke<void>("update_operation", {
      id: params.id,
      status: params.status,
      durationMs: params.durationMs,
      errorMessage: params.errorMessage,
    }),
};
