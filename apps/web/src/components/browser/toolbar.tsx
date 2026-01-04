import {
  RefreshCw,
  LayoutGrid,
  LayoutList,
  ChevronRight,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBrowserStore, useCurrentPath } from "@/lib/store";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { UploadButton } from "./upload-button";

export function Toolbar() {
  const queryClient = useQueryClient();

  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const currentPath = useCurrentPath();
  const viewMode = useBrowserStore((s) => s.viewMode);

  const setCurrentPath = useBrowserStore((s) => s.setCurrentPath);
  const navigateToRoot = useBrowserStore((s) => s.navigateToRoot);
  const toggleViewMode = useBrowserStore((s) => s.toggleViewMode);

  const handleRefresh = () => {
    if (selectedAccountId && selectedBucket) {
      const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
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
    </header>
  );
}
