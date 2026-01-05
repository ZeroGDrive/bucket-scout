import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3 } from "lucide-react";
import { AnalyticsTab } from "./analytics-tab";

interface BucketAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  bucket: string;
}

export function BucketAnalyticsDialog({
  open,
  onOpenChange,
  accountId,
  bucket,
}: BucketAnalyticsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-4xl flex flex-col p-0 gap-0 overflow-hidden"
      >
        {/* Header with gradient accent */}
        <div className="relative border-b bg-gradient-to-b from-accent/30 to-transparent">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="h-4.5 w-4.5" />
              </div>
              Storage Analytics
            </DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md border">
                {bucket}
              </span>
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1 min-h-0 max-h-[70vh]">
          <div className="p-6">
            <AnalyticsTab accountId={accountId} bucket={bucket} />
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="border-t px-6 py-4 bg-muted/20">
          <DialogClose render={<Button variant="outline" className="min-w-[100px]" />}>
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
