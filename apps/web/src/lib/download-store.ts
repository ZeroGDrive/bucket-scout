import { create } from "zustand";
import type { DownloadItem, DownloadStatus } from "./types";

const MAX_CONCURRENT_DOWNLOADS = 3;

interface DownloadCounts {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

interface DownloadState {
  downloads: Map<string, DownloadItem>;
  // Derived state stored directly to avoid selector re-render issues
  downloadList: DownloadItem[];
  counts: DownloadCounts;
  totalProgress: number;

  // Actions
  addDownload: (item: DownloadItem) => void;
  addDownloads: (items: DownloadItem[]) => void;
  updateProgress: (id: string, bytesDownloaded: number, totalBytes: number) => void;
  setStatus: (id: string, status: DownloadStatus, error?: string) => void;
  setCompleted: (id: string, path: string) => void;
  removeDownload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;

  // Queue management
  getNextPending: () => DownloadItem | undefined;
  canStartDownload: () => boolean;
}

// Helper to compute derived state
function computeDerivedState(downloads: Map<string, DownloadItem>) {
  const downloadList = Array.from(downloads.values());

  const counts: DownloadCounts = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
    total: downloadList.length,
  };

  let totalBytes = 0;
  let downloadedBytes = 0;

  for (const d of downloadList) {
    if (d.status === "pending") counts.pending++;
    else if (d.status === "downloading") counts.active++;
    else if (d.status === "completed") counts.completed++;
    else if (d.status === "failed") counts.failed++;

    totalBytes += d.totalBytes;
    downloadedBytes += d.bytesDownloaded;
  }

  const totalProgress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

  return { downloadList, counts, totalProgress };
}

const initialDerived = computeDerivedState(new Map());

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: new Map(),
  downloadList: initialDerived.downloadList,
  counts: initialDerived.counts,
  totalProgress: initialDerived.totalProgress,

  addDownload: (item) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.set(item.id, item);
      return { downloads, ...computeDerivedState(downloads) };
    }),

  addDownloads: (items) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      items.forEach((item) => downloads.set(item.id, item));
      return { downloads, ...computeDerivedState(downloads) };
    }),

  updateProgress: (id, bytesDownloaded, totalBytes) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      const download = downloads.get(id);
      if (download) {
        downloads.set(id, {
          ...download,
          bytesDownloaded,
          totalBytes,
          progress: Math.round((bytesDownloaded / totalBytes) * 100),
          status: "downloading",
        });
      }
      return { downloads, ...computeDerivedState(downloads) };
    }),

  setStatus: (id, status, error) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      const download = downloads.get(id);
      if (download) {
        downloads.set(id, {
          ...download,
          status,
          error,
          completedAt: status === "completed" || status === "failed" ? Date.now() : undefined,
        });
      }
      return { downloads, ...computeDerivedState(downloads) };
    }),

  setCompleted: (id, path) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      const download = downloads.get(id);
      if (download) {
        downloads.set(id, {
          ...download,
          status: "completed",
          path,
          progress: 100,
          completedAt: Date.now(),
        });
      }
      return { downloads, ...computeDerivedState(downloads) };
    }),

  removeDownload: (id) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.delete(id);
      return { downloads, ...computeDerivedState(downloads) };
    }),

  clearCompleted: () =>
    set((state) => {
      const downloads = new Map(state.downloads);
      for (const [id, download] of downloads) {
        if (download.status === "completed") {
          downloads.delete(id);
        }
      }
      return { downloads, ...computeDerivedState(downloads) };
    }),

  clearAll: () => {
    const downloads = new Map<string, DownloadItem>();
    return set({ downloads, ...computeDerivedState(downloads) });
  },

  cancelDownload: (id) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      const download = downloads.get(id);
      if (download && (download.status === "pending" || download.status === "downloading")) {
        downloads.set(id, { ...download, status: "cancelled" });
      }
      return { downloads, ...computeDerivedState(downloads) };
    }),

  retryDownload: (id) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      const download = downloads.get(id);
      if (download && (download.status === "failed" || download.status === "cancelled")) {
        downloads.set(id, {
          ...download,
          status: "pending",
          progress: 0,
          bytesDownloaded: 0,
          error: undefined,
        });
      }
      return { downloads, ...computeDerivedState(downloads) };
    }),

  getNextPending: () => {
    return get().downloadList.find((d) => d.status === "pending");
  },

  canStartDownload: () => {
    return get().counts.active < MAX_CONCURRENT_DOWNLOADS;
  },
}));

// Simple selectors that don't create new references
export const useDownloadQueue = () => useDownloadStore((state) => state.downloadList);
export const useDownloadCounts = () => useDownloadStore((state) => state.counts);
export const useTotalDownloadProgress = () => useDownloadStore((state) => state.totalProgress);

export const useActiveDownloads = () =>
  useDownloadStore((state) => state.downloadList.filter((d) => d.status === "downloading"));
