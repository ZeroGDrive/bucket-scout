import { useState } from "react";
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useUploadStore,
  useUploadQueue,
  useUploadCounts,
  useTotalProgress,
} from "@/lib/upload-store";
import { cn } from "@/lib/utils";
import type { UploadItem, UploadStatus } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function StatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case "pending":
      return <div className="h-3 w-3 rounded-full bg-muted-foreground/40" />;
    case "uploading":
      return <Loader2 className="h-3 w-3 text-primary animate-spin" />;
    case "completed":
      return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    case "failed":
    case "cancelled":
      return <XCircle className="h-3 w-3 text-destructive" />;
    default:
      return null;
  }
}

function UploadItemRow({ item }: { item: UploadItem }) {
  const { removeUpload, retryUpload } = useUploadStore();

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 text-xs group">
      <StatusIcon status={item.status} />
      <span className="flex-1 truncate">{item.file.name}</span>
      <span className="text-muted-foreground tabular-nums">
        {item.status === "uploading" ? `${item.progress}%` : formatBytes(item.totalBytes)}
      </span>
      {(item.status === "failed" || item.status === "cancelled") && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100"
          onClick={() => retryUpload(item.id)}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
      {item.status === "completed" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100"
          onClick={() => removeUpload(item.id)}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export function UploadToast() {
  const [isExpanded, setIsExpanded] = useState(false);
  const queue = useUploadQueue();
  const counts = useUploadCounts();
  const totalProgress = useTotalProgress();
  const { clearCompleted, clearAll } = useUploadStore();

  // Don't render if no uploads
  if (counts.total === 0) return null;

  const hasActive = counts.active > 0 || counts.pending > 0;
  const allComplete = counts.total > 0 && counts.completed === counts.total;
  const hasFailed = counts.failed > 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <div className="bg-popover border rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors",
            hasActive && "border-b"
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {hasActive ? (
            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
          ) : allComplete ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : hasFailed ? (
            <XCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : null}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {hasActive
                ? `Uploading ${counts.active + counts.pending} file${counts.active + counts.pending > 1 ? "s" : ""}...`
                : allComplete
                  ? `${counts.completed} file${counts.completed > 1 ? "s" : ""} uploaded`
                  : hasFailed
                    ? `${counts.failed} upload${counts.failed > 1 ? "s" : ""} failed`
                    : "Uploads"}
            </p>
            {hasActive && (
              <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${totalProgress}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!hasActive && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <>
            <ScrollArea className="max-h-48">
              <div className="divide-y">
                {queue.map((item) => (
                  <UploadItemRow key={item.id} item={item} />
                ))}
              </div>
            </ScrollArea>

            {counts.completed > 0 && (
              <div className="border-t px-2 py-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={clearCompleted}
                >
                  Clear completed
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
