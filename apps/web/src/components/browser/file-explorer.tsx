import { useMemo, memo, useState, useCallback, useEffect, useRef } from "react";
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileJson,
  FileCode,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { Image } from "@unpic/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useBrowserStore, useCurrentPrefix, useClipboard } from "@/lib/store";
import {
  useObjects,
  useThumbnail,
  useDeleteObjects,
  useSearchObjects,
  useCreateFolder,
  useRenameObject,
  useCopyMoveObjects,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { FileItem } from "@/lib/types";
import { Loader2, SearchX } from "lucide-react";
import { FileContextMenu } from "./file-context-menu";
import { EmptyAreaContextMenu } from "./empty-area-context-menu";
import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";
import { CreateFolderDialog } from "./create-folder-dialog";
import { RenameDialog } from "./rename-dialog";
import { PresignedUrlDialog } from "./presigned-url-dialog";
import { toast } from "sonner";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

function getFileIcon(name: string, isFolder: boolean) {
  if (isFolder) return Folder;

  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp":
    case "svg":
    case "ico":
      return FileImage;
    case "json":
      return FileJson;
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "py":
    case "rs":
    case "go":
    case "java":
    case "html":
    case "css":
      return FileCode;
    case "txt":
    case "md":
    case "log":
      return FileText;
    default:
      return File;
  }
}

