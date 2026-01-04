import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { credentials, buckets, objects, preview } from "./tauri";
import type { Account } from "./types";

// Query keys
export const queryKeys = {
  accounts: ["accounts"] as const,
  account: (id: string) => ["accounts", id] as const,
  buckets: (accountId: string) => ["buckets", accountId] as const,
  objects: (accountId: string, bucket: string, prefix: string) =>
    ["objects", accountId, bucket, prefix] as const,
  search: (accountId: string, bucket: string, prefix: string, query: string) =>
    ["search", accountId, bucket, prefix, query] as const,
  preview: (accountId: string, bucket: string, key: string) =>
    ["preview", accountId, bucket, key] as const,
  thumbnail: (accountId: string, bucket: string, key: string) =>
    ["thumbnail", accountId, bucket, key] as const,
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
      accountId: string;
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
