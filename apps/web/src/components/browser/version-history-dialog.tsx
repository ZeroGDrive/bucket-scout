import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw, Loader2, Trash2, Clock, AlertTriangle, ChevronDown } from "lucide-react";
import { useObjectVersions, useRestoreVersion } from "@/lib/queries";
import { toast } from "sonner";
import { cn, parseS3Error } from "@/lib/utils";
import type { ObjectVersionInfo } from "@/lib/types";

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  bucket: string;
  objectKey: string;
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateString?: string): string {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  accountId,
  bucket,
  objectKey,
}: VersionHistoryDialogProps) {
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useObjectVersions(open ? accountId : null, open ? bucket : null, open ? objectKey : null);

  const restoreMutation = useRestoreVersion();

  const versions = data?.pages.flatMap((page) => page.versions) ?? [];
  const versioningEnabled = data?.pages[0]?.versioningEnabled ?? false;

  const fileName = objectKey.split("/").pop() || objectKey;

  const handleRestore = async (version: ObjectVersionInfo) => {
    if (version.isDeleteMarker) {
      toast.error("Cannot restore a delete marker");
      return;
    }

    setRestoringVersionId(version.versionId);
    try {
      await restoreMutation.mutateAsync({
        accountId,
        bucket,
        key: objectKey,
        versionId: version.versionId,
      });
      toast.success("Version restored successfully", {
        description: `Restored version from ${formatDate(version.lastModified)}`,
      });
    } catch (err) {
      toast.error("Failed to restore version", {
        description: parseS3Error(err),
      });
    } finally {
      setRestoringVersionId(null);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setRestoringVersionId(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Version History</AlertDialogTitle>
          <AlertDialogDescription>
            <code className="rounded bg-muted px-1 py-0.5 text-sm">{fileName}</code>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mb-2 text-destructive/70" />
              <p className="text-sm">Failed to load versions</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{parseS3Error(error)}</p>
            </div>
          ) : !versioningEnabled && versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 text-muted-foreground/50" />
              <p className="text-sm font-medium">Versioning not enabled</p>
              <p className="text-xs text-center max-w-[300px] mt-1">
                This bucket does not have versioning enabled. Enable versioning in your S3/R2
                settings to track object versions.
              </p>
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 text-muted-foreground/50" />
              <p className="text-sm">No versions found</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {versions.map((version, index) => (
                  <VersionRow
                    key={`${version.versionId}-${index}`}
                    version={version}
                    isRestoring={restoringVersionId === version.versionId}
                    onRestore={() => handleRestore(version)}
                  />
                ))}

                {hasNextPage && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading more...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="mr-2 h-4 w-4" />
                        Load more versions
                      </>
                    )}
                  </Button>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function VersionRow({
  version,
  isRestoring,
  onRestore,
}: {
  version: ObjectVersionInfo;
  isRestoring: boolean;
  onRestore: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border",
        version.isDeleteMarker
          ? "bg-destructive/5 border-destructive/20"
          : version.isLatest
            ? "bg-primary/5 border-primary/20"
            : "bg-muted/30",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {version.isLatest && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
              Current
            </Badge>
          )}
          {version.isDeleteMarker && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
              <Trash2 className="h-3 w-3 mr-1" />
              Deleted
            </Badge>
          )}
          <code className="text-[10px] font-mono text-muted-foreground truncate">
            {version.versionId.length > 20
              ? `${version.versionId.slice(0, 20)}...`
              : version.versionId}
          </code>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(version.lastModified)}
          </span>
          {!version.isDeleteMarker && version.size !== undefined && (
            <span>{formatFileSize(version.size)}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 ml-2">
        {!version.isDeleteMarker && !version.isLatest && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRestore}
            disabled={isRestoring}
            title="Restore this version"
          >
            {isRestoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
