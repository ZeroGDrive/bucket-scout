import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "grid" | "list";

interface BrowserState {
  // Selection state
  selectedAccountId: string | null;
  selectedBucket: string | null;
  currentPath: string[]; // ["folder", "subfolder"]
  selectedFileKey: string | null;

  // UI state
  viewMode: ViewMode;
  sidebarWidth: number;
  previewPanelOpen: boolean;

  // Actions
  setAccount: (id: string | null) => void;
  setBucket: (name: string | null) => void;
  setCurrentPath: (path: string[]) => void;
  navigateTo: (folder: string) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;
  selectFile: (key: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setSidebarWidth: (width: number) => void;
  setPreviewPanelOpen: (open: boolean) => void;
  togglePreviewPanel: () => void;
}

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedAccountId: null,
      selectedBucket: null,
      currentPath: [],
      selectedFileKey: null,
      viewMode: "list",
      sidebarWidth: 240,
      previewPanelOpen: true,

      // Actions
      setAccount: (id) =>
        set({
          selectedAccountId: id,
          selectedBucket: null,
          currentPath: [],
          selectedFileKey: null,
        }),

      setBucket: (name) =>
        set({
          selectedBucket: name,
          currentPath: [],
          selectedFileKey: null,
        }),

      setCurrentPath: (path) =>
        set({
          currentPath: path,
          selectedFileKey: null,
        }),

      navigateTo: (folder) => {
        const { currentPath } = get();
        // folder might be a full prefix like "folder/subfolder/"
        // Extract just the new folder name
        const folderName = folder.replace(/\/$/, "").split("/").pop() || folder;
        set({
          currentPath: [...currentPath, folderName],
          selectedFileKey: null,
        });
      },

      navigateUp: () => {
        const { currentPath } = get();
        if (currentPath.length > 0) {
          set({
            currentPath: currentPath.slice(0, -1),
            selectedFileKey: null,
          });
        }
      },

      navigateToRoot: () =>
        set({
          currentPath: [],
          selectedFileKey: null,
        }),

      selectFile: (key) => set({ selectedFileKey: key }),

      setViewMode: (mode) => set({ viewMode: mode }),

      toggleViewMode: () =>
        set((state) => ({
          viewMode: state.viewMode === "grid" ? "list" : "grid",
        })),

      setSidebarWidth: (width) => set({ sidebarWidth: width }),

      setPreviewPanelOpen: (open) => set({ previewPanelOpen: open }),

      togglePreviewPanel: () =>
        set((state) => ({ previewPanelOpen: !state.previewPanelOpen })),
    }),
    {
      name: "s3-browser-storage",
      partialize: (state) => ({
        viewMode: state.viewMode,
        sidebarWidth: state.sidebarWidth,
        previewPanelOpen: state.previewPanelOpen,
      }),
    }
  )
);

// Selector helpers
export const useSelectedAccount = () =>
  useBrowserStore((state) => state.selectedAccountId);
export const useSelectedBucket = () =>
  useBrowserStore((state) => state.selectedBucket);
export const useCurrentPath = () =>
  useBrowserStore((state) => state.currentPath);
export const useViewMode = () => useBrowserStore((state) => state.viewMode);

// Get the current prefix for S3 queries
export const useCurrentPrefix = () =>
  useBrowserStore((state) =>
    state.currentPath.length > 0 ? state.currentPath.join("/") + "/" : ""
  );
