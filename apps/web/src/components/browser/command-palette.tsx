import { useEffect, useState, useCallback, useMemo } from "react";
import {
  FolderOpen,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  LayoutGrid,
  LayoutList,
  Search,
  Database,
  Copy,
  Scissors,
  ClipboardPaste,
  Eye,
  EyeOff,
  Home,
  ArrowUp,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { useBrowserStore, useClipboard, useCurrentPrefix } from "@/lib/store";
import { useAccounts, useBuckets, queryKeys } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Store state
  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const selectedFileKeys = useBrowserStore((s) => s.selectedFileKeys);
  const viewMode = useBrowserStore((s) => s.viewMode);
  const previewPanelOpen = useBrowserStore((s) => s.previewPanelOpen);
  const currentPath = useBrowserStore((s) => s.currentPath);
  const clipboard = useClipboard();
  const prefix = useCurrentPrefix();

  // Store actions
  const setAccount = useBrowserStore((s) => s.setAccount);
  const setBucket = useBrowserStore((s) => s.setBucket);
  const toggleViewMode = useBrowserStore((s) => s.toggleViewMode);
  const togglePreviewPanel = useBrowserStore((s) => s.togglePreviewPanel);
  const navigateUp = useBrowserStore((s) => s.navigateUp);
  const navigateToRoot = useBrowserStore((s) => s.navigateToRoot);
  const setSearchQuery = useBrowserStore((s) => s.setSearchQuery);
  const copyToClipboard = useBrowserStore((s) => s.copyToClipboard);
  const cutToClipboard = useBrowserStore((s) => s.cutToClipboard);
  const clearSelection = useBrowserStore((s) => s.clearSelection);

  // Data queries
  const { data: accounts } = useAccounts();
  const { data: buckets } = useBuckets(selectedAccountId);

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Command handlers
  const handleRefresh = useCallback(() => {
    if (selectedAccountId && selectedBucket) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.objects(selectedAccountId, selectedBucket, prefix),
      });
    }
    setOpen(false);
  }, [selectedAccountId, selectedBucket, prefix, queryClient]);

  const handleToggleView = useCallback(() => {
    toggleViewMode();
    setOpen(false);
  }, [toggleViewMode]);

  const handleTogglePreview = useCallback(() => {
    togglePreviewPanel();
    setOpen(false);
  }, [togglePreviewPanel]);

  const handleGoUp = useCallback(() => {
    navigateUp();
    setOpen(false);
  }, [navigateUp]);

  const handleGoHome = useCallback(() => {
    navigateToRoot();
    setOpen(false);
  }, [navigateToRoot]);

  const handleFocusSearch = useCallback(() => {
    setOpen(false);
    // Focus the search input after closing the palette
    setTimeout(() => {
      const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
      searchInput?.focus();
    }, 100);
  }, []);

  const handleCopy = useCallback(() => {
    if (selectedAccountId && selectedBucket && selectedFileKeys.length > 0) {
      copyToClipboard(selectedFileKeys, selectedBucket, selectedAccountId);
    }
    setOpen(false);
  }, [selectedAccountId, selectedBucket, selectedFileKeys, copyToClipboard]);

  const handleCut = useCallback(() => {
    if (selectedAccountId && selectedBucket && selectedFileKeys.length > 0) {
      cutToClipboard(selectedFileKeys, selectedBucket, selectedAccountId);
    }
    setOpen(false);
  }, [selectedAccountId, selectedBucket, selectedFileKeys, cutToClipboard]);

  const handleSelectAccount = useCallback((accountId: string) => {
    setAccount(accountId);
    setOpen(false);
  }, [setAccount]);

  const handleSelectBucket = useCallback((bucketName: string) => {
    setBucket(bucketName);
    setOpen(false);
  }, [setBucket]);

  const handleClearSelection = useCallback(() => {
    clearSelection();
    setOpen(false);
  }, [clearSelection]);

  // Trigger actions through custom events (will be handled by parent components)
  const dispatchAction = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('command-palette-action', { detail: action }));
    setOpen(false);
  }, []);

  // Computed values
  const hasSelection = selectedFileKeys.length > 0;
  const canNavigateUp = currentPath.length > 0;
  const hasClipboard = !!clipboard;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={handleFocusSearch}>
            <Search />
            <span>Search files</span>
            <CommandShortcut>⌘F</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => dispatchAction('new-folder')}>
            <FolderPlus />
            <span>New folder</span>
            <CommandShortcut>⌘⇧N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => dispatchAction('upload')}>
            <Upload />
            <span>Upload files</span>
          </CommandItem>
          <CommandItem onSelect={handleRefresh} disabled={!selectedBucket}>
            <RefreshCw />
            <span>Refresh</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Selection Actions */}
        {hasSelection && (
          <>
            <CommandGroup heading={`Selection (${selectedFileKeys.length} items)`}>
              <CommandItem onSelect={() => dispatchAction('download')}>
                <Download />
                <span>Download selected</span>
              </CommandItem>
              <CommandItem onSelect={handleCopy}>
                <Copy />
                <span>Copy selected</span>
                <CommandShortcut>⌘C</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleCut}>
                <Scissors />
                <span>Cut selected</span>
                <CommandShortcut>⌘X</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => dispatchAction('delete')}>
                <Trash2 />
                <span>Delete selected</span>
                <CommandShortcut>⌫</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={handleClearSelection}>
                <EyeOff />
                <span>Clear selection</span>
                <CommandShortcut>Esc</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Clipboard Actions */}
        {hasClipboard && (
          <>
            <CommandGroup heading="Clipboard">
              <CommandItem onSelect={() => dispatchAction('paste')}>
                <ClipboardPaste />
                <span>
                  Paste {clipboard.keys.length} item{clipboard.keys.length > 1 ? 's' : ''}{' '}
                  ({clipboard.operation})
                </span>
                <CommandShortcut>⌘V</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {canNavigateUp && (
            <CommandItem onSelect={handleGoUp}>
              <ArrowUp />
              <span>Go up one level</span>
              <CommandShortcut>⌫</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem onSelect={handleGoHome} disabled={!selectedBucket}>
            <Home />
            <span>Go to bucket root</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* View Options */}
        <CommandGroup heading="View">
          <CommandItem onSelect={handleToggleView}>
            {viewMode === 'grid' ? <LayoutList /> : <LayoutGrid />}
            <span>Switch to {viewMode === 'grid' ? 'list' : 'grid'} view</span>
          </CommandItem>
          <CommandItem onSelect={handleTogglePreview}>
            {previewPanelOpen ? <EyeOff /> : <Eye />}
            <span>{previewPanelOpen ? 'Hide' : 'Show'} preview panel</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Accounts */}
        {accounts && accounts.length > 0 && (
          <>
            <CommandGroup heading="Switch Account">
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  onSelect={() => handleSelectAccount(account.id)}
                  disabled={selectedAccountId === account.id}
                >
                  <Database />
                  <span>{account.name}</span>
                  {selectedAccountId === account.id && (
                    <span className="ml-auto text-xs text-muted-foreground">current</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Buckets */}
        {buckets && buckets.length > 0 && (
          <CommandGroup heading="Switch Bucket">
            {buckets.map((bucket) => (
              <CommandItem
                key={bucket.name}
                onSelect={() => handleSelectBucket(bucket.name)}
                disabled={selectedBucket === bucket.name}
              >
                <FolderOpen />
                <span>{bucket.name}</span>
                {selectedBucket === bucket.name && (
                  <span className="ml-auto text-xs text-muted-foreground">current</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
