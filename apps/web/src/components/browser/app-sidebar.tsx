import { useState } from "react";
import {
  Cloud,
  Database,
  FolderOpen,
  Plus,
  MoreVertical,
  Trash2,
  RefreshCw,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBrowserStore } from "@/lib/store";
import { useAccounts, useBuckets, useRemoveAccount, useTestConnection } from "@/lib/queries";
import { AddAccountDialog } from "@/components/accounts/add-account-dialog";
import { toast } from "sonner";

export function AppSidebar() {
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const setAccount = useBrowserStore((s) => s.setAccount);
  const setBucket = useBrowserStore((s) => s.setBucket);

  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: buckets, isLoading: bucketsLoading } = useBuckets(selectedAccountId);
  const removeAccount = useRemoveAccount();
  const testConnection = useTestConnection();

  const handleTestConnection = async (id: string) => {
    try {
      const result = await testConnection.mutateAsync(id);
      if (result) {
        toast.success("Connection successful");
      }
    } catch (error) {
      toast.error("Connection failed", {
        description: String(error),
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
        description: String(error),
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
                        <span className="truncate">{account.name}</span>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-sm p-0 text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 outline-hidden transition-transform opacity-0 group-hover/menu-item:opacity-100 data-[open]:opacity-100">
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
                <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Buckets
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
                          <SidebarMenuButton
                            isActive={selectedBucket === bucket.name}
                            onClick={() => setBucket(bucket.name)}
                            tooltip={bucket.name}
                          >
                            <FolderOpen className="h-4 w-4 shrink-0" />
                            <span className="truncate">{bucket.name}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))
                    ) : (
                      <div className="px-2 py-4 text-center">
                        <p className="text-xs text-muted-foreground">No buckets found</p>
                      </div>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="uppercase tracking-wider">Connected</span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <AddAccountDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} />
    </>
  );
}
