import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useBrowserStore } from "@/lib/store";
import { AppSidebar } from "./app-sidebar";
import { FileExplorer } from "./file-explorer";
import { PreviewPanel } from "./preview-panel";
import { Toolbar } from "./toolbar";
import { DropZone } from "./drop-zone";
import { UploadToast } from "./upload-toast";
import { DownloadToast } from "./download-toast";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function BrowserLayout() {
  const selectedFileKeys = useBrowserStore((s) => s.selectedFileKeys);
  const previewPanelOpen = useBrowserStore((s) => s.previewPanelOpen);
  const setPreviewPanelOpen = useBrowserStore((s) => s.setPreviewPanelOpen);

  // Show preview panel when files are selected and panel is open
  const hasSelection = selectedFileKeys.length > 0;
  const isPreviewOpen = hasSelection && previewPanelOpen;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setPreviewPanelOpen(false);
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-0 overflow-hidden">
        <Toolbar />
        <DropZone className="flex-1 min-h-0">
          <FileExplorer />
        </DropZone>
      </SidebarInset>

      <Sheet open={isPreviewOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[400px] sm:max-w-[400px] p-0"
        >
          <PreviewPanel />
        </SheetContent>
      </Sheet>

      <UploadToast />
      <DownloadToast />
    </SidebarProvider>
  );
}
