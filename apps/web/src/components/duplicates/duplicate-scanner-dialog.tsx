import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Files,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  Copy,
  FileX2,
  HardDrive,
  Zap,
  Shield,
  ChevronDown,
  ChevronRight,
  History,
  FolderSearch,
  RefreshCcw,
} from "lucide-react";
import { duplicates } from "@/lib/tauri";
import { useBrowserStore } from "@/lib/store";
import type {
  DuplicateScan,
  DuplicateGroup,
  ScanSummary,
  HashType,
  ScanProgressPayload,
  ScanCompletePayload,
  ScanErrorPayload,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

interface DuplicateScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewMode = "start" | "scanning" | "results" | "history";

export function DuplicateScannerDialog({ open, onOpenChange }: DuplicateScannerDialogProps) {
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedBucket, currentPath } = useBrowserStore();
  const currentPrefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";

  const [viewMode, setViewMode] = useState<ViewMode>("start");
  const [hashType, setHashType] = useState<HashType>("etag");
  const [minFileSize, setMinFileSize] = useState<string>("0");
  const [scanPrefix, setScanPrefix] = useState(currentPrefix);

  // Scanning state
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgressPayload | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Results state
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Track previous open state to detect fresh dialog opens
  const prevOpenRef = useRef(false);

  // Reset when dialog opens - check scan status if we have an activeScanId
  // Only run reset logic when dialog OPENS (transitions from closed to open)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) return;

    // Only run initialization logic when dialog first opens
    if (!justOpened) return;

    setScanPrefix(currentPrefix);
    setScanError(null);
    setSelectedFiles(new Set());
    setExpandedGroups(new Set());

    // If we have an active scan, check its actual status
    if (activeScanId) {
      duplicates.getScan(activeScanId).then((scan) => {
        if (!scan || scan.status === "completed") {
          // Scan finished while dialog was closed
          setActiveScanId(null);
          if (scan) {
            setSelectedScanId(scan.id);
            setViewMode("results");
          } else {
            setViewMode("start");
          }
        } else if (scan.status === "failed" || scan.status === "cancelled") {
          // Scan failed/cancelled while dialog was closed
          setActiveScanId(null);
          setViewMode("start");
          if (scan.errorMessage) {
            setScanError(scan.errorMessage);
          }
        } else {
          // Scan is still running
          setViewMode("scanning");
        }
      });
    } else {
      setViewMode("start");
    }
  }, [open, currentPrefix, activeScanId]);

  // Listen to scan events
  useEffect(() => {
    if (!open) return;

    const listeners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Progress
      const unlistenProgress = await listen<ScanProgressPayload>("scan-progress", (event) => {
        if (event.payload.scanId === activeScanId) {
          setScanProgress(event.payload);
        }
      });
      listeners.push(unlistenProgress);

      // Complete
      const unlistenComplete = await listen<ScanCompletePayload>("scan-complete", (event) => {
        if (event.payload.scanId === activeScanId) {
          setActiveScanId(null); // Clear active scan - it's done
          setViewMode("results");
          setSelectedScanId(event.payload.scanId);
          setScanProgress(null);
          // Invalidate all relevant queries to ensure fresh data
          queryClient.invalidateQueries({ queryKey: ["duplicate-scans"] });
          queryClient.invalidateQueries({ queryKey: ["scan-details", event.payload.scanId] });
          queryClient.invalidateQueries({ queryKey: ["duplicate-groups", event.payload.scanId] });
        }
      });
      listeners.push(unlistenComplete);

      // Error
      const unlistenError = await listen<ScanErrorPayload>("scan-error", (event) => {
        if (event.payload.scanId === activeScanId) {
          setActiveScanId(null); // Clear active scan - it failed
          setScanError(event.payload.error);
          setViewMode("start");
          setScanProgress(null);
        }
      });
      listeners.push(unlistenError);
    };

    setupListeners();

    return () => {
      listeners.forEach((unlisten) => unlisten());
    };
  }, [open, activeScanId, queryClient]);

  // Fetch scan history
  const { data: scanHistory } = useQuery({
    queryKey: ["duplicate-scans", selectedAccountId, selectedBucket],
    queryFn: () =>
      duplicates.listScans({
        accountId: selectedAccountId!,
        bucket: selectedBucket || undefined,
        limit: 10,
      }),
    enabled: open && !!selectedAccountId,
  });

  // Fetch scan details when viewing results
  const { data: scanDetails } = useQuery({
    queryKey: ["scan-details", selectedScanId],
    queryFn: () => duplicates.getScan(selectedScanId!),
    enabled: !!selectedScanId,
  });

  // Fetch duplicate groups
  const { data: duplicateGroups, isLoading: groupsLoading } = useQuery({
    queryKey: ["duplicate-groups", selectedScanId],
    queryFn: () => duplicates.getGroups(selectedScanId!),
    enabled: !!selectedScanId && viewMode === "results",
  });

  // Start scan mutation
  const startScanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccountId || !selectedBucket) {
        throw new Error("No bucket selected");
      }
      const scanId = await duplicates.startScan({
        accountId: selectedAccountId,
        bucket: selectedBucket,
        prefix: scanPrefix || undefined,
        hashType,
        minFileSize: parseInt(minFileSize) || undefined,
      });
      return scanId;
    },
    onSuccess: (scanId) => {
      setActiveScanId(scanId);
      setSelectedScanId(scanId);
      setViewMode("scanning");
      setScanError(null);
    },
    onError: (error) => {
      setScanError(error instanceof Error ? error.message : "Failed to start scan");
    },
  });

  // Cancel scan mutation
  const cancelScanMutation = useMutation({
    mutationFn: async () => {
      if (activeScanId) {
        await duplicates.cancelScan(activeScanId);
      }
    },
    onSuccess: () => {
      setActiveScanId(null);
      setScanProgress(null);
      setViewMode("start");
      queryClient.invalidateQueries({ queryKey: ["duplicate-scans"] });
    },
  });

  // Delete duplicates mutation
  const deleteDuplicatesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccountId || !selectedBucket || !selectedScanId) {
        throw new Error("Missing required parameters");
      }
      const keysToDelete = Array.from(selectedFiles);
      return duplicates.deleteDuplicates({
        accountId: selectedAccountId,
        bucket: selectedBucket,
        scanId: selectedScanId,
        keysToDelete,
      });
    },
    onSuccess: (result) => {
      setSelectedFiles(new Set());
      queryClient.invalidateQueries({ queryKey: ["duplicate-groups", selectedScanId] });
      queryClient.invalidateQueries({ queryKey: ["scan-details", selectedScanId] });
      queryClient.invalidateQueries({ queryKey: ["objects"] }); // Refresh file list
    },
  });

  const handleStartScan = () => {
    startScanMutation.mutate();
  };

  const handleCancelScan = () => {
    cancelScanMutation.mutate();
  };

  const handleViewResults = (scanId: number) => {
    setSelectedScanId(scanId);
    setViewMode("results");
    setSelectedFiles(new Set());
    setExpandedGroups(new Set());
    // Invalidate to ensure fresh data is fetched
    queryClient.invalidateQueries({ queryKey: ["scan-details", scanId] });
    queryClient.invalidateQueries({ queryKey: ["duplicate-groups", scanId] });
  };

  const toggleFileSelection = (key: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllInGroup = (group: DuplicateGroup, keepFirst: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      // Add all files except optionally the first one
      group.files.forEach((file, index) => {
        if (keepFirst && index === 0) return;
        next.add(file.key);
      });
      return next;
    });
  };

  const deselectAllInGroup = (group: DuplicateGroup) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      group.files.forEach((file) => {
        next.delete(file.key);
      });
      return next;
    });
  };

  const toggleGroupExpanded = (groupId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const selectAllDuplicates = () => {
    if (!duplicateGroups) return;
    setSelectedFiles(() => {
      const next = new Set<string>();
      // For each group, select all files except the first (original)
      duplicateGroups.forEach((group) => {
        group.files.forEach((file, index) => {
          if (index > 0) {
            next.add(file.key);
          }
        });
      });
      return next;
    });
  };

  const handleDeleteSelected = () => {
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    setDeleteConfirmOpen(false);
    deleteDuplicatesMutation.mutate();
  };

  const renderStartView = () => (
    <div className="space-y-6 p-6">
      {/* Mode selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Scan Mode</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            className={cn(
              "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
              hashType === "etag" && "border-primary bg-primary/5",
            )}
            onClick={() => setHashType("etag")}
          >
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              <span className="font-medium">Fast Mode</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses file size + ETag for quick detection. May have false positives with multipart
              uploads.
            </p>
          </button>
          <button
            className={cn(
              "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
              hashType === "sha256" && "border-primary bg-primary/5",
            )}
            onClick={() => setHashType("sha256")}
          >
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              <span className="font-medium">Accurate Mode</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Downloads files to compute SHA-256 hash. 100% accurate but slower.
            </p>
          </button>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Options</h3>
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-32">Scan prefix:</label>
            <Input
              placeholder="folder/"
              value={scanPrefix}
              onChange={(e) => setScanPrefix(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-32">Min file size:</label>
            <Select value={minFileSize} onValueChange={(val) => val && setMinFileSize(val)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">All files</SelectItem>
                <SelectItem value="1024">≥ 1 KB</SelectItem>
                <SelectItem value="10240">≥ 10 KB</SelectItem>
                <SelectItem value="102400">≥ 100 KB</SelectItem>
                <SelectItem value="1048576">≥ 1 MB</SelectItem>
                <SelectItem value="10485760">≥ 10 MB</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Error message */}
      {scanError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {scanError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode("history")}
          disabled={!scanHistory?.length}
        >
          <History className="mr-2 h-4 w-4" />
          View History ({scanHistory?.length || 0})
        </Button>
        <Button
          onClick={handleStartScan}
          disabled={!selectedAccountId || !selectedBucket || startScanMutation.isPending}
        >
          {startScanMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Start Scan
        </Button>
      </div>
    </div>
  );

  const renderScanningView = () => {
    const progress = scanProgress;
    const progressPercent = progress?.totalFiles
      ? Math.round((progress.filesScanned / progress.totalFiles) * 100)
      : 0;

    return (
      <div className="flex flex-col items-center justify-center space-y-6 p-8">
        <div className="relative">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <FolderSearch className="absolute inset-0 m-auto h-8 w-8 text-primary/60" />
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Scanning for Duplicates</h3>
          <p className="text-sm text-muted-foreground">
            {progress?.phase === "listing"
              ? "Listing files..."
              : progress?.phase === "hashing"
                ? "Computing hashes..."
                : "Initializing..."}
          </p>
        </div>

        <div className="w-full max-w-md space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress?.filesScanned.toLocaleString() || 0} /{" "}
              {progress?.totalFiles.toLocaleString() || "?"} files
            </span>
            <span>{formatBytes(progress?.bytesProcessed || 0)}</span>
          </div>
          {progress?.currentFile && (
            <p className="truncate text-xs text-muted-foreground font-mono">
              {progress.currentFile}
            </p>
          )}
        </div>

        <Button variant="outline" onClick={handleCancelScan}>
          Cancel Scan
        </Button>
      </div>
    );
  };

  const renderResultsView = () => {
    if (groupsLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!duplicateGroups?.length) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500/30" />
          <p className="mt-4 text-sm font-medium">No duplicates found!</p>
          <p className="text-xs text-muted-foreground">
            {scanDetails?.totalFiles.toLocaleString()} files scanned
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setViewMode("start")}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            New Scan
          </Button>
        </div>
      );
    }

    return (
      <>
        {/* Results header */}
        <div className="grid grid-cols-4 gap-3 border-b p-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-2xl font-bold">
              {scanDetails?.duplicateGroups.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">Duplicate Groups</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-2xl font-bold">{scanDetails?.duplicateFiles.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Duplicate Files</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-2xl font-bold text-yellow-500">
              {formatBytes(scanDetails?.reclaimableBytes || 0)}
            </div>
            <div className="text-xs text-muted-foreground">Reclaimable</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-2xl font-bold text-primary">{selectedFiles.size}</div>
            <div className="text-xs text-muted-foreground">Selected</div>
          </div>
        </div>

        {/* Virtualized duplicate groups */}
        <VirtualizedDuplicateGroups
          groups={duplicateGroups}
          expandedGroups={expandedGroups}
          selectedFiles={selectedFiles}
          onToggleExpand={toggleGroupExpanded}
          onToggleFile={toggleFileSelection}
          onSelectAll={selectAllInGroup}
          onDeselectAll={deselectAllInGroup}
        />

        {/* Actions footer */}
        <div className="flex items-center justify-between border-t bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setViewMode("start")}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              New Scan
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedFiles.size} files selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllDuplicates}
              disabled={deleteDuplicatesMutation.isPending}
            >
              Select All Duplicates
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedFiles.size === 0 || deleteDuplicatesMutation.isPending}
              onClick={handleDeleteSelected}
            >
              {deleteDuplicatesMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Selected
            </Button>
          </div>
        </div>
      </>
    );
  };

  const renderHistoryView = () => (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">Scan History</h3>
        <Button variant="ghost" size="sm" onClick={() => setViewMode("start")}>
          Back
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {scanHistory?.map((scan) => (
            <div
              key={scan.id}
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ScanStatusBadge status={scan.status} />
                  <span className="text-sm font-mono">{scan.prefix || scan.bucket}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{scan.totalFiles.toLocaleString()} files</span>
                  <span>{scan.duplicateGroups} duplicates</span>
                  <span>{formatBytes(scan.reclaimableBytes)} reclaimable</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(scan.startedAt)}
                </span>
                {scan.status === "completed" && scan.duplicateGroups > 0 && (
                  <Button variant="outline" size="sm" onClick={() => handleViewResults(scan.id)}>
                    View Results
                  </Button>
                )}
              </div>
            </div>
          ))}

          {!scanHistory?.length && (
            <div className="py-8 text-center text-sm text-muted-foreground">No previous scans</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl">
          {/* Header */}
          <DialogHeader className="border-b bg-gradient-to-b from-primary/10 to-transparent px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                <Files className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">Duplicate Scanner</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {viewMode === "start" &&
                    (selectedBucket
                      ? `Scan ${selectedBucket} for duplicates`
                      : "Select a bucket first")}
                  {viewMode === "scanning" && `Scanning ${selectedBucket}`}
                  {viewMode === "results" && `Results for ${selectedBucket}`}
                  {viewMode === "history" && `Scan history for ${selectedBucket || "all buckets"}`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col">
            {viewMode === "start" && renderStartView()}
            {viewMode === "scanning" && renderScanningView()}
            {viewMode === "results" && renderResultsView()}
            {viewMode === "history" && renderHistoryView()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.size} files?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected duplicate files from your bucket. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete Files
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  const config = {
    running: { icon: Loader2, color: "text-primary", bg: "bg-primary/10", animate: true },
    completed: {
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-500/10",
      animate: false,
    },
    failed: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", animate: false },
    cancelled: { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted", animate: false },
  }[status] || { icon: Files, color: "text-muted-foreground", bg: "bg-muted", animate: false };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        config.bg,
        config.color,
      )}
    >
      <Icon className={cn("h-3 w-3", config.animate && "animate-spin")} />
      {status}
    </span>
  );
}

