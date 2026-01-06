import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { credentials, buckets, objects, preview } from "./tauri";

// Query keys
export const queryKeys = {
  accounts: ["accounts"] as const,
  account: (id: string) => ["accounts", id] as const,
  buckets: (accountId: string) => ["buckets", accountId] as const,
  bucketConfig: (accountId: string, bucket: string) => ["bucketConfig", accountId, bucket] as const,
  bucketAnalytics: (accountId: string, bucket: string) =>
    ["bucketAnalytics", accountId, bucket] as const,
  objects: (accountId: string, bucket: string, prefix: string) =>
    ["objects", accountId, bucket, prefix] as const,
  search: (accountId: string, bucket: string, prefix: string, query: string) =>
    ["search", accountId, bucket, prefix, query] as const,
  preview: (accountId: string, bucket: string, key: string) =>
    ["preview", accountId, bucket, key] as const,
  thumbnail: (accountId: string, bucket: string, key: string) =>
    ["thumbnail", accountId, bucket, key] as const,
  metadata: (accountId: string, bucket: string, key: string) =>
    ["metadata", accountId, bucket, key] as const,
  versions: (accountId: string, bucket: string, key: string) =>
    ["versions", accountId, bucket, key] as const,
  tags: (accountId: string, bucket: string, key: string) =>
    ["tags", accountId, bucket, key] as const,
};

// Account queries
export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => credentials.list(),
  });
}

export function useAccount(id: string | null) {
  return useQuery({
    queryKey: queryKeys.account(id || ""),
    queryFn: () => credentials.get(id!),
    enabled: !!id,
  });
}

// Account mutations
export function useAddAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      name: string;
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
      providerType: import("./types").ProviderType;
      cloudflareAccountId?: string;
      region?: string;
    }) => credentials.add(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}

export function useRemoveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => credentials.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => credentials.testConnection(id),
  });
}

// Bucket queries
export function useBuckets(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.buckets(accountId || ""),
    queryFn: () => buckets.list(accountId!),
    enabled: !!accountId,
  });
}

// Bucket mutations
export function useCreateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucketName: string; location?: string }) =>
      buckets.create(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets(variables.accountId) });
    },
  });
}

export function useDeleteBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucketName: string; force: boolean }) =>
      buckets.delete(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets(variables.accountId) });
    },
  });
}

// Object queries with pagination
export function useObjects(accountId: string | null, bucket: string | null, prefix: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.objects(accountId || "", bucket || "", prefix),
    queryFn: ({ pageParam }) =>
      objects.list({
        accountId: accountId!,
        bucket: bucket!,
        prefix: prefix || undefined,
        continuationToken: pageParam,
      }),
    getNextPageParam: (lastPage) => (lastPage.isTruncated ? lastPage.continuationToken : undefined),
    initialPageParam: undefined as string | undefined,
    enabled: !!accountId && !!bucket,
  });
}

// Preview query
export function usePreview(accountId: string | null, bucket: string | null, key: string | null) {
  return useQuery({
    queryKey: queryKeys.preview(accountId || "", bucket || "", key || ""),
    queryFn: () =>
      preview.get({
        accountId: accountId!,
        bucket: bucket!,
        key: key!,
      }),
    enabled: !!accountId && !!bucket && !!key,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Thumbnail query
export function useThumbnail(
  accountId: string | null,
  bucket: string | null,
  key: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.thumbnail(accountId || "", bucket || "", key || ""),
    queryFn: () =>
      preview.getThumbnail({
        accountId: accountId!,
        bucket: bucket!,
        key: key!,
        size: 200,
      }),
    enabled: enabled && !!accountId && !!bucket && !!key,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
}

// Object metadata query
export function useObjectMetadata(
  accountId: string | null,
  bucket: string | null,
  key: string | null,
) {
  return useQuery({
    queryKey: queryKeys.metadata(accountId || "", bucket || "", key || ""),
    queryFn: () =>
      objects.getMetadata({
        accountId: accountId!,
        bucket: bucket!,
        key: key!,
      }),
    enabled: !!accountId && !!bucket && !!key,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Delete mutation
export function useDeleteObjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucket: string; keys: string[] }) =>
      objects.delete(params),
    onSuccess: (_, variables) => {
      // Invalidate all object queries for this bucket to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["objects", variables.accountId, variables.bucket],
      });
    },
  });
}

