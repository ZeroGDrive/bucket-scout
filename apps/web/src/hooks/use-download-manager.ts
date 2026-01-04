import { useCallback, useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import { objects } from "@/lib/tauri";
import { useDownloadStore } from "@/lib/download-store";
import { useBrowserStore } from "@/lib/store";
import type {
  DownloadItem,
  DownloadProgressPayload,
  DownloadCompletedPayload,
  DownloadFailedPayload,
} from "@/lib/types";
import { toast } from "sonner";

export function useDownloadManager() {
  const processingRef = useRef(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);

  // Get actions directly from store (stable references)
  const addDownloads = useDownloadStore((s) => s.addDownloads);
  const updateProgress = useDownloadStore((s) => s.updateProgress);
  const setStatus = useDownloadStore((s) => s.setStatus);
  const setCompleted = useDownloadStore((s) => s.setCompleted);
  const getNextPending = useDownloadStore((s) => s.getNextPending);
  const canStartDownload = useDownloadStore((s) => s.canStartDownload);

  // Watch pending count for queue processing
  const pendingCount = useDownloadStore((s) => s.counts.pending);

  // Set up global event listeners for download progress
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Listen for progress events
      const unlistenProgress = await listen<DownloadProgressPayload>(
        "download-progress",
        (event) => {
          console.log("[download] Progress event:", event.payload);
          const { downloadId, bytesDownloaded, totalBytes } = event.payload;
          updateProgress(downloadId, bytesDownloaded, totalBytes);
        },
      );
      unlisteners.push(unlistenProgress);

      // Listen for completed events
      const unlistenCompleted = await listen<DownloadCompletedPayload>(
        "download-completed",
        (event) => {
          console.log("[download] Completed event:", event.payload);
          const { downloadId, path } = event.payload;
          setCompleted(downloadId, path);
        },
      );
      unlisteners.push(unlistenCompleted);

      // Listen for failed events
      const unlistenFailed = await listen<DownloadFailedPayload>("download-failed", (event) => {
        console.log("[download] Failed event:", event.payload);
        const { downloadId, error } = event.payload;
        setStatus(downloadId, "failed", error);
      });
      unlisteners.push(unlistenFailed);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [updateProgress, setStatus, setCompleted]);

  // Download single file
  const downloadFile = useCallback(
    async (item: DownloadItem) => {
      if (!selectedAccountId || !selectedBucket) return;

      const abortController = new AbortController();
      abortControllersRef.current.set(item.id, abortController);

      try {
        // Get the downloads directory
        const downloadsPath = await downloadDir();
        console.log("[download] Starting download invoke for:", item.id);

        await objects.download({
          accountId: selectedAccountId,
          bucket: selectedBucket,
          key: item.key,
          destination: downloadsPath,
          downloadId: item.id,
        });

        console.log("[download] Download invoke completed for:", item.id);
      } catch (error) {
        console.error("[download] Download error:", error);
        if (!abortController.signal.aborted) {
          setStatus(item.id, "failed", String(error));
        }
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    },
    [selectedAccountId, selectedBucket, setStatus],
  );

  // Process download queue
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    if (!selectedAccountId || !selectedBucket) return;

    processingRef.current = true;

    while (canStartDownload()) {
      const nextDownload = getNextPending();
      if (!nextDownload) break;

      setStatus(nextDownload.id, "downloading");
      // Don't await - let multiple downloads run concurrently
      downloadFile(nextDownload);
    }

    processingRef.current = false;
  }, [
    selectedAccountId,
    selectedBucket,
    canStartDownload,
    getNextPending,
    setStatus,
    downloadFile,
  ]);

  // Queue files for download
  const queueDownloads = useCallback(
    (keys: string[]) => {
      if (!selectedAccountId || !selectedBucket) {
        toast.error("Please select a bucket first");
        return;
      }

      const items: DownloadItem[] = keys.map((key) => ({
        id: crypto.randomUUID(),
        key,
        fileName: key.split("/").pop() || key,
        status: "pending",
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0, // Will be updated when download starts
        startedAt: Date.now(),
      }));

      addDownloads(items);
    },
    [selectedAccountId, selectedBucket, addDownloads],
  );

  // Cancel a download
  const cancelDownload = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    useDownloadStore.getState().cancelDownload(id);
  }, []);

  // Download a folder as ZIP
  const queueFolderDownload = useCallback(
    async (folderKey: string) => {
      if (!selectedAccountId || !selectedBucket) {
        toast.error("Please select a bucket first");
        return;
      }

      const downloadId = crypto.randomUUID();
      const folderName = folderKey.trim().replace(/\/$/, "").split("/").pop() || "folder";

      // Add to download queue with folder indicator
      const item: DownloadItem = {
        id: downloadId,
        key: folderKey,
        fileName: `${folderName}.zip`,
        status: "downloading",
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        startedAt: Date.now(),
      };

      addDownloads([item]);

      try {
        const downloadsPath = await downloadDir();

        const result = await objects.downloadFolder({
          accountId: selectedAccountId,
          bucket: selectedBucket,
          prefix: folderKey,
          destination: downloadsPath,
          downloadId,
        });
        // Download completed - progress panel shows completion status
      } catch (error) {
        console.error("[download] Folder download error:", error);
        setStatus(downloadId, "failed", String(error));
        toast.error(`Failed to download folder: ${error}`);
      }
    },
    [selectedAccountId, selectedBucket, addDownloads, setStatus],
  );

  // Watch for new pending downloads and process queue
  useEffect(() => {
    if (pendingCount > 0 && !processingRef.current) {
      processQueue();
    }
  }, [pendingCount, processQueue]);

  return {
    queueDownloads,
    queueFolderDownload,
    cancelDownload,
  };
}
