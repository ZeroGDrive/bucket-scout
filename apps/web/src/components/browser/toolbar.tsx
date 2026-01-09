import { useState, useCallback, useMemo } from "react";
import {
  RefreshCw,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  Trash2,
  FolderPlus,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBrowserStore, useCurrentPath } from "@/lib/store";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  useObjects,
  useDeleteObjects,
  useCreateFolder,
  useCopyMoveObjects,
} from "@/lib/queries";
import { cn, parseS3Error } from "@/lib/utils";
import { UploadButton } from "./upload-button";
import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";
import { CreateFolderDialog } from "./create-folder-dialog";
import { SearchInput } from "./search-input";
import { SearchFilters } from "./search-filters";
import { ResponsiveBreadcrumb } from "./responsive-breadcrumb";
import { useDownloadManager } from "@/hooks/use-download-manager";
import { toast } from "sonner";
import type { FileItem } from "@/lib/types";

export function Toolbar() {
  const queryClient = useQueryClient();

  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const selectedFileKeys = useBrowserStore((s) => s.selectedFileKeys);
  const currentPath = useCurrentPath();
  const viewMode = useBrowserStore((s) => s.viewMode);

  const setCurrentPath = useBrowserStore((s) => s.setCurrentPath);
  const navigateToRoot = useBrowserStore((s) => s.navigateToRoot);
  const toggleViewMode = useBrowserStore((s) => s.toggleViewMode);
  const clearSelection = useBrowserStore((s) => s.clearSelection);
  const clearDragState = useBrowserStore((s) => s.clearDragState);

  const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
  // Use isRefetching instead of isFetching to avoid spinner during initial load
  // isFetching = true during ANY fetch (initial + refetch)
  // isRefetching = true only during background refetch (after data exists)
  const { data, isRefetching } = useObjects(selectedAccountId, selectedBucket, prefix);
  const deleteObjects = useDeleteObjects();
  const createFolder = useCreateFolder();
  const copyMoveObjects = useCopyMoveObjects();
  const { queueDownloads, queueFolderDownload } = useDownloadManager();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);

  // Get items from current view to find selected items info
  const items: FileItem[] = useMemo(() => {
    if (!data?.pages) return [];
    const allItems: FileItem[] = [];
    for (const page of data.pages) {
      for (const folder of page.folders) {
        const name = folder.replace(prefix, "").replace(/\/$/, "");
        if (name) {
          allItems.push({ name, key: folder, size: 0, isFolder: true });
        }
      }
      for (const obj of page.objects) {
        const name = obj.key.replace(prefix, "");
        if (name && !name.endsWith("/")) {
          allItems.push({
            name,
            key: obj.key,
            size: obj.size,
            lastModified: obj.lastModified,
            isFolder: false,
          });
        }
      }
    }
    return allItems;
  }, [data?.pages, prefix]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedFileKeys.includes(item.key)),
    [items, selectedFileKeys],
  );

  const hasSelection = selectedFileKeys.length > 0;

  const handleRefresh = () => {
    if (selectedAccountId && selectedBucket) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.objects(selectedAccountId, selectedBucket, prefix),
      });
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      navigateToRoot();
    } else {
      setCurrentPath(currentPath.slice(0, index + 1));
    }
  };

  // Handle drop on breadcrumb segments
  const handleBreadcrumbDrop = useCallback(
    (targetPrefix: string, keys: string[]) => {
      if (!selectedAccountId || !selectedBucket || keys.length === 0) {
        clearDragState();
        return;
      }

      // Don't move to current location
      if (targetPrefix === prefix) {
        clearDragState();
        return;
      }

      const toastId = toast.loading(`Moving ${keys.length} item${keys.length > 1 ? "s" : ""}...`);

      copyMoveObjects.mutate(
        {
          accountId: selectedAccountId,
          bucket: selectedBucket,
          sourceKeys: keys,
          destinationPrefix: targetPrefix,
          deleteSource: true,
        },
        {
          onSuccess: (result) => {
            clearSelection();
            if (result.errors.length > 0) {
              toast.error(
                `Moved ${result.objectsCopied} item(s), but ${result.errors.length} failed`,
                {
                  id: toastId,
                },
              );
            } else {
              toast.success(`Moved ${result.objectsCopied} item(s)`, { id: toastId });
            }
          },
          onError: (error) => {
            toast.error("Failed to move items", {
              id: toastId,
              description: parseS3Error(error),
            });
          },
        },
      );
      clearDragState();
    },
    [selectedAccountId, selectedBucket, prefix, copyMoveObjects, clearSelection, clearDragState],
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
          toast.error("Failed to delete", {
            description: parseS3Error(error),
          });
        },
      },
    );
  }, [selectedAccountId, selectedBucket, selectedFileKeys, deleteObjects, clearSelection]);

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
            toast.error("Failed to create folder", {
              description: parseS3Error(error),
            });
          },
        },
      );
    },
    [selectedAccountId, selectedBucket, prefix, createFolder],
  );

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/80 backdrop-blur-sm px-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-5 mr-1 my-auto" />

        {/* Breadcrumb navigation */}
        <ResponsiveBreadcrumb
          bucket={selectedBucket}
          path={currentPath}
          onNavigate={handleBreadcrumbClick}
          onDrop={handleBreadcrumbDrop}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <SearchInput />
        <SearchFilters />

        <Separator orientation="vertical" className="h-5 my-auto" />

        {/* Selection indicator and actions menu */}
        {hasSelection && (
          <>
            <span className="text-xs text-muted-foreground px-2 tabular-nums">
              {selectedFileKeys.length} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Actions"
                    className="text-muted-foreground hover:text-foreground"
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    // Download files directly
                    const fileKeys = selectedItems
                      .filter((item) => !item.isFolder)
                      .map((item) => item.key);
                    if (fileKeys.length > 0) {
                      queueDownloads(fileKeys);
                      toast.success(`Downloading ${fileKeys.length} file(s)`);
                    }

                    // Download folders as ZIP
                    const folderKeys = selectedItems
                      .filter((item) => item.isFolder)
                      .map((item) => item.key);
                    for (const folderKey of folderKeys) {
                      queueFolderDownload(folderKey);
                    }

                    if (fileKeys.length === 0 && folderKeys.length === 0) {
                      toast.error("No items selected to download");
                    }
                  }}
                >
                  <Download />
                  Download
                  {selectedItems.length > 1 ? ` (${selectedItems.length} items)` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={handleDeleteRequest}>
                  <Trash2 />
                  Delete{selectedFileKeys.length > 1 ? ` (${selectedFileKeys.length} items)` : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="h-5 mx-1.5 my-auto" />
          </>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCreateFolderDialogOpen(true)}
          disabled={!selectedBucket}
          title="New Folder"
          className="text-muted-foreground hover:text-foreground"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>

        <UploadButton />

        <Separator orientation="vertical" className="h-5 my-auto mx-1.5" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={!selectedBucket || isRefetching}
          title="Refresh"
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1.5 my-auto" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleViewMode}
          title={viewMode === "grid" ? "List view" : "Grid view"}
          className="text-muted-foreground hover:text-foreground"
        >
          {viewMode === "grid" ? (
            <LayoutList className="h-4 w-4" />
          ) : (
            <LayoutGrid className="h-4 w-4" />
          )}
        </Button>
      </div>

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
    </header>
  );
}
