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
import { useBrowserStore, useCurrentPrefix } from "@/lib/store";
import { useObjects, useThumbnail, useDeleteObjects } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { FileItem } from "@/lib/types";
import { FileContextMenu } from "./file-context-menu";
import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";
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
    isImageFile(name)
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

  const navigateTo = useBrowserStore((s) => s.navigateTo);
  const selectFile = useBrowserStore((s) => s.selectFile);
  const toggleFileSelection = useBrowserStore((s) => s.toggleFileSelection);
  const selectRange = useBrowserStore((s) => s.selectRange);
  const selectAll = useBrowserStore((s) => s.selectAll);
  const clearSelection = useBrowserStore((s) => s.clearSelection);
  const setPreviewPanelOpen = useBrowserStore((s) => s.setPreviewPanelOpen);

  const prefix = useCurrentPrefix();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useObjects(selectedAccountId, selectedBucket, prefix);

  const deleteObjects = useDeleteObjects();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Combine all pages and transform to FileItems
  const items: FileItem[] = useMemo(() => {
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

  // Get all item keys for range selection
  const allKeys = useMemo(() => items.map((item) => item.key), [items]);

  // Get selected items for delete dialog
  const selectedItems = useMemo(
    () => items.filter((item) => selectedFileKeys.includes(item.key)),
    [items, selectedFileKeys]
  );

  // Handle Cmd+A to select all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        selectAll(allKeys);
      }
      // Handle Delete/Backspace key
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFileKeys.length > 0) {
        e.preventDefault();
        setDeleteDialogOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [allKeys, selectAll, selectedFileKeys.length]);

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
    [toggleFileSelection, selectRange, selectFile, allKeys]
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
    [navigateTo, selectFile, setPreviewPanelOpen]
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
    [selectedFileKeys, selectFile]
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Clear selection when clicking on empty area (not on items)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Check if the click target is inside a file item (marked with data-file-item)
    const target = e.target as HTMLElement;
    const isClickOnItem = target.closest("[data-file-item]");
    if (!isClickOnItem) {
      clearSelection();
    }
  }, [clearSelection]);

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
            toast.error(
              `Deleted ${result.deleted} item(s), but ${result.errors.length} failed`
            );
          } else {
            toast.success(`Deleted ${result.deleted} item(s)`);
          }
        },
        onError: (error) => {
          toast.error(`Failed to delete: ${error.message}`);
        },
      }
    );
  }, [selectedAccountId, selectedBucket, selectedFileKeys, deleteObjects, clearSelection]);

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

  if (items.length === 0) {
    return <EmptyState icon={FolderOpen} message="This folder is empty" />;
  }

  if (viewMode === "grid") {
    return (
      <>
        <ScrollArea className="h-full" onClick={handleContainerClick}>
          <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4" onClick={handleContainerClick}>
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
                    isSelected ? "bg-accent ring-2 ring-primary/30" : "hover:bg-accent/50"
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
            selectedCount={selectedFileKeys.length}
          />
        )}
        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          items={selectedItems}
          onConfirm={handleConfirmDelete}
          isDeleting={deleteObjects.isPending}
        />
      </>
    );
  }

  // List view
  return (
    <>
      <ScrollArea className="h-full" onClick={handleContainerClick}>
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
                    isSelected ? "bg-accent" : "hover:bg-accent/50"
                  )}
                  onMouseDown={handleMouseDown}
                  onClick={(e) => handleItemClick(e, item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "rounded p-1 transition-colors",
                        item.isFolder
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground"
                      )}>
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
          selectedCount={selectedFileKeys.length}
        />
      )}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        items={selectedItems}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteObjects.isPending}
      />
    </>
  );
}
