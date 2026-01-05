import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClipboardState } from "./types";

export type ViewMode = "grid" | "list";
export type SortBy = "name" | "size" | "modified";
export type SortDirection = "asc" | "desc";

interface BrowserState {
  // Selection state
  selectedAccountId: string | null;
  selectedBucket: string | null;
  currentPath: string[]; // ["folder", "subfolder"]
  selectedFileKeys: string[]; // Multi-selection (array for React reactivity)
  lastSelectedKey: string | null; // For Shift+click range selection

  // Clipboard state for copy/cut operations
  clipboard: ClipboardState | null;

  // Search state
  searchQuery: string;
  searchRecursive: boolean; // Toggle for recursive search

  // Search filters
  filterMinSize: number | null; // bytes
  filterMaxSize: number | null; // bytes
  filterDateFrom: string | null; // ISO date string
  filterDateTo: string | null; // ISO date string

  // Sort state
  sortBy: SortBy;
  sortDirection: SortDirection;

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
  setSearchQuery: (query: string) => void;
  setSearchRecursive: (recursive: boolean) => void;
  clearSearch: () => void;

  // Filter actions
  setFilterMinSize: (size: number | null) => void;
  setFilterMaxSize: (size: number | null) => void;
  setFilterDateFrom: (date: string | null) => void;
  setFilterDateTo: (date: string | null) => void;
  clearFilters: () => void;
  hasActiveFilters: () => boolean;

  // Sort actions
  setSortBy: (sortBy: SortBy) => void;
  setSortDirection: (direction: SortDirection) => void;
  toggleSort: (column: SortBy) => void;

  // Clipboard actions
  copyToClipboard: (keys: string[], bucket: string, accountId: string) => void;
  cutToClipboard: (keys: string[], bucket: string, accountId: string) => void;
  clearClipboard: () => void;
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
      clipboard: null,
      searchQuery: "",
      searchRecursive: true,
      filterMinSize: null,
      filterMaxSize: null,
      filterDateFrom: null,
      filterDateTo: null,
      sortBy: "name",
      sortDirection: "asc",
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
          searchQuery: "",
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
          searchQuery: "",
        });
      },

      navigateUp: () => {
        const { currentPath } = get();
        if (currentPath.length > 0) {
          set({
            currentPath: currentPath.slice(0, -1),
            selectedFileKeys: [],
            lastSelectedKey: null,
            searchQuery: "",
          });
        }
      },

      navigateToRoot: () =>
        set({
          currentPath: [],
          selectedFileKeys: [],
          lastSelectedKey: null,
          searchQuery: "",
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

      togglePreviewPanel: () => set((state) => ({ previewPanelOpen: !state.previewPanelOpen })),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setSearchRecursive: (recursive) => set({ searchRecursive: recursive }),

      clearSearch: () => set({ searchQuery: "" }),

      // Filter actions
      setFilterMinSize: (size) => set({ filterMinSize: size }),
      setFilterMaxSize: (size) => set({ filterMaxSize: size }),
      setFilterDateFrom: (date) => set({ filterDateFrom: date }),
      setFilterDateTo: (date) => set({ filterDateTo: date }),
      clearFilters: () =>
        set({
          filterMinSize: null,
          filterMaxSize: null,
          filterDateFrom: null,
          filterDateTo: null,
        }),
      hasActiveFilters: () => {
        const state = get();
        return (
          state.filterMinSize !== null ||
          state.filterMaxSize !== null ||
          state.filterDateFrom !== null ||
          state.filterDateTo !== null
        );
      },

      // Sort actions
      setSortBy: (sortBy) => set({ sortBy }),
      setSortDirection: (direction) => set({ sortDirection: direction }),
      toggleSort: (column) => {
        const { sortBy, sortDirection } = get();
        if (sortBy === column) {
          // Toggle direction if same column
          set({ sortDirection: sortDirection === "asc" ? "desc" : "asc" });
        } else {
          // New column, default to ascending
          set({ sortBy: column, sortDirection: "asc" });
        }
      },

      // Clipboard actions
      copyToClipboard: (keys, bucket, accountId) =>
        set({ clipboard: { keys, bucket, accountId, operation: "copy" } }),

      cutToClipboard: (keys, bucket, accountId) =>
        set({ clipboard: { keys, bucket, accountId, operation: "cut" } }),

      clearClipboard: () => set({ clipboard: null }),
    }),
    {
      name: "bucketscout-storage",
      partialize: (state) => ({
        viewMode: state.viewMode,
        sidebarWidth: state.sidebarWidth,
        previewPanelOpen: state.previewPanelOpen,
        sortBy: state.sortBy,
        sortDirection: state.sortDirection,
      }),
    },
  ),
);

// Selector helpers
export const useSelectedAccount = () => useBrowserStore((state) => state.selectedAccountId);
export const useSelectedBucket = () => useBrowserStore((state) => state.selectedBucket);
export const useCurrentPath = () => useBrowserStore((state) => state.currentPath);
export const useViewMode = () => useBrowserStore((state) => state.viewMode);

// Get the current prefix for S3 queries
export const useCurrentPrefix = () =>
  useBrowserStore((state) =>
    state.currentPath.length > 0 ? state.currentPath.join("/") + "/" : "",
  );

// Search selectors
export const useSearchQuery = () => useBrowserStore((state) => state.searchQuery);
export const useSearchRecursive = () => useBrowserStore((state) => state.searchRecursive);

// Clipboard selector
export const useClipboard = () => useBrowserStore((state) => state.clipboard);

// Sort selectors
export const useSortBy = () => useBrowserStore((state) => state.sortBy);
export const useSortDirection = () => useBrowserStore((state) => state.sortDirection);
