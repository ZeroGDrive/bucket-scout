import { useState, useCallback, useMemo } from "react";
import {
  RefreshCw,
  LayoutGrid,
  LayoutList,
  ChevronRight,
  Home,
  MoreHorizontal,
  Trash2,
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
import { queryKeys, useObjects, useDeleteObjects } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { UploadButton } from "./upload-button";
import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";
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

  const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
  const { data } = useObjects(selectedAccountId, selectedBucket, prefix);
  const deleteObjects = useDeleteObjects();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
    [items, selectedFileKeys]
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

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/80 backdrop-blur-sm px-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-5 mr-1" />

        {/* Breadcrumb navigation */}
        <nav className="flex items-center gap-0.5 text-sm min-w-0 overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => handleBreadcrumbClick(-1)}
            disabled={!selectedBucket}
          >
            <Home className="h-3.5 w-3.5" />
          </Button>

          {selectedBucket && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 font-medium text-foreground"
                onClick={() => handleBreadcrumbClick(-1)}
              >
                {selectedBucket}
              </Button>
            </>
          )}

          {currentPath.map((folder, index) => (
            <div key={index} className="flex items-center gap-0.5 min-w-0">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2 min-w-0",
                  index === currentPath.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleBreadcrumbClick(index)}
              >
                <span className="truncate">{folder}</span>
              </Button>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-0.5">
        {/* Selection indicator and actions menu */}
        {hasSelection && (
          <>
            <span className="text-xs text-muted-foreground px-2">
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
                  variant="destructive"
                  onClick={handleDeleteRequest}
                >
                  <Trash2 />
                  Delete{selectedFileKeys.length > 1 ? ` (${selectedFileKeys.length} items)` : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="h-5 mx-1.5" />
          </>
        )}

        <UploadButton />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={!selectedBucket}
          title="Refresh (Cmd+R)"
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1.5" />

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
    </header>
  );
}
