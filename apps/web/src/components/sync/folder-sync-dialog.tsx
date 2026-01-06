import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  FolderSync,
  FolderOpen,
  Plus,
  Play,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  History,
  Eye,
  RotateCcw,
} from "lucide-react";
import { sync } from "@/lib/tauri";
import { useBrowserStore } from "@/lib/store";
import type {
  SyncPreview,
  SyncDirection,
  SyncProgressPayload,
  SyncCompletePayload,
  SyncErrorPayload,
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

const SYNC_DIRECTION_OPTIONS: { value: SyncDirection; label: string; description: string; icon: typeof ArrowUp }[] = [
  { value: "upload_only", label: "Upload", description: "Local → Remote", icon: ArrowUp },
  { value: "download_only", label: "Download", description: "Remote → Local", icon: ArrowDown },
];

interface FolderSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewMode = "list" | "create" | "syncing" | "preview" | "history";

export function FolderSyncDialog({ open, onOpenChange }: FolderSyncDialogProps) {
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedBucket, currentPath } = useBrowserStore();
  const currentPrefix = currentPath.length > 0 ? currentPath.join("/") : "";

  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Create form state
  const [newPairName, setNewPairName] = useState("");
  const [newLocalPath, setNewLocalPath] = useState("");
  const [newRemotePrefix, setNewRemotePrefix] = useState(currentPrefix);
  const [newDirection, setNewDirection] = useState<SyncDirection>("upload_only");
  const [newDeletePropagation, setNewDeletePropagation] = useState(false);

  // Sync state
  const [activePairId, setActivePairId] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgressPayload | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Preview state
  const [previewPairId, setPreviewPairId] = useState<number | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // History state
  const [historyPairId, setHistoryPairId] = useState<number | null>(null);

  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pairToDelete, setPairToDelete] = useState<number | null>(null);

  // Track dialog open state for event listener cleanup
  const prevOpenRef = useRef(open);

  // Query sync pairs
  const {
    data: pairs = [],
    isLoading: pairsLoading,
    refetch: refetchPairs,
  } = useQuery({
    queryKey: ["syncPairs", selectedAccountId, selectedBucket],
    queryFn: () => sync.listPairs(selectedAccountId!, selectedBucket!),
    enabled: !!selectedAccountId && !!selectedBucket && open,
  });

  // Query history
  const { data: sessions = [] } = useQuery({
    queryKey: ["syncSessions", historyPairId],
    queryFn: () => sync.getSessions(historyPairId!, 20),
    enabled: !!historyPairId && viewMode === "history",
  });

  // Listen for sync events
  useEffect(() => {
    if (!open) return;

    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      unlisteners.push(
        await listen<SyncProgressPayload>("sync-progress", (event) => {
          setSyncProgress(event.payload);
        }),
      );

      unlisteners.push(
        await listen<SyncCompletePayload>("sync-complete", (event) => {
          setSyncProgress(null);
          setActivePairId(null);
          setActiveSessionId(null);
          setViewMode("list");
          refetchPairs();
          // Invalidate browser file listing to show updated files
          queryClient.invalidateQueries({ queryKey: ["objects"] });
        }),
      );

      unlisteners.push(
        await listen<SyncErrorPayload>("sync-error", (event) => {
          setSyncError(event.payload.error);
          setSyncProgress(null);
          setActivePairId(null);
          setActiveSessionId(null);
          setViewMode("list");
        }),
      );
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [open, refetchPairs]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setViewMode("list");
      setSyncError(null);
      setSyncProgress(null);
      setPreview(null);
      setPreviewPairId(null);
    }
    prevOpenRef.current = open;
  }, [open]);

  // Create pair mutation
  const createPairMutation = useMutation({
    mutationFn: (params: {
      name: string;
      localPath: string;
      remotePrefix: string;
      syncDirection: SyncDirection;
      deletePropagation: boolean;
    }) =>
      sync.createPair(
        params.name,
        params.localPath,
        selectedAccountId!,
        selectedBucket!,
        params.remotePrefix,
        params.syncDirection,
        params.deletePropagation,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["syncPairs"] });
      setViewMode("list");
      resetCreateForm();
    },
  });

  // Delete pair mutation
  const deletePairMutation = useMutation({
    mutationFn: (pairId: number) => sync.deletePair(pairId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["syncPairs"] });
      setDeleteConfirmOpen(false);
      setPairToDelete(null);
    },
  });

  // Start sync mutation
  const startSyncMutation = useMutation({
    mutationFn: (params: { pairId: number; isResync?: boolean }) =>
      sync.start({ pairId: params.pairId, isResync: params.isResync ?? false }),
    onMutate: () => {
      setViewMode("syncing");
      setSyncError(null);
      setSyncProgress(null);
    },
    onSuccess: (sessionId) => {
      setActiveSessionId(sessionId);
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message: unknown }).message)
              : "Failed to start sync";
      setSyncError(errorMessage);
      setActivePairId(null);
      setActiveSessionId(null);
      setViewMode("list");
    },
  });

  // Cancel sync mutation
  const cancelSyncMutation = useMutation({
    mutationFn: (pairId: number) => sync.cancel(pairId),
    onSuccess: () => {
      setSyncProgress(null);
      setActivePairId(null);
      setActiveSessionId(null);
      setViewMode("list");
    },
  });

  const resetCreateForm = () => {
    setNewPairName("");
    setNewLocalPath("");
    setNewRemotePrefix(currentPrefix);
    setNewDirection("upload_only");
    setNewDeletePropagation(false);
  };

  const handleBrowseLocalPath = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select local folder to sync",
    });
    if (selected && typeof selected === "string") {
      setNewLocalPath(selected);
    }
  };

  const handlePreview = async (pairId: number) => {
    setPreviewPairId(pairId);
    setPreviewLoading(true);
    setPreview(null);

    try {
      const result = await sync.preview(pairId);
      setPreview(result);
      setViewMode("preview");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to preview sync");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleStartSync = (pairId: number, isResync = false) => {
    setActivePairId(pairId);
    startSyncMutation.mutate({ pairId, isResync });
  };

  const getDirectionIcon = (direction: SyncDirection) => {
    switch (direction) {
      case "upload_only":
        return <ArrowUp className="h-4 w-4" />;
      case "download_only":
        return <ArrowDown className="h-4 w-4" />;
    }
  };

  const getDirectionLabel = (direction: SyncDirection) => {
    switch (direction) {
      case "upload_only":
        return "Upload";
      case "download_only":
        return "Download";
    }
  };

  // Render pair list
  const renderPairList = () => {
    if (pairsLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (pairs.length === 0) {
      return (
        <div className="flex flex-col items-center py-8 text-center">
          <FolderSync className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No sync pairs configured</p>
          <Button onClick={() => setViewMode("create")}>
            <Plus className="h-4 w-4 mr-2" />
            Create Sync Pair
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{pairs.length} sync pair(s) configured</p>
          <Button size="sm" onClick={() => setViewMode("create")}>
            <Plus className="h-4 w-4 mr-2" />
            New Pair
          </Button>
        </div>

        <div className="space-y-3">
          {pairs.map((pair) => (
            <div
              key={pair.id}
              className="border rounded-lg p-4 space-y-3 bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{pair.name}</h4>
                    <Badge variant="outline" className="flex items-center gap-1">
                      {getDirectionIcon(pair.syncDirection)}
                      {getDirectionLabel(pair.syncDirection)}
                    </Badge>
                    {pair.status === "error" && (
                      <Badge variant="destructive">Error</Badge>
                    )}
                  </div>
                  {pair.syncDirection === "upload_only" ? (
                    <>
                      <p className="text-xs text-muted-foreground truncate">{pair.localPath}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        → {pair.bucket}/{pair.remotePrefix || "(root)"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground truncate">
                        {pair.bucket}/{pair.remotePrefix || "(root)"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        → {pair.localPath}
                      </p>
                    </>
                  )}
                  {pair.lastSyncAt && (
                    <p className="text-xs text-muted-foreground">
                      Last sync: {formatRelativeTime(pair.lastSyncAt)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePreview(pair.id)}
                  disabled={previewLoading}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleStartSync(pair.id)}
                  disabled={pair.status === "syncing"}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Sync
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStartSync(pair.id, true)}
                  disabled={pair.status === "syncing"}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Resync
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHistoryPairId(pair.id);
                    setViewMode("history");
                  }}
                >
                  <History className="h-4 w-4 mr-1" />
                  History
                </Button>
                <div className="flex-1" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => {
                    setPairToDelete(pair.id);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {syncError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <XCircle className="h-4 w-4 flex-shrink-0" />
            <span>{syncError}</span>
          </div>
        )}
      </div>
    );
  };

  // Render create form
  const renderCreateForm = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Create Sync Pair</h3>
        <Button variant="ghost" size="sm" onClick={() => setViewMode("list")}>
          Cancel
        </Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pair-name">Name</Label>
          <Input
            id="pair-name"
            value={newPairName}
            onChange={(e) => setNewPairName(e.target.value)}
            placeholder="My backup sync"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="local-path">Local Folder</Label>
          <div className="flex gap-2">
            <Input
              id="local-path"
              value={newLocalPath}
              onChange={(e) => setNewLocalPath(e.target.value)}
              placeholder="/path/to/folder"
              className="flex-1"
            />
            <Button variant="outline" onClick={handleBrowseLocalPath}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="remote-prefix">Remote Prefix</Label>
          <Input
            id="remote-prefix"
            value={newRemotePrefix}
            onChange={(e) => setNewRemotePrefix(e.target.value)}
            placeholder="folder/path"
          />
          <p className="text-xs text-muted-foreground">
            Files will sync to: {selectedBucket}/{newRemotePrefix || "(root)"}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Sync Direction</Label>
          <Select
            value={newDirection}
            onValueChange={(val) => val && setNewDirection(val as SyncDirection)}
            items={SYNC_DIRECTION_OPTIONS.map((opt) => ({
              value: opt.value,
              label: `${opt.label} (${opt.description})`,
            }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYNC_DIRECTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <opt.icon className="h-4 w-4" />
                    <span>{opt.label}</span>
                    <span className="text-muted-foreground">({opt.description})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="delete-propagation"
            checked={newDeletePropagation}
            onCheckedChange={(checked) => setNewDeletePropagation(checked === true)}
          />
          <Label htmlFor="delete-propagation" className="text-sm cursor-pointer">
            Propagate deletions (delete files that no longer exist in source)
          </Label>
        </div>

        <Button
          className="w-full"
          onClick={() =>
            createPairMutation.mutate({
              name: newPairName,
              localPath: newLocalPath,
              remotePrefix: newRemotePrefix,
              syncDirection: newDirection,
              deletePropagation: newDeletePropagation,
            })
          }
          disabled={!newPairName || !newLocalPath || createPairMutation.isPending}
        >
          {createPairMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Create Pair
        </Button>
      </div>
    </div>
  );

  // Render syncing view
  const renderSyncing = () => (
    <div className="flex flex-col items-center py-8 text-center space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <div className="space-y-2">
        <p className="font-medium">Syncing...</p>
        {syncProgress && (
          <>
            <p className="text-sm text-muted-foreground capitalize">{syncProgress.phase}</p>
            {syncProgress.currentFile && (
              <p className="text-xs text-muted-foreground truncate max-w-xs">
                {syncProgress.currentFile}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {syncProgress.filesProcessed} / {syncProgress.totalFiles} files •{" "}
              {formatBytes(syncProgress.bytesTransferred)}
            </p>
          </>
        )}
      </div>
      <Button
        variant="outline"
        onClick={() => activePairId && cancelSyncMutation.mutate(activePairId)}
        disabled={cancelSyncMutation.isPending}
      >
        Cancel
      </Button>
    </div>
  );

  // Render preview
  const renderPreview = () => {
    if (!preview) return null;

    const hasChanges =
      preview.toUpload.length > 0 ||
      preview.toDownload.length > 0 ||
      preview.toDeleteLocal.length > 0 ||
      preview.toDeleteRemote.length > 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Sync Preview</h3>
          <Button variant="ghost" size="sm" onClick={() => setViewMode("list")}>
            Back to list
          </Button>
        </div>

        {!hasChanges ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-muted-foreground">Everything is in sync!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {preview.toUpload.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <ArrowUp className="h-4 w-4 text-blue-500" />
                  To upload ({preview.toUpload.length})
                </h4>
                <div className="space-y-1">
                  {preview.toUpload.slice(0, 10).map((change) => (
                    <div
                      key={change.relativePath}
                      className="text-sm text-muted-foreground truncate"
                    >
                      {change.relativePath}
                    </div>
                  ))}
                  {preview.toUpload.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      ... and {preview.toUpload.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {preview.toDownload.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <ArrowDown className="h-4 w-4 text-green-500" />
                  To download ({preview.toDownload.length})
                </h4>
                <div className="space-y-1">
                  {preview.toDownload.slice(0, 10).map((change) => (
                    <div
                      key={change.relativePath}
                      className="text-sm text-muted-foreground truncate"
                    >
                      {change.relativePath}
                    </div>
                  ))}
                  {preview.toDownload.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      ... and {preview.toDownload.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {preview.toDeleteLocal.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-red-500" />
                  To delete locally ({preview.toDeleteLocal.length})
                </h4>
                <div className="space-y-1">
                  {preview.toDeleteLocal.slice(0, 10).map((change) => (
                    <div
                      key={change.relativePath}
                      className="text-sm text-muted-foreground truncate"
                    >
                      {change.relativePath}
                    </div>
                  ))}
                  {preview.toDeleteLocal.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      ... and {preview.toDeleteLocal.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {preview.toDeleteRemote.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-orange-500" />
                  To delete from remote ({preview.toDeleteRemote.length})
                </h4>
                <div className="space-y-1">
                  {preview.toDeleteRemote.slice(0, 10).map((change) => (
                    <div
                      key={change.relativePath}
                      className="text-sm text-muted-foreground truncate"
                    >
                      {change.relativePath}
                    </div>
                  ))}
                  {preview.toDeleteRemote.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      ... and {preview.toDeleteRemote.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {hasChanges && previewPairId && (
          <div className="flex gap-2 pt-4 border-t">
            <Button className="flex-1" onClick={() => handleStartSync(previewPairId)}>
              <Play className="h-4 w-4 mr-2" />
              Start Sync
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Render history
  const renderHistory = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Sync History</h3>
        <Button variant="ghost" size="sm" onClick={() => setViewMode("list")}>
          Back to list
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <History className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No sync history yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {new Date(session.startedAt * 1000).toLocaleString()}
                </span>
                <Badge
                  variant={
                    session.status === "completed"
                      ? "default"
                      : session.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {session.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                ↑ {session.filesUploaded} • ↓ {session.filesDownloaded} • 🗑{" "}
                {session.filesDeletedLocal + session.filesDeletedRemote}
              </p>
              {session.bytesTransferred > 0 && (
                <p className="text-xs text-muted-foreground">
                  Transferred: {formatBytes(session.bytesTransferred)}
                </p>
              )}
              {session.errorMessage && (
                <p className="text-xs text-destructive truncate">{session.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (viewMode) {
      case "create":
        return renderCreateForm();
      case "syncing":
        return renderSyncing();
      case "preview":
        return renderPreview();
      case "history":
        return renderHistory();
      default:
        return renderPairList();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderSync className="h-5 w-5" />
              Folder Sync
            </DialogTitle>
            <DialogDescription>
              Sync local folders with S3 buckets.
            </DialogDescription>
          </DialogHeader>

          <DialogPanel>{renderContent()}</DialogPanel>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sync Pair?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the sync configuration. Your files will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pairToDelete && deletePairMutation.mutate(pairToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
