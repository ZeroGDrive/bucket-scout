import { useCallback } from "react";
import { history } from "@/lib/tauri";
import type { OperationType, OperationStatus, LogOperationInput } from "@/lib/types";

/**
 * Hook for logging operations to the history database.
 * This should be called after S3 operations complete (success or failure).
 */
export function useOperationLogger() {
  const logOperation = useCallback(async (input: LogOperationInput): Promise<number | null> => {
    try {
      return await history.log(input);
    } catch (error) {
      console.error("Failed to log operation:", error);
      return null;
    }
  }, []);

  const logUpload = useCallback(
    async (params: {
      accountId: string;
      bucket: string;
      key: string;
      size: number;
      status: OperationStatus;
      durationMs?: number;
      errorMessage?: string;
    }) => {
      return logOperation({
        accountId: params.accountId,
        bucket: params.bucket,
        operation: "upload",
        sourceKey: params.key,
        size: params.size,
        status: params.status,
        durationMs: params.durationMs,
        errorMessage: params.errorMessage,
      });
    },
    [logOperation],
  );

  const logDownload = useCallback(
    async (params: {
      accountId: string;
      bucket: string;
      key: string;
      size: number;
      status: OperationStatus;
      durationMs?: number;
      errorMessage?: string;
    }) => {
      return logOperation({
        accountId: params.accountId,
        bucket: params.bucket,
        operation: "download",
        sourceKey: params.key,
        size: params.size,
        status: params.status,
        durationMs: params.durationMs,
        errorMessage: params.errorMessage,
      });
    },
    [logOperation],
  );

  const logDelete = useCallback(
    async (params: {
      accountId: string;
      bucket: string;
      keys: string[];
      status: OperationStatus;
      durationMs?: number;
      errorMessage?: string;
    }) => {
      // Log each deletion separately
      const results = await Promise.all(
        params.keys.map((key) =>
          logOperation({
            accountId: params.accountId,
            bucket: params.bucket,
            operation: "delete",
            sourceKey: key,
            status: params.status,
            durationMs: params.durationMs,
            errorMessage: params.errorMessage,
          }),
        ),
      );
      return results;
    },
    [logOperation],
  );

  const logCopy = useCallback(
    async (params: {
      accountId: string;
      bucket: string;
      sourceKey: string;
      destKey: string;
      size?: number;
      status: OperationStatus;
      durationMs?: number;
      errorMessage?: string;
    }) => {
      return logOperation({
        accountId: params.accountId,
        bucket: params.bucket,
        operation: "copy",
        sourceKey: params.sourceKey,
        destKey: params.destKey,
        size: params.size,
        status: params.status,
        durationMs: params.durationMs,
        errorMessage: params.errorMessage,
      });
    },
    [logOperation],
  );

  const logMove = useCallback(
    async (params: {
      accountId: string;
      bucket: string;
      sourceKey: string;
      destKey: string;
      size?: number;
      status: OperationStatus;
      durationMs?: number;
      errorMessage?: string;
    }) => {
      return logOperation({
        accountId: params.accountId,
        bucket: params.bucket,
        operation: "move",
        sourceKey: params.sourceKey,
        destKey: params.destKey,
        size: params.size,
        status: params.status,
        durationMs: params.durationMs,
        errorMessage: params.errorMessage,
      });
    },
    [logOperation],
  );

  const logRename = useCallback(
    async (params: {
      accountId: string;
      bucket: string;
      oldKey: string;
      newKey: string;
      status: OperationStatus;
      durationMs?: number;
      errorMessage?: string;
    }) => {
      return logOperation({
        accountId: params.accountId,
        bucket: params.bucket,
        operation: "rename",
        sourceKey: params.oldKey,
        destKey: params.newKey,
        status: params.status,
        durationMs: params.durationMs,
        errorMessage: params.errorMessage,
      });
    },
    [logOperation],
  );

  const logCreateFolder = useCallback(
    async (params: {
      accountId: string;
      bucket: string;
      key: string;
      status: OperationStatus;
      durationMs?: number;
      errorMessage?: string;
    }) => {
      return logOperation({
        accountId: params.accountId,
        bucket: params.bucket,
        operation: "create_folder",
        sourceKey: params.key,
        status: params.status,
        durationMs: params.durationMs,
        errorMessage: params.errorMessage,
      });
    },
    [logOperation],
  );

  return {
    logOperation,
    logUpload,
    logDownload,
    logDelete,
    logCopy,
    logMove,
    logRename,
    logCreateFolder,
  };
}