// Create folder mutation
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      accountId: string;
      bucket: string;
      prefix: string;
      folderName: string;
    }) => objects.createFolder(params),
    onSuccess: (_, variables) => {
      // Invalidate all object queries for this bucket to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["objects", variables.accountId, variables.bucket],
      });
    },
  });
}

// Search objects query (for recursive search)
export function useSearchObjects(
  accountId: string | null,
  bucket: string | null,
  prefix: string,
  query: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.search(accountId || "", bucket || "", prefix, query),
    queryFn: () =>
      objects.search({
        accountId: accountId!,
        bucket: bucket!,
        prefix,
        query,
        maxResults: 100,
      }),
    enabled: enabled && !!accountId && !!bucket && query.length >= 2,
    staleTime: 30_000, // 30 seconds
  });
}

// Generate presigned URL mutation
export function useGeneratePresignedUrl() {
  return useMutation({
    mutationFn: (params: {
      accountId: string;
      bucket: string;
      key: string;
      expiresInSeconds: number;
    }) => objects.generatePresignedUrl(params),
  });
}

// Rename object mutation
export function useRenameObject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucket: string; oldKey: string; newName: string }) =>
      objects.rename(params),
    onSuccess: (_, variables) => {
      // Invalidate all object queries for this bucket to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["objects", variables.accountId, variables.bucket],
      });
    },
  });
}

// Copy/Move objects mutation (same bucket)
export function useCopyMoveObjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      accountId: string;
      bucket: string;
      sourceKeys: string[];
      destinationPrefix: string;
      deleteSource: boolean;
    }) => objects.copyObjects(params),
    onSuccess: (_, variables) => {
      // Invalidate all object queries for this bucket to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["objects", variables.accountId, variables.bucket],
      });
    },
  });
}

// Copy/Move objects across buckets mutation
export function useCopyMoveObjectsAcrossBuckets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      sourceAccountId: string;
      sourceBucket: string;
      destAccountId: string;
      destBucket: string;
      sourceKeys: string[];
      destinationPrefix: string;
      deleteSource: boolean;
    }) => objects.copyObjectsAcrossBuckets(params),
    onSuccess: (_, variables) => {
      // Invalidate object queries for both source and destination buckets
      queryClient.invalidateQueries({
        queryKey: ["objects", variables.sourceAccountId, variables.sourceBucket],
      });
      queryClient.invalidateQueries({
        queryKey: ["objects", variables.destAccountId, variables.destBucket],
      });
    },
  });
}

// Update object metadata mutation
export function useUpdateObjectMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      accountId: string;
      bucket: string;
      key: string;
      contentType?: string;
      cacheControl?: string;
      contentDisposition?: string;
      contentEncoding?: string;
      customMetadata?: Record<string, string>;
    }) => objects.updateMetadata(params),
    onSuccess: (_, variables) => {
      // Invalidate metadata query for this specific object
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata(variables.accountId, variables.bucket, variables.key),
      });
      // Also invalidate preview in case content-type changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.preview(variables.accountId, variables.bucket, variables.key),
      });
    },
  });
}

// Object versions query with pagination
export function useObjectVersions(
  accountId: string | null,
  bucket: string | null,
  key: string | null,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.versions(accountId || "", bucket || "", key || ""),
    queryFn: ({ pageParam }) =>
      objects.listVersions({
        accountId: accountId!,
        bucket: bucket!,
        key: key!,
        keyMarker: pageParam?.keyMarker,
        versionIdMarker: pageParam?.versionIdMarker,
        maxKeys: 50,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.isTruncated
        ? { keyMarker: lastPage.keyMarker, versionIdMarker: lastPage.versionIdMarker }
        : undefined,
    initialPageParam: undefined as { keyMarker?: string; versionIdMarker?: string } | undefined,
    enabled: !!accountId && !!bucket && !!key,
    staleTime: 30_000, // 30 seconds
  });
}

