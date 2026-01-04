import { create } from "zustand";
import type { UploadItem, UploadStatus } from "./types";

const MAX_CONCURRENT_UPLOADS = 3;

interface UploadCounts {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

interface UploadState {
  uploads: Map<string, UploadItem>;
  // Derived state stored directly to avoid selector re-render issues
  uploadList: UploadItem[];
  counts: UploadCounts;
  totalProgress: number;

  // Actions
  addUpload: (item: UploadItem) => void;
  addUploads: (items: UploadItem[]) => void;
  updateProgress: (id: string, bytesUploaded: number, totalBytes: number) => void;
  setStatus: (id: string, status: UploadStatus, error?: string) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;

  // Queue management
  getNextPending: () => UploadItem | undefined;
  canStartUpload: () => boolean;
}

// Helper to compute derived state
function computeDerivedState(uploads: Map<string, UploadItem>) {
  const uploadList = Array.from(uploads.values());

  const counts: UploadCounts = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
    total: uploadList.length,
  };

  let totalBytes = 0;
  let uploadedBytes = 0;

  for (const u of uploadList) {
    if (u.status === "pending") counts.pending++;
    else if (u.status === "uploading") counts.active++;
    else if (u.status === "completed") counts.completed++;
    else if (u.status === "failed") counts.failed++;

    totalBytes += u.totalBytes;
    uploadedBytes += u.bytesUploaded;
  }

  const totalProgress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  return { uploadList, counts, totalProgress };
}

const initialDerived = computeDerivedState(new Map());

export const useUploadStore = create<UploadState>((set, get) => ({
  uploads: new Map(),
  uploadList: initialDerived.uploadList,
  counts: initialDerived.counts,
  totalProgress: initialDerived.totalProgress,

  addUpload: (item) =>
    set((state) => {
      const uploads = new Map(state.uploads);
      uploads.set(item.id, item);
      return { uploads, ...computeDerivedState(uploads) };
    }),

  addUploads: (items) =>
    set((state) => {
      const uploads = new Map(state.uploads);
      items.forEach((item) => uploads.set(item.id, item));
      return { uploads, ...computeDerivedState(uploads) };
    }),

  updateProgress: (id, bytesUploaded, totalBytes) =>
    set((state) => {
      const uploads = new Map(state.uploads);
      const upload = uploads.get(id);
      if (upload) {
        uploads.set(id, {
          ...upload,
          bytesUploaded,
          totalBytes,
          progress: Math.round((bytesUploaded / totalBytes) * 100),
          status: "uploading",
        });
      }
      return { uploads, ...computeDerivedState(uploads) };
    }),

  setStatus: (id, status, error) =>
    set((state) => {
      const uploads = new Map(state.uploads);
      const upload = uploads.get(id);
      if (upload) {
        uploads.set(id, {
          ...upload,
          status,
          error,
          completedAt:
            status === "completed" || status === "failed" ? Date.now() : undefined,
        });
      }
      return { uploads, ...computeDerivedState(uploads) };
    }),

  removeUpload: (id) =>
    set((state) => {
      const uploads = new Map(state.uploads);
      uploads.delete(id);
      return { uploads, ...computeDerivedState(uploads) };
    }),

  clearCompleted: () =>
    set((state) => {
      const uploads = new Map(state.uploads);
      for (const [id, upload] of uploads) {
        if (upload.status === "completed") {
          uploads.delete(id);
        }
      }
      return { uploads, ...computeDerivedState(uploads) };
    }),

  clearAll: () => {
    const uploads = new Map<string, UploadItem>();
    return set({ uploads, ...computeDerivedState(uploads) });
  },

  cancelUpload: (id) =>
    set((state) => {
      const uploads = new Map(state.uploads);
      const upload = uploads.get(id);
      if (upload && (upload.status === "pending" || upload.status === "uploading")) {
        uploads.set(id, { ...upload, status: "cancelled" });
      }
      return { uploads, ...computeDerivedState(uploads) };
    }),

  retryUpload: (id) =>
    set((state) => {
      const uploads = new Map(state.uploads);
      const upload = uploads.get(id);
      if (upload && (upload.status === "failed" || upload.status === "cancelled")) {
        uploads.set(id, {
          ...upload,
          status: "pending",
          progress: 0,
          bytesUploaded: 0,
          error: undefined,
        });
      }
      return { uploads, ...computeDerivedState(uploads) };
    }),

  getNextPending: () => {
    return get().uploadList.find((u) => u.status === "pending");
  },

  canStartUpload: () => {
    return get().counts.active < MAX_CONCURRENT_UPLOADS;
  },
}));

// Simple selectors that don't create new references
export const useUploadQueue = () => useUploadStore((state) => state.uploadList);
export const useUploadCounts = () => useUploadStore((state) => state.counts);
export const useTotalProgress = () => useUploadStore((state) => state.totalProgress);

export const useActiveUploads = () =>
  useUploadStore((state) =>
    state.uploadList.filter((u) => u.status === "uploading")
  );
