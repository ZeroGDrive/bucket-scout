import { useState } from "react";
import {
  Cloud,
  Database,
  FolderOpen,
  Plus,
  MoreVertical,
  Trash2,
  RefreshCw,
  Loader2,
  Settings2,
  BarChart3,
  History,
  Files,
  FolderSync,
  Heart,
  Github,
} from "lucide-react";
import { Logo } from "@/components/icons/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useBrowserStore } from "@/lib/store";
import {
  useAccounts,
  useBuckets,
  useRemoveAccount,
  useTestConnection,
  useDeleteBucket,
} from "@/lib/queries";
import { AddAccountDialog } from "@/components/accounts/add-account-dialog";
import { CreateBucketDialog } from "@/components/browser/create-bucket-dialog";
import { BucketConfigDialog } from "@/components/browser/bucket-config-dialog";
import { BucketAnalyticsDialog } from "@/components/browser/bucket-analytics-dialog";
import { OperationsHistoryDialog } from "@/components/history";
import { DuplicateScannerDialog } from "@/components/duplicates";
import { FolderSyncDialog } from "@/components/sync";
import { SupportMeDialog } from "@/components/support";
import { toast } from "sonner";
import { parseS3Error } from "@/lib/utils";
import { openUrl } from "@/lib/open-url";