// Restore version mutation
export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucket: string; key: string; versionId: string }) =>
      objects.restoreVersion(params),
    onSuccess: (_, variables) => {
      // Invalidate versions list to show the new restored version
      queryClient.invalidateQueries({
        queryKey: queryKeys.versions(variables.accountId, variables.bucket, variables.key),
      });
      // Also invalidate objects list as the current version changed
      queryClient.invalidateQueries({
        queryKey: ["objects", variables.accountId, variables.bucket],
      });
      // Invalidate metadata
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata(variables.accountId, variables.bucket, variables.key),
      });
    },
  });
}

// Object tags query
export function useObjectTags(accountId: string | null, bucket: string | null, key: string | null) {
  return useQuery({
    queryKey: queryKeys.tags(accountId || "", bucket || "", key || ""),
    queryFn: () =>
      objects.getTags({
        accountId: accountId!,
        bucket: bucket!,
        key: key!,
      }),
    enabled: !!accountId && !!bucket && !!key,
    staleTime: 30_000, // 30 seconds
  });
}

// Set tags mutation
export function useSetObjectTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      accountId: string;
      bucket: string;
      key: string;
      tags: import("./types").ObjectTag[];
    }) => objects.setTags(params),
    onSuccess: (_, variables) => {
      // Invalidate tags for this specific object
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags(variables.accountId, variables.bucket, variables.key),
      });
    },
  });
}

// Delete tags mutation
export function useDeleteObjectTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucket: string; key: string }) =>
      objects.deleteTags(params),
    onSuccess: (_, variables) => {
      // Invalidate tags for this specific object
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags(variables.accountId, variables.bucket, variables.key),
      });
    },
  });
}

// ============================================================================
// Bucket Configuration Queries
// ============================================================================

// Get full bucket configuration (versioning, CORS, lifecycle, encryption, logging)
export function useBucketConfig(accountId: string | null, bucket: string | null) {
  return useQuery({
    queryKey: queryKeys.bucketConfig(accountId || "", bucket || ""),
    queryFn: () =>
      buckets.getConfig({
        accountId: accountId!,
        bucket: bucket!,
      }),
    enabled: !!accountId && !!bucket,
    staleTime: 60_000, // 1 minute - config doesn't change often
  });
}

// Toggle versioning mutation
export function useSetBucketVersioning() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucket: string; enabled: boolean }) =>
      buckets.setVersioning(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.bucketConfig(variables.accountId, variables.bucket),
      });
    },
  });
}

// Set CORS rules mutation
export function useSetBucketCors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      accountId: string;
      bucket: string;
      rules: import("./types").CorsRuleConfig[];
    }) => buckets.setCors(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.bucketConfig(variables.accountId, variables.bucket),
      });
    },
  });
}

// Delete CORS configuration mutation
export function useDeleteBucketCors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucket: string }) => buckets.deleteCors(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.bucketConfig(variables.accountId, variables.bucket),
      });
    },
  });
}

// Set lifecycle rules mutation
export function useSetBucketLifecycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      accountId: string;
      bucket: string;
      rules: import("./types").LifecycleRuleConfig[];
    }) => buckets.setLifecycle(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.bucketConfig(variables.accountId, variables.bucket),
      });
    },
  });
}

// Delete lifecycle configuration mutation
export function useDeleteBucketLifecycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { accountId: string; bucket: string }) => buckets.deleteLifecycle(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.bucketConfig(variables.accountId, variables.bucket),
      });
    },
  });
}

// ============================================================================
// Bucket Analytics Queries
// ============================================================================

// Get bucket analytics (folder sizes, type breakdown, large files)
export function useBucketAnalytics(
  accountId: string | null,
  bucket: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.bucketAnalytics(accountId || "", bucket || ""),
    queryFn: () =>
      buckets.getAnalytics({
        accountId: accountId!,
        bucket: bucket!,
        topNLargest: 20,
        topNFolders: 10,
      }),
    enabled: options?.enabled !== false && !!accountId && !!bucket,
    staleTime: 5 * 60 * 1000, // 5 minutes - analytics are expensive to compute
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}
