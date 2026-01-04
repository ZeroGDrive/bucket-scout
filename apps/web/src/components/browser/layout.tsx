import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import { useBrowserStore } from "@/lib/store";
import { AppSidebar } from "./app-sidebar";
import { FileExplorer } from "./file-explorer";
import { PreviewPanel } from "./preview-panel";
import { Toolbar } from "./toolbar";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

export function BrowserLayout() {
  const selectedFileKey = useBrowserStore((s) => s.selectedFileKey);
  const selectFile = useBrowserStore((s) => s.selectFile);

  const isPreviewOpen = !!selectedFileKey;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      selectFile(null);
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-0 overflow-hidden">
        <Toolbar />
        <div className="flex-1 min-h-0">
          <FileExplorer />
        </div>
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
    </SidebarProvider>
  );
}