// Virtualized list component for duplicate groups
interface VirtualizedDuplicateGroupsProps {
  groups: DuplicateGroup[];
  expandedGroups: Set<number>;
  selectedFiles: Set<string>;
  onToggleExpand: (groupId: number) => void;
  onToggleFile: (key: string) => void;
  onSelectAll: (group: DuplicateGroup, keepFirst: boolean) => void;
  onDeselectAll: (group: DuplicateGroup) => void;
}

const GROUP_HEADER_HEIGHT = 52; // Height of collapsed group header
const FILE_ROW_HEIGHT = 36; // Height of each file row
const EXPANDED_HEADER_HEIGHT = 40; // Height of "Select all" buttons row

function VirtualizedDuplicateGroups({
  groups,
  expandedGroups,
  selectedFiles,
  onToggleExpand,
  onToggleFile,
  onSelectAll,
  onDeselectAll,
}: VirtualizedDuplicateGroupsProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate estimated size for each group based on expansion state
  const getItemSize = (index: number) => {
    const group = groups[index];
    if (!group) return GROUP_HEADER_HEIGHT;

    if (expandedGroups.has(group.id)) {
      // Expanded: header + action buttons + all file rows
      return GROUP_HEADER_HEIGHT + EXPANDED_HEADER_HEIGHT + group.files.length * FILE_ROW_HEIGHT;
    }
    return GROUP_HEADER_HEIGHT;
  };

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getItemSize,
    overscan: 5,
  });

  // Re-measure when expansion state changes
  useEffect(() => {
    virtualizer.measure();
  }, [expandedGroups, virtualizer]);

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const group = groups[virtualItem.index];
          return (
            <div
              key={group.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <DuplicateGroupRow
                group={group}
                expanded={expandedGroups.has(group.id)}
                selectedFiles={selectedFiles}
                onToggleExpand={() => onToggleExpand(group.id)}
                onToggleFile={onToggleFile}
                onSelectAll={(keepFirst) => onSelectAll(group, keepFirst)}
                onDeselectAll={() => onDeselectAll(group)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DuplicateGroupRowProps {
  group: DuplicateGroup;
  expanded: boolean;
  selectedFiles: Set<string>;
  onToggleExpand: () => void;
  onToggleFile: (key: string) => void;
  onSelectAll: (keepFirst: boolean) => void;
  onDeselectAll: () => void;
}

function DuplicateGroupRow({
  group,
  expanded,
  selectedFiles,
  onToggleExpand,
  onToggleFile,
  onSelectAll,
  onDeselectAll,
}: DuplicateGroupRowProps) {
  const selectedInGroup = group.files.filter((f) => selectedFiles.has(f.key)).length;
  const allSelected = selectedInGroup === group.files.length;
  const someSelected = selectedInGroup > 0 && selectedInGroup < group.files.length;

  return (
    <div className="border-b last:border-b-0">
      {/* Group header */}
      <div
        className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/30"
        onClick={onToggleExpand}
      >
        <button className="shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{group.fileCount} copies</span>
          <span className="text-sm text-muted-foreground">
            ({formatBytes(group.fileSize)} each)
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            {group.contentHash.substring(0, 12)}...
          </span>
          <span className="text-sm font-medium text-yellow-500">
            {formatBytes(group.fileSize * (group.fileCount - 1))} reclaimable
          </span>
        </div>
      </div>

      {/* Expanded files */}
      {expanded && (
        <div className="border-t bg-muted/20 px-8 py-2">
          {/* Quick actions */}
          <div className="mb-2 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAll(true);
              }}
            >
              Select all except first
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDeselectAll();
              }}
            >
              Deselect all
            </Button>
          </div>

          <div className="space-y-1">
            {group.files.map((file, index) => (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-3 rounded px-2 py-1.5",
                  selectedFiles.has(file.key) && "bg-destructive/10",
                )}
              >
                <Checkbox
                  checked={selectedFiles.has(file.key)}
                  onCheckedChange={() => onToggleFile(file.key)}
                />
                <span className="flex-1 truncate font-mono text-sm">{file.key}</span>
                {index === 0 && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    Original
                  </span>
                )}
                {file.storageClass && (
                  <span className="text-xs text-muted-foreground">{file.storageClass}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