// Thumbnail component with lazy loading
const ThumbnailImage = memo(function ThumbnailImage({
  accountId,
  bucket,
  fileKey,
  name,
}: {
  accountId: string;
  bucket: string;
  fileKey: string;
  name: string;
}) {
  const { data: thumbnail, isLoading } = useThumbnail(
    accountId,
    bucket,
    fileKey,
    isImageFile(name),
  );

  if (!isImageFile(name)) {
    const Icon = getFileIcon(name, false);
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/50 rounded-lg">
        <Icon className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-lg animate-pulse">
        <FileImage className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
      </div>
    );
  }

  if (thumbnail) {
    return (
      <Image
        src={`data:${thumbnail.mimeType};base64,${thumbnail.base64}`}
        alt={name}
        layout="fullWidth"
        aspectRatio={thumbnail.width / thumbnail.height}
        className="w-full h-full object-cover rounded-lg"
      />
    );
  }

  // Fallback to icon if no thumbnail
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/50 rounded-lg">
      <FileImage className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
    </div>
  );
});

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateString?: string): string {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function FileExplorer() {
  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const selectedFileKeys = useBrowserStore((s) => s.selectedFileKeys);
  const viewMode = useBrowserStore((s) => s.viewMode);
  const searchQuery = useBrowserStore((s) => s.searchQuery);
  const searchRecursive = useBrowserStore((s) => s.searchRecursive);

  const navigateTo = useBrowserStore((s) => s.navigateTo);
  const selectFile = useBrowserStore((s) => s.selectFile);
  const toggleFileSelection = useBrowserStore((s) => s.toggleFileSelection);
  const selectRange = useBrowserStore((s) => s.selectRange);
  const selectAll = useBrowserStore((s) => s.selectAll);
  const clearSelection = useBrowserStore((s) => s.clearSelection);
  const setPreviewPanelOpen = useBrowserStore((s) => s.setPreviewPanelOpen);

  // Clipboard state
  const clipboard = useClipboard();
  const copyToClipboard = useBrowserStore((s) => s.copyToClipboard);
  const cutToClipboard = useBrowserStore((s) => s.cutToClipboard);
  const clearClipboard = useBrowserStore((s) => s.clearClipboard);

  const prefix = useCurrentPrefix();

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useObjects(
    selectedAccountId,
    selectedBucket,
    prefix,
  );

  // Recursive search query
  const { data: searchResults, isLoading: isSearching } = useSearchObjects(
    selectedAccountId,
    selectedBucket,
    prefix,
    searchQuery,
    searchRecursive && searchQuery.length >= 2,
  );

  const deleteObjects = useDeleteObjects();
  const createFolder = useCreateFolder();
  const renameObject = useRenameObject();
  const copyMoveObjects = useCopyMoveObjects();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [emptyAreaContextMenu, setEmptyAreaContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Track the item being renamed/shared
  const [itemToRename, setItemToRename] = useState<FileItem | null>(null);
  const [itemToShare, setItemToShare] = useState<FileItem | null>(null);

  // Combine all pages and transform to FileItems
  const rawItems: FileItem[] = useMemo(() => {
    if (!data?.pages) return [];

    const allFolders: FileItem[] = [];
    const allFiles: FileItem[] = [];

    for (const page of data.pages) {
      // Add folders
      for (const folder of page.folders) {
        const name = folder.replace(prefix, "").replace(/\/$/, "");
        if (name) {
          allFolders.push({
            name,
            key: folder,
            size: 0,
            isFolder: true,
          });
        }
      }

      // Add files
      for (const obj of page.objects) {
        const name = obj.key.replace(prefix, "");
        if (name && !name.endsWith("/")) {
          allFiles.push({
            name,
            key: obj.key,
            size: obj.size,
            lastModified: obj.lastModified,
            isFolder: false,
          });
        }
      }
    }

    // Sort: folders first, then files, both alphabetically
    return [
      ...allFolders.sort((a, b) => a.name.localeCompare(b.name)),
      ...allFiles.sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }, [data?.pages, prefix]);

  // Transform search results to FileItems (for recursive search)
  const searchItems: FileItem[] = useMemo(() => {
    if (!searchResults) return [];

    return searchResults.map((obj) => ({
      name: obj.key.split("/").pop() || obj.key,
      key: obj.key,
      size: obj.size,
      lastModified: obj.lastModified,
      isFolder: obj.isFolder,
    }));
  }, [searchResults]);

  // Final items: either search results or filtered local items
  const items: FileItem[] = useMemo(() => {
    // If recursive search is active and we have a query, use search results
    if (searchRecursive && searchQuery.length >= 2) {
      return searchItems;
    }

    // If local search (non-recursive), filter the raw items
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      return rawItems.filter((item) => item.name.toLowerCase().includes(queryLower));
    }

    // No search, return all items
    return rawItems;
  }, [rawItems, searchItems, searchQuery, searchRecursive]);

  // Get all item keys for range selection
  const allKeys = useMemo(() => items.map((item) => item.key), [items]);

  // Get selected items for delete dialog
  const selectedItems = useMemo(
    () => items.filter((item) => selectedFileKeys.includes(item.key)),
    [items, selectedFileKeys],
  );

  // Prevent text selection on shift+click (must be on mousedown, not click)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
    }
  }, []);

  // Use a ref to track click timeout for distinguishing single vs double click
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleItemClick = useCallback(
    (e: React.MouseEvent, item: FileItem) => {
      // Clear any pending click timeout
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      // For modifier keys, execute immediately (no delay needed)
      if (e.metaKey || e.ctrlKey) {
        toggleFileSelection(item.key);
        return;
      }
      if (e.shiftKey) {
        selectRange(item.key, allKeys);
        return;
      }

      // For regular clicks, delay to allow double-click detection
      clickTimeoutRef.current = setTimeout(() => {
        selectFile(item.key);
        clickTimeoutRef.current = null;
      }, 200);
    },
    [toggleFileSelection, selectRange, selectFile, allKeys],
  );

  const handleItemDoubleClick = useCallback(
    (item: FileItem) => {
      // Clear the single click timeout to prevent selection
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      if (item.isFolder) {
        navigateTo(item.key);
      } else {
        // Select the file and open preview
        selectFile(item.key);
        setPreviewPanelOpen(true);
      }
    },
    [navigateTo, selectFile, setPreviewPanelOpen],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, item: FileItem) => {
      e.preventDefault();
      // If right-clicking on unselected item, select only that item
      if (!selectedFileKeys.includes(item.key)) {
        selectFile(item.key);
      }
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [selectedFileKeys, selectFile],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCloseEmptyAreaContextMenu = useCallback(() => {
    setEmptyAreaContextMenu(null);
  }, []);

  const handleEmptyAreaContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Check if the click target is inside a file item
      const target = e.target as HTMLElement;
      const isClickOnItem = target.closest("[data-file-item]");
      if (!isClickOnItem) {
        e.preventDefault();
        clearSelection();
        setEmptyAreaContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [clearSelection],
  );

  const handleCreateFolderRequest = useCallback(() => {
    setCreateFolderDialogOpen(true);
  }, []);

  const handleCreateFolder = useCallback(
    (folderName: string) => {
      if (!selectedAccountId || !selectedBucket) {
        return;
      }

      createFolder.mutate(
        {
          accountId: selectedAccountId,
          bucket: selectedBucket,
          prefix,
          folderName,
        },
        {
          onSuccess: () => {
            setCreateFolderDialogOpen(false);
            toast.success(`Created folder "${folderName}"`);
          },
          onError: (error) => {
            toast.error(`Failed to create folder: ${error.message}`);
          },
        },
      );
    },
    [selectedAccountId, selectedBucket, prefix, createFolder],
  );

  // Clear selection when clicking on empty area (not on items)
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      // Check if the click target is inside a file item (marked with data-file-item)
      const target = e.target as HTMLElement;
      const isClickOnItem = target.closest("[data-file-item]");
      if (!isClickOnItem) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  const handleDeleteRequest = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!selectedAccountId || !selectedBucket || selectedFileKeys.length === 0) {
      return;
    }

    const keysToDelete = [...selectedFileKeys];

    deleteObjects.mutate(
      {
        accountId: selectedAccountId,
        bucket: selectedBucket,
        keys: keysToDelete,
      },
      {
        onSuccess: (result) => {
          setDeleteDialogOpen(false);
          clearSelection();
          if (result.errors.length > 0) {
            toast.error(`Deleted ${result.deleted} item(s), but ${result.errors.length} failed`);
          } else {
            toast.success(`Deleted ${result.deleted} item(s)`);
          }
        },
        onError: (error) => {
          toast.error(`Failed to delete: ${error.message}`);
        },
      },
    );
  }, [selectedAccountId, selectedBucket, selectedFileKeys, deleteObjects, clearSelection]);

  // Rename handlers
  const handleRenameRequest = useCallback(() => {
    const item = selectedItems[0];
    if (item) {
      setItemToRename(item);
      setRenameDialogOpen(true);
    }
  }, [selectedItems]);

  const handleConfirmRename = useCallback(
    (newName: string) => {
      if (!selectedAccountId || !selectedBucket || !itemToRename) {
        return;
      }

      renameObject.mutate(
        {
          accountId: selectedAccountId,
          bucket: selectedBucket,
          oldKey: itemToRename.key,
          newName,
        },
        {
          onSuccess: (result) => {
            setRenameDialogOpen(false);
            setItemToRename(null);
            clearSelection();
            toast.success(
              `Renamed "${itemToRename.name}" to "${newName}"${result.objectsRenamed > 1 ? ` (${result.objectsRenamed} files)` : ""}`,
            );
          },
          onError: (error) => {
            toast.error(`Failed to rename: ${error.message}`);
          },
        },
      );
    },
    [selectedAccountId, selectedBucket, itemToRename, renameObject, clearSelection],
  );

  // Copy/Cut handlers
  const handleCopy = useCallback(() => {
    if (selectedBucket && selectedFileKeys.length > 0) {
      copyToClipboard(selectedFileKeys, selectedBucket);
      toast.success(`Copied ${selectedFileKeys.length} item(s) to clipboard`);
    }
  }, [selectedBucket, selectedFileKeys, copyToClipboard]);

  const handleCut = useCallback(() => {
    if (selectedBucket && selectedFileKeys.length > 0) {
      cutToClipboard(selectedFileKeys, selectedBucket);
      toast.success(`Cut ${selectedFileKeys.length} item(s) to clipboard`);
    }
  }, [selectedBucket, selectedFileKeys, cutToClipboard]);

  // Paste handler
  const handlePaste = useCallback(() => {
    if (!selectedAccountId || !selectedBucket || !clipboard) {
      return;
    }

    // Only allow paste within same bucket for now
    if (clipboard.bucket !== selectedBucket) {
      toast.error("Cross-bucket paste not supported yet");
      return;
    }

    const deleteSource = clipboard.operation === "cut";

    copyMoveObjects.mutate(
      {
        accountId: selectedAccountId,
        bucket: selectedBucket,
        sourceKeys: clipboard.keys,
        destinationPrefix: prefix,
        deleteSource,
      },
      {
        onSuccess: (result) => {
          if (deleteSource) {
            clearClipboard();
          }
          if (result.errors.length > 0) {
            toast.error(
              `${deleteSource ? "Moved" : "Copied"} ${result.objectsCopied} item(s), but ${result.errors.length} failed`,
            );
          } else {
            toast.success(`${deleteSource ? "Moved" : "Copied"} ${result.objectsCopied} item(s)`);
          }
        },
        onError: (error) => {
          toast.error(`Failed to ${deleteSource ? "move" : "copy"}: ${error.message}`);
        },
      },
    );
  }, [selectedAccountId, selectedBucket, clipboard, prefix, copyMoveObjects, clearClipboard]);

  // Share handler
  const handleShareRequest = useCallback(() => {
    const item = selectedItems[0];
    if (item && !item.isFolder) {
      setItemToShare(item);
      setShareDialogOpen(true);
    }
  }, [selectedItems]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+A: Select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        selectAll(allKeys);
      }
      // Cmd/Ctrl+C: Copy
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedFileKeys.length > 0) {
        e.preventDefault();
        handleCopy();
      }
      // Cmd/Ctrl+X: Cut
      if ((e.metaKey || e.ctrlKey) && e.key === "x" && selectedFileKeys.length > 0) {
        e.preventDefault();
        handleCut();
      }
      // Cmd/Ctrl+V: Paste
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && clipboard) {
        e.preventDefault();
        handlePaste();
      }
      // Delete/Backspace: Delete
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFileKeys.length > 0) {
        e.preventDefault();
        setDeleteDialogOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [allKeys, selectAll, selectedFileKeys.length, clipboard, handleCopy, handleCut, handlePaste]);

  // Empty state component
  const EmptyState = ({ icon: Icon, message }: { icon: typeof Folder; message: string }) => (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/5 rounded-full blur-xl scale-150" />
        <div className="relative bg-muted/50 rounded-2xl p-6">
          <Icon className="h-12 w-12 text-muted-foreground/50" strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );

  // Empty states
  if (!selectedAccountId) {
    return <EmptyState icon={FolderOpen} message="Select an account to get started" />;
  }

  if (!selectedBucket) {
    return <EmptyState icon={FolderOpen} message="Select a bucket to browse files" />;
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  // Show loading state for recursive search
  if (searchRecursive && searchQuery.length >= 2 && isSearching) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-sm">Searching...</p>
      </div>
    );
  }

  // Show no results state for search
  if (searchQuery && items.length === 0) {
    return <EmptyState icon={SearchX} message={`No results for "${searchQuery}"`} />;
  }

  if (items.length === 0) {
    return <EmptyState icon={FolderOpen} message="This folder is empty" />;
  }

  if (viewMode === "grid") {
    return (
      <>
        <ScrollArea
          className="h-full"
          onClick={handleContainerClick}
          onContextMenu={handleEmptyAreaContextMenu}
        >
          <div
            className="p-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4"
            onClick={handleContainerClick}
          >
            {items.map((item) => {
              const Icon = getFileIcon(item.name, item.isFolder);
              const isSelected = selectedFileKeys.includes(item.key);
              const showThumbnail = !item.isFolder && isImageFile(item.name);

              return (
                <button
                  key={item.key}
                  type="button"
                  data-file-item
                  className={cn(
                    "flex flex-col items-center p-2 rounded-xl cursor-pointer group text-left select-none",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20",
                    isSelected ? "bg-accent ring-2 ring-primary/30" : "hover:bg-accent/50",
                  )}
                  onMouseDown={handleMouseDown}
                  onClick={(e) => handleItemClick(e, item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  {item.isFolder ? (
                    <div className="w-full aspect-square flex items-center justify-center bg-primary/10 rounded-lg mb-2">
                      <Folder className="h-12 w-12 text-primary" strokeWidth={1.5} />
                    </div>
                  ) : showThumbnail ? (
                    <div className="w-full aspect-square rounded-lg mb-2 overflow-hidden bg-muted/30">
                      <ThumbnailImage
                        accountId={selectedAccountId!}
                        bucket={selectedBucket!}
                        fileKey={item.key}
                        name={item.name}
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-muted/50 rounded-lg mb-2">
                      <Icon className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
                    </div>
                  )}
                  <span className="text-xs text-center truncate w-full font-medium px-1">
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
          {hasNextPage && (
            <div className="p-4 text-center border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-primary"
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </ScrollArea>
        {contextMenu && (
          <FileContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={handleCloseContextMenu}
            onDelete={handleDeleteRequest}
            onRename={handleRenameRequest}
            onCopy={handleCopy}
            onCut={handleCut}
            onShare={handleShareRequest}
            selectedCount={selectedFileKeys.length}
            isFolder={selectedItems[0]?.isFolder ?? false}
          />
        )}
        {emptyAreaContextMenu && (
          <EmptyAreaContextMenu
            x={emptyAreaContextMenu.x}
            y={emptyAreaContextMenu.y}
            onClose={handleCloseEmptyAreaContextMenu}
            onCreateFolder={handleCreateFolderRequest}
            onPaste={handlePaste}
            hasClipboard={!!clipboard && clipboard.bucket === selectedBucket}
            clipboardOperation={clipboard?.operation}
            clipboardCount={clipboard?.keys.length}
          />
        )}
        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          items={selectedItems}
          onConfirm={handleConfirmDelete}
          isDeleting={deleteObjects.isPending}
        />
        <CreateFolderDialog
          open={createFolderDialogOpen}
          onOpenChange={setCreateFolderDialogOpen}
          onConfirm={handleCreateFolder}
          isCreating={createFolder.isPending}
          currentPath={prefix || "/"}
        />
        <RenameDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          onConfirm={handleConfirmRename}
          isRenaming={renameObject.isPending}
          currentName={itemToRename?.name ?? ""}
          isFolder={itemToRename?.isFolder ?? false}
        />
        {itemToShare && selectedAccountId && selectedBucket && (
          <PresignedUrlDialog
            open={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
            accountId={selectedAccountId}
            bucket={selectedBucket}
            fileKey={itemToShare.key}
            fileName={itemToShare.name}
          />
        )}
      </>
    );
  }

  // List view
  return (
    <>
      <ScrollArea
        className="h-full"
        onClick={handleContainerClick}
        onContextMenu={handleEmptyAreaContextMenu}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background/95 backdrop-blur-sm border-b z-10">
            <tr className="text-left">
              <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground w-24 text-right">
                Size
              </th>
              <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground w-44 text-right whitespace-nowrap">
                Modified
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {items.map((item) => {
              const Icon = getFileIcon(item.name, item.isFolder);
              const isSelected = selectedFileKeys.includes(item.key);
              return (
                <tr
                  key={item.key}
                  data-file-item
                  className={cn(
                    "cursor-pointer group select-none",
                    isSelected ? "bg-accent" : "hover:bg-accent/50",
                  )}
                  onMouseDown={handleMouseDown}
                  onClick={(e) => handleItemClick(e, item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "rounded p-1 transition-colors",
                          item.isFolder ? "bg-primary/10 text-primary" : "text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <span className="truncate font-medium">{item.name}</span>
                      {item.isFolder && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-right tabular-nums">
                    {formatFileSize(item.size)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-right tabular-nums whitespace-nowrap">
                    {formatDate(item.lastModified)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasNextPage && (
          <div className="p-4 text-center border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-primary"
            >
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </ScrollArea>
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onDelete={handleDeleteRequest}
          onRename={handleRenameRequest}
          onCopy={handleCopy}
          onCut={handleCut}
          onShare={handleShareRequest}
          selectedCount={selectedFileKeys.length}
          isFolder={selectedItems[0]?.isFolder ?? false}
        />
      )}
      {emptyAreaContextMenu && (
        <EmptyAreaContextMenu
          x={emptyAreaContextMenu.x}
          y={emptyAreaContextMenu.y}
          onClose={handleCloseEmptyAreaContextMenu}
          onCreateFolder={handleCreateFolderRequest}
          onPaste={handlePaste}
          hasClipboard={!!clipboard && clipboard.bucket === selectedBucket}
          clipboardOperation={clipboard?.operation}
          clipboardCount={clipboard?.keys.length}
        />
      )}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        items={selectedItems}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteObjects.isPending}
      />
      <CreateFolderDialog
        open={createFolderDialogOpen}
        onOpenChange={setCreateFolderDialogOpen}
        onConfirm={handleCreateFolder}
        isCreating={createFolder.isPending}
        currentPath={prefix || "/"}
      />
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        onConfirm={handleConfirmRename}
        isRenaming={renameObject.isPending}
        currentName={itemToRename?.name ?? ""}
        isFolder={itemToRename?.isFolder ?? false}
      />
      {itemToShare && selectedAccountId && selectedBucket && (
        <PresignedUrlDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          accountId={selectedAccountId}
          bucket={selectedBucket}
          fileKey={itemToShare.key}
          fileName={itemToShare.name}
        />
      )}
    </>
  );
}
