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
} from "./types";

// Credentials commands
export const credentials = {
  add: (params: {
    name: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    accountId: string;
  }) =>
    invoke<Account>("add_account", {
      name: params.name,
      endpoint: params.endpoint,
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      accountId: params.accountId,
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
    accountId?: string;
  }) =>
    invoke<Account>("update_account", {
      id: params.id,
      name: params.name,
      endpoint: params.endpoint,
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      accountId: params.accountId,
    }),

  testConnection: (id: string) => invoke<boolean>("test_connection", { id }),
};

// Bucket commands
export const buckets = {
  list: (accountId: string) => invoke<Bucket[]>("list_buckets", { accountId }),
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
