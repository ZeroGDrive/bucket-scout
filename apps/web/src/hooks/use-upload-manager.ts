import { useCallback, useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { tempDir } from "@tauri-apps/api/path";
import { writeFile, remove } from "@tauri-apps/plugin-fs";
import { useQueryClient } from "@tanstack/react-query";
import { objects } from "@/lib/tauri";
import { useUploadStore } from "@/lib/upload-store";
import { useBrowserStore } from "@/lib/store";
import { queryKeys } from "@/lib/queries";
import type {
  UploadItem,
  UploadProgressPayload,
  UploadCompletedPayload,
  UploadFailedPayload,
} from "@/lib/types";
import { toast } from "sonner";

export function useUploadManager() {
  const queryClient = useQueryClient();
  const processingRef = useRef(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const currentPath = useBrowserStore((s) => s.currentPath);

  // Get actions directly from store (stable references)
  const addUploads = useUploadStore((s) => s.addUploads);
  const updateProgress = useUploadStore((s) => s.updateProgress);
  const setStatus = useUploadStore((s) => s.setStatus);
  const getNextPending = useUploadStore((s) => s.getNextPending);
  const canStartUpload = useUploadStore((s) => s.canStartUpload);

  // Watch pending count for queue processing
  const pendingCount = useUploadStore((s) => s.counts.pending);

  // Set up global event listeners for upload progress
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Listen for progress events
      const unlistenProgress = await listen<UploadProgressPayload>(
        "upload-progress",
        (event) => {
          console.log("[upload] Progress event:", event.payload);
          const { uploadId, bytesUploaded, totalBytes } = event.payload;
          updateProgress(uploadId, bytesUploaded, totalBytes);
        }
      );
      unlisteners.push(unlistenProgress);

      // Listen for completed events
      const unlistenCompleted = await listen<UploadCompletedPayload>(
        "upload-completed",
        (event) => {
          console.log("[upload] Completed event:", event.payload);
          const { uploadId } = event.payload;
          // Get current state to find the upload item
          const upload = useUploadStore.getState().uploads.get(uploadId);
          if (upload) {
            // Ensure progress shows 100%
            updateProgress(uploadId, upload.totalBytes, upload.totalBytes);
          }
          setStatus(uploadId, "completed");

          // Invalidate object list to show new file
          const state = useBrowserStore.getState();
          const path = state.currentPath;
          const prefix = path.length > 0 ? path.join("/") + "/" : "";
          if (state.selectedAccountId && state.selectedBucket) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.objects(
                state.selectedAccountId,
                state.selectedBucket,
                prefix
              ),
            });
          }
        }
      );
      unlisteners.push(unlistenCompleted);

      // Listen for failed events
      const unlistenFailed = await listen<UploadFailedPayload>(
        "upload-failed",
        (event) => {
          console.log("[upload] Failed event:", event.payload);
          const { uploadId, error } = event.payload;
          setStatus(uploadId, "failed", error);
        }
      );
      unlisteners.push(unlistenFailed);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [updateProgress, setStatus, queryClient]);

  // Upload single file
  const uploadFile = useCallback(
    async (item: UploadItem) => {
      if (!selectedAccountId || !selectedBucket) return;

      const abortController = new AbortController();
      abortControllersRef.current.set(item.id, abortController);

      // Write browser File to temp directory for Tauri
      let tempPath: string | null = null;
      try {
        const buffer = await item.file.arrayBuffer();
        const tempDirPath = await tempDir();
        tempPath = `${tempDirPath}${crypto.randomUUID()}_${item.file.name}`;
        await writeFile(tempPath, new Uint8Array(buffer));
        console.log("[upload] Temp file written:", tempPath);

        console.log("[upload] Starting upload invoke for:", item.id);
        await objects.upload({
          accountId: selectedAccountId,
          bucket: selectedBucket,
          filePath: tempPath,
          key: item.key,
          contentType: item.file.type || undefined,
          uploadId: item.id, // Pass the frontend ID to Rust
        });
        console.log("[upload] Upload invoke completed for:", item.id);
      } catch (error) {
        console.error("[upload] Upload error:", error);
        if (!abortController.signal.aborted) {
          setStatus(item.id, "failed", String(error));
        }
      } finally {
        // Clean up temp file
        if (tempPath) {
          try {
            await remove(tempPath);
          } catch {
            // Ignore cleanup errors
          }
        }
        abortControllersRef.current.delete(item.id);
      }
    },
    [selectedAccountId, selectedBucket, setStatus]
  );

  // Process upload queue
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    if (!selectedAccountId || !selectedBucket) return;

    processingRef.current = true;

    while (canStartUpload()) {
      const nextUpload = getNextPending();
      if (!nextUpload) break;

      setStatus(nextUpload.id, "uploading");
      // Don't await - let multiple uploads run concurrently
      uploadFile(nextUpload);
    }

    processingRef.current = false;
  }, [
    selectedAccountId,
    selectedBucket,
    canStartUpload,
    getNextPending,
    setStatus,
    uploadFile,
  ]);

  // Queue files for upload
  const queueFiles = useCallback(
    (files: FileList | File[]) => {
      if (!selectedAccountId || !selectedBucket) {
        toast.error("Please select a bucket first");
        return;
      }

      const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
      const items: UploadItem[] = [];

      for (const file of Array.from(files)) {
        // Use webkitRelativePath for folder uploads, otherwise just the filename
        const relativePath =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name;

        const key = prefix + relativePath;

        items.push({
          id: crypto.randomUUID(),
          file,
          key,
          status: "pending",
          progress: 0,
          bytesUploaded: 0,
          totalBytes: file.size,
          startedAt: Date.now(),
        });
      }

      addUploads(items);
      // Toast notification is handled by UploadToast component
    },
    [selectedAccountId, selectedBucket, currentPath, addUploads]
  );

  // Cancel an upload
  const cancelUpload = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    useUploadStore.getState().cancelUpload(id);
  }, []);

  // Watch for new pending uploads and process queue
  useEffect(() => {
    if (pendingCount > 0 && !processingRef.current) {
      processQueue();
    }
  }, [pendingCount, processQueue]);

  return {
    queueFiles,
    cancelUpload,
  };
}