export function AppSidebar() {
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [configBucketDialog, setConfigBucketDialog] = useState<{
    open: boolean;
    bucketName: string;
  }>({
    open: false,
    bucketName: "",
  });
  const [deleteBucketDialog, setDeleteBucketDialog] = useState<{
    open: boolean;
    bucketName: string;
  }>({
    open: false,
    bucketName: "",
  });
  const [analyticsBucketDialog, setAnalyticsBucketDialog] = useState<{
    open: boolean;
    bucketName: string;
  }>({
    open: false,
    bucketName: "",
  });
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [duplicateScannerOpen, setDuplicateScannerOpen] = useState(false);
  const [folderSyncOpen, setFolderSyncOpen] = useState(false);
  const [supportMeOpen, setSupportMeOpen] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);

  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const setAccount = useBrowserStore((s) => s.setAccount);
  const setBucket = useBrowserStore((s) => s.setBucket);

  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: buckets, isLoading: bucketsLoading } = useBuckets(selectedAccountId);
  const removeAccount = useRemoveAccount();
  const testConnection = useTestConnection();
  const deleteBucket = useDeleteBucket();

  const handleTestConnection = async (id: string) => {
    try {
      const result = await testConnection.mutateAsync(id);
      if (result) {
        toast.success("Connection successful");
      }
    } catch (error) {
      toast.error("Connection failed", {
        description: parseS3Error(error),
      });
    }
  };

  const handleRemoveAccount = async (id: string) => {
    try {
      await removeAccount.mutateAsync(id);
      if (selectedAccountId === id) {
        setAccount(null);
      }
      toast.success("Account removed");
    } catch (error) {
      toast.error("Failed to remove account", {
        description: parseS3Error(error),
      });
    }
  };

  const handleDeleteBucket = async () => {
    if (!selectedAccountId || !deleteBucketDialog.bucketName) return;

    const bucketName = deleteBucketDialog.bucketName;
    const toastId = toast.loading(`Deleting bucket "${bucketName}"...`, {
      description: forceDelete ? "Removing all objects first..." : undefined,
    });

    try {
      await deleteBucket.mutateAsync({
        accountId: selectedAccountId,
        bucketName,
        force: forceDelete,
      });
      if (selectedBucket === bucketName) {
        setBucket(null);
      }
      toast.success(`Bucket "${bucketName}" deleted`, { id: toastId });
      setDeleteBucketDialog({ open: false, bucketName: "" });
      setForceDelete(false);
    } catch (error) {
      toast.error("Failed to delete bucket", {
        id: toastId,
        description: parseS3Error(error),
      });
    }
  };

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Logo className="h-5 w-5" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold tracking-tight">BucketScout</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                S3 Browser
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* Accounts Section */}
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between pr-2">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Cloud className="h-3.5 w-3.5" />
                Accounts
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={() => setAddAccountOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {accountsLoading ? (
                  <>
                    <SidebarMenuItem>
                      <Skeleton className="h-8 w-full" />
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Skeleton className="h-8 w-full" />
                    </SidebarMenuItem>
                  </>
                ) : accounts && accounts.length > 0 ? (
                  accounts.map((account) => (
                    <SidebarMenuItem key={account.id}>
                      <SidebarMenuButton
                        isActive={selectedAccountId === account.id}
                        onClick={() => setAccount(account.id)}
                        tooltip={account.name}
                      >
                        <Database className="h-4 w-4 shrink-0" />
                        <span className="truncate flex-1">{account.name}</span>
                        <span
                          className={`text-[9px] font-medium px-1.5 py-0.5 rounded group-data-[collapsible=icon]:hidden ${
                            account.providerType === "cloudflare_r2"
                              ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {account.providerType === "cloudflare_r2" ? "R2" : "S3"}
                        </span>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-sm p-0 text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 outline-hidden transition-transform opacity-0 group-hover/menu-item:opacity-100 data-[open]:opacity-100 group-data-[collapsible=icon]:hidden">
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="right">
                          <DropdownMenuItem onClick={() => handleTestConnection(account.id)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Test Connection
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRemoveAccount(account.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))
                ) : (
                  <>
                    {/* Expanded state: show full empty message */}
                    <div className="px-2 py-6 text-center group-data-[collapsible=icon]:hidden">
                      <p className="text-xs text-muted-foreground mb-2">No accounts configured</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAddAccountOpen(true)}
                      >
                        <Plus className="h-3 w-3 mr-1.5" />
                        Add Account
                      </Button>
                    </div>
                    {/* Collapsed state: show add button as icon */}
                    <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
                      <SidebarMenuButton
                        onClick={() => setAddAccountOpen(true)}
                        tooltip="Add Account"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>Add Account</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Buckets Section */}
          {selectedAccountId && (
            <>
              <SidebarSeparator className="my-2" />
              <SidebarGroup>
                <SidebarGroupLabel className="flex items-center justify-between pr-2">
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Buckets
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    onClick={() => setCreateBucketOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {bucketsLoading ? (
                      <>
                        <SidebarMenuItem>
                          <Skeleton className="h-8 w-full" />
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Skeleton className="h-8 w-full" />
                        </SidebarMenuItem>
                      </>
                    ) : buckets && buckets.length > 0 ? (
                      buckets.map((bucket) => (
                        <SidebarMenuItem key={bucket.name}>
                          <ContextMenu>
                            <ContextMenuTrigger className="w-full">
                              <SidebarMenuButton
                                isActive={selectedBucket === bucket.name}
                                onClick={() => setBucket(bucket.name)}
                                tooltip={bucket.name}
                              >
                                <FolderOpen className="h-4 w-4 shrink-0" />
                                <span className="truncate">{bucket.name}</span>
                              </SidebarMenuButton>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onClick={() =>
                                  setConfigBucketDialog({ open: true, bucketName: bucket.name })
                                }
                              >
                                <Settings2 className="h-4 w-4 mr-2" />
                                Configure
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() =>
                                  setAnalyticsBucketDialog({ open: true, bucketName: bucket.name })
                                }
                              >
                                <BarChart3 className="h-4 w-4 mr-2" />
                                Analytics
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() =>
                                  setDeleteBucketDialog({ open: true, bucketName: bucket.name })
                                }
                                variant="destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Bucket
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-sm p-0 text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 outline-hidden transition-transform opacity-0 group-hover/menu-item:opacity-100 data-[open]:opacity-100 group-data-[collapsible=icon]:hidden">
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="right">
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfigBucketDialog({ open: true, bucketName: bucket.name })
                                }
                              >
                                <Settings2 className="h-4 w-4 mr-2" />
                                Configure
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setAnalyticsBucketDialog({ open: true, bucketName: bucket.name })
                                }
                              >
                                <BarChart3 className="h-4 w-4 mr-2" />
                                Analytics
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  setDeleteBucketDialog({ open: true, bucketName: bucket.name })
                                }
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Bucket
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))
                    ) : (
                      <div className="px-2 py-4 text-center group-data-[collapsible=icon]:hidden">
                        <p className="text-xs text-muted-foreground mb-2">No buckets found</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setCreateBucketOpen(true)}
                        >
                          <Plus className="h-3 w-3 mr-1.5" />
                          Create Bucket
                        </Button>
                      </div>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setFolderSyncOpen(true)}
                tooltip="Folder Sync"
                disabled={!selectedBucket}
                className={!selectedBucket ? "opacity-50 pointer-events-none" : ""}
              >
                <FolderSync className="h-4 w-4 shrink-0" />
                <span>Folder Sync</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setDuplicateScannerOpen(true)}
                tooltip="Find Duplicates"
                disabled={!selectedBucket}
                className={!selectedBucket ? "opacity-50 pointer-events-none" : ""}
              >
                <Files className="h-4 w-4 shrink-0" />
                <span>Find Duplicates</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setHistoryDialogOpen(true)}
                tooltip="Operations History"
                disabled={!selectedBucket}
                className={!selectedBucket ? "opacity-50 pointer-events-none" : ""}
              >
                <History className="h-4 w-4 shrink-0" />
                <span>History</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarSeparator className="my-2" />

          {/* Author & Support */}
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
            <button
              onClick={() => setSupportMeOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-full"
            >
              <Heart className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span className="group-data-[collapsible=icon]:hidden">Support</span>
            </button>
            <button
              onClick={() => openUrl("https://github.com/ZeroGDrive/bucket-scout")}
              className="flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-full"
              title="View on GitHub"
            >
              <Github className="h-3.5 w-3.5 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">GitHub</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden mt-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="uppercase tracking-wider">Connected</span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <AddAccountDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} />

      {selectedAccountId && (
        <CreateBucketDialog
          open={createBucketOpen}
          onOpenChange={setCreateBucketOpen}
          accountId={selectedAccountId}
        />
      )}

      {selectedAccountId && configBucketDialog.bucketName && (
        <BucketConfigDialog
          open={configBucketDialog.open}
          onOpenChange={(open) =>
            setConfigBucketDialog({ open, bucketName: open ? configBucketDialog.bucketName : "" })
          }
          accountId={selectedAccountId}
          bucket={configBucketDialog.bucketName}
          providerType={accounts?.find((a) => a.id === selectedAccountId)?.providerType}
        />
      )}

      {selectedAccountId && analyticsBucketDialog.bucketName && (
        <BucketAnalyticsDialog
          open={analyticsBucketDialog.open}
          onOpenChange={(open) =>
            setAnalyticsBucketDialog({
              open,
              bucketName: open ? analyticsBucketDialog.bucketName : "",
            })
          }
          accountId={selectedAccountId}
          bucket={analyticsBucketDialog.bucketName}
        />
      )}

      <OperationsHistoryDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen} />

      <DuplicateScannerDialog open={duplicateScannerOpen} onOpenChange={setDuplicateScannerOpen} />

      <FolderSyncDialog open={folderSyncOpen} onOpenChange={setFolderSyncOpen} />

      <SupportMeDialog open={supportMeOpen} onOpenChange={setSupportMeOpen} />

      <AlertDialog
        open={deleteBucketDialog.open}
        onOpenChange={(open) => {
          if (deleteBucket.isPending) return; // Prevent closing while deleting
          setDeleteBucketDialog({ open, bucketName: open ? deleteBucketDialog.bucketName : "" });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bucket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the bucket "{deleteBucketDialog.bucketName}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <Checkbox
              id="force-delete"
              checked={forceDelete}
              onCheckedChange={(checked) => setForceDelete(checked === true)}
              disabled={deleteBucket.isPending}
            />
            <Label htmlFor="force-delete" className="text-sm text-muted-foreground">
              Force delete (remove all objects first)
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBucket.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteBucket}
              disabled={deleteBucket.isPending}
            >
              {deleteBucket.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deleteBucket.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
