import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Upload,
  Download,
  Trash2,
  Copy,
  Move,
  Pencil,
  FolderPlus,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  X,
  Search,
  ChevronDown,
  FileDown,
  History,
  BarChart3,
} from "lucide-react";
import { history } from "@/lib/tauri";
import { useBrowserStore } from "@/lib/store";
import type {
  Operation,
  OperationType,
  OperationStatus,
  OperationFilter,
  OperationStats,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Custom time formatting to avoid date-fns dependency
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface OperationsHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OPERATION_ICONS: Record<OperationType, React.ElementType> = {
  upload: Upload,
  download: Download,
  delete: Trash2,
  copy: Copy,
  move: Move,
  rename: Pencil,
  create_folder: FolderPlus,
};

const OPERATION_COLORS: Record<OperationType, string> = {
  upload: "bg-blue-500/10 text-blue-500",
  download: "bg-green-500/10 text-green-500",
  delete: "bg-red-500/10 text-red-500",
  copy: "bg-purple-500/10 text-purple-500",
  move: "bg-orange-500/10 text-orange-500",
  rename: "bg-yellow-500/10 text-yellow-500",
  create_folder: "bg-cyan-500/10 text-cyan-500",
};

const STATUS_ICONS: Record<OperationStatus, React.ElementType> = {
  pending: Clock,
  in_progress: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: X,
};

const STATUS_COLORS: Record<OperationStatus, string> = {
  pending: "text-muted-foreground",
  in_progress: "text-primary animate-spin",
  completed: "text-green-500",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function getFileName(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] || parts[parts.length - 2] || key;
}

export function OperationsHistoryDialog({
  open,
  onOpenChange,
}: OperationsHistoryDialogProps) {
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedBucket } = useBrowserStore();

  const [filter, setFilter] = useState<OperationFilter>({
    accountId: selectedAccountId || undefined,
    bucket: selectedBucket || undefined,
    limit: 50,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [operationTypeFilter, setOperationTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("7");

  // Build filter based on UI state
  useEffect(() => {
    const newFilter: OperationFilter = {
      accountId: selectedAccountId || undefined,
      bucket: selectedBucket || undefined,
      limit: 50,
    };

    if (operationTypeFilter !== "all") {
      newFilter.operation = operationTypeFilter as OperationType;
    }

    if (statusFilter !== "all") {
      newFilter.status = statusFilter as OperationStatus;
    }

    if (timeRange !== "all") {
      const days = parseInt(timeRange);
      newFilter.fromTimestamp = Math.floor(Date.now() / 1000) - days * 86400;
    }

    if (searchQuery) {
      newFilter.search = searchQuery;
    }

    setFilter(newFilter);
  }, [
    selectedAccountId,
    selectedBucket,
    operationTypeFilter,
    statusFilter,
    timeRange,
    searchQuery,
  ]);

  // Fetch operations
  const { data: operationsData, isLoading } = useQuery({
    queryKey: ["operations", filter],
    queryFn: () => history.getOperations(filter),
    enabled: open,
    refetchInterval: 5000, // Refresh every 5 seconds when open
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["operation-stats", selectedAccountId, selectedBucket, timeRange],
    queryFn: () =>
      history.getStats({
        accountId: selectedAccountId || undefined,
        bucket: selectedBucket || undefined,
        days: timeRange === "all" ? 30 : parseInt(timeRange),
      }),
    enabled: open,
  });

  const handleExport = useCallback(
    async (format: "csv" | "json") => {
      try {
        const data = await history.export({ filter, format });
        const blob = new Blob([data], {
          type: format === "csv" ? "text/csv" : "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `operations.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Failed to export:", error);
      }
    },
    [filter]
  );

  const handleCleanup = useCallback(async () => {
    try {
      const deleted = await history.cleanup(30);
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation-stats"] });
      console.log(`Cleaned up ${deleted} old operations`);
    } catch (error) {
      console.error("Failed to cleanup:", error);
    }
  }, [queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-4xl">
        {/* Header */}
        <DialogHeader className="border-b bg-gradient-to-b from-primary/10 to-transparent px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  Operations History
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  View and export your S3 operation history
                </DialogDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    <FileDown className="mr-2 h-4 w-4" />
                    Export
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 border-b p-4">
            <div className="rounded-lg border bg-card p-3">
              <div className="text-2xl font-bold">{stats.totalOperations.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Operations</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-2xl font-bold">{formatBytes(stats.totalBytes)}</div>
              <div className="text-xs text-muted-foreground">Transferred</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-2xl font-bold text-destructive">
                {stats.failed}
              </div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-2xl font-bold text-green-500">
                {stats.totalOperations > 0
                  ? ((stats.completed / stats.totalOperations) * 100).toFixed(1)
                  : 0}
                %
              </div>
              <div className="text-xs text-muted-foreground">Success Rate</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 border-b bg-muted/30 p-3">
          <Select value={operationTypeFilter} onValueChange={(val) => val && setOperationTypeFilter(val)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="upload">Upload</SelectItem>
              <SelectItem value="download">Download</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="copy">Copy</SelectItem>
              <SelectItem value="move">Move</SelectItem>
              <SelectItem value="rename">Rename</SelectItem>
              <SelectItem value="create_folder">Create Folder</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(val) => val && setStatusFilter(val)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={timeRange} onValueChange={(val) => val && setTimeRange(val)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Operations List */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : operationsData?.operations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No operations found
                </p>
                <p className="text-xs text-muted-foreground">
                  Operations will appear here as you use BucketScout
                </p>
              </div>
            ) : (
              operationsData?.operations.map((op) => (
                <OperationRow key={op.id} operation={op} />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">
            Showing {operationsData?.operations.length || 0} of{" "}
            {operationsData?.total || 0} operations
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCleanup}>
              Clear History
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OperationRow({ operation }: { operation: Operation }) {
  const Icon = OPERATION_ICONS[operation.operation];
  const StatusIcon = STATUS_ICONS[operation.status];
  const iconColor = OPERATION_COLORS[operation.operation];
  const statusColor = STATUS_COLORS[operation.status];

  const fileName = operation.sourceKey ? getFileName(operation.sourceKey) : "Unknown";
  const folderPath = operation.sourceKey
    ? operation.sourceKey.substring(0, operation.sourceKey.lastIndexOf("/") + 1)
    : "";

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 p-3 hover:bg-muted/30",
        operation.status === "failed" && "bg-destructive/5"
      )}
    >
      {/* Status dot */}
      <StatusIcon className={cn("h-4 w-4", statusColor)} />

      {/* File info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
              iconColor
            )}
          >
            <Icon className="h-3 w-3" />
            {operation.operation.replace("_", " ")}
          </span>
          <span className="truncate font-mono text-sm">{fileName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-mono">{folderPath || "/"}</span>
          {operation.destKey && (
            <>
              <span>→</span>
              <span className="truncate font-mono">{operation.destKey}</span>
            </>
          )}
        </div>
        {operation.status === "failed" && operation.errorMessage && (
          <div className="mt-1 text-xs text-destructive">
            {operation.errorMessage}
          </div>
        )}
      </div>

      {/* Size */}
      <div className="text-right text-sm text-muted-foreground">
        {operation.size ? formatBytes(operation.size) : "-"}
      </div>

      {/* Duration */}
      <div className="text-right text-sm text-muted-foreground">
        {operation.durationMs ? formatDuration(operation.durationMs) : "-"}
      </div>

      {/* Time ago */}
      <div className="text-right text-xs text-muted-foreground">
        {formatRelativeTime(operation.timestamp * 1000)}
      </div>
    </div>
  );
}
