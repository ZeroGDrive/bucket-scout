import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "grid" | "list";

interface BrowserState {
  // Selection state
  selectedAccountId: string | null;
  selectedBucket: string | null;
  currentPath: string[]; // ["folder", "subfolder"]
  selectedFileKeys: string[]; // Multi-selection (array for React reactivity)
  lastSelectedKey: string | null; // For Shift+click range selection

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
  selectFile: (key: string) => void; // Single select (clears others)
  toggleFileSelection: (key: string) => void; // Cmd/Ctrl+click
  selectRange: (key: string, allKeys: string[]) => void; // Shift+click
  selectAll: (allKeys: string[]) => void; // Cmd+A
  clearSelection: () => void;
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
      selectedFileKeys: [],
      lastSelectedKey: null,
      viewMode: "list",
      sidebarWidth: 240,
      previewPanelOpen: true,

      // Actions
      setAccount: (id) =>
        set({
          selectedAccountId: id,
          selectedBucket: null,
          currentPath: [],
          selectedFileKeys: [],
          lastSelectedKey: null,
        }),

      setBucket: (name) =>
        set({
          selectedBucket: name,
          currentPath: [],
          selectedFileKeys: [],
          lastSelectedKey: null,
        }),

      setCurrentPath: (path) =>
        set({
          currentPath: path,
          selectedFileKeys: [],
          lastSelectedKey: null,
        }),

      navigateTo: (folder) => {
        const { currentPath } = get();
        // folder might be a full prefix like "folder/subfolder/"
        // Extract just the new folder name
        const folderName = folder.replace(/\/$/, "").split("/").pop() || folder;
        set({
          currentPath: [...currentPath, folderName],
          selectedFileKeys: [],
          lastSelectedKey: null,
        });
      },

      navigateUp: () => {
        const { currentPath } = get();
        if (currentPath.length > 0) {
          set({
            currentPath: currentPath.slice(0, -1),
            selectedFileKeys: [],
            lastSelectedKey: null,
          });
        }
      },

      navigateToRoot: () =>
        set({
          currentPath: [],
          selectedFileKeys: [],
          lastSelectedKey: null,
        }),

      selectFile: (key) =>
        set({
          selectedFileKeys: [key],
          lastSelectedKey: key,
        }),

      toggleFileSelection: (key) => {
        const { selectedFileKeys } = get();
        const index = selectedFileKeys.indexOf(key);
        if (index >= 0) {
          // Remove from selection
          set({
            selectedFileKeys: selectedFileKeys.filter((k) => k !== key),
            lastSelectedKey: key,
          });
        } else {
          // Add to selection
          set({
            selectedFileKeys: [...selectedFileKeys, key],
            lastSelectedKey: key,
          });
        }
      },

      selectRange: (key, allKeys) => {
        const { lastSelectedKey, selectedFileKeys } = get();
        if (!lastSelectedKey) {
          // No previous selection, just select this one
          set({
            selectedFileKeys: [key],
            lastSelectedKey: key,
          });
          return;
        }

        const startIndex = allKeys.indexOf(lastSelectedKey);
        const endIndex = allKeys.indexOf(key);

        if (startIndex === -1 || endIndex === -1) {
          // Fallback to single selection
          set({
            selectedFileKeys: [key],
            lastSelectedKey: key,
          });
          return;
        }

        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangeKeys = allKeys.slice(from, to + 1);
        // Merge with existing selection, avoiding duplicates
        const merged = [...new Set([...selectedFileKeys, ...rangeKeys])];

        set({
          selectedFileKeys: merged,
          // Keep lastSelectedKey unchanged for continuous range selection
        });
      },

      selectAll: (allKeys) =>
        set({
          selectedFileKeys: [...allKeys],
          lastSelectedKey: allKeys.length > 0 ? allKeys[allKeys.length - 1] : null,
        }),

      clearSelection: () =>
        set({
          selectedFileKeys: [],
          lastSelectedKey: null,
        }),

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
