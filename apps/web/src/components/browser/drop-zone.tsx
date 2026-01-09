import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadManager } from "@/hooks/use-upload-manager";
import { useBrowserStore } from "@/lib/store";

interface DropZoneProps {
  children: ReactNode;
  className?: string;
}

// Custom drag data type marker for internal drags
const INTERNAL_DRAG_TYPE = "application/x-bucketscout-items";

export function DropZone({ children, className }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [inTauri, setInTauri] = useState(false);
  const dragCountRef = useRef(0);
  const { queueFiles, queueFilePaths } = useUploadManager();
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const dragState = useBrowserStore((s) => s.dragState);

  const disabled = !selectedBucket;
  // Use ref to avoid stale closure in event handler
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const queueFilePathsRef = useRef(queueFilePaths);
  queueFilePathsRef.current = queueFilePaths;

  const isInternalDrag = useCallback((dataTransfer: DataTransfer | null) => {
    if (!dataTransfer) return false;
    if (dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) return true;
    return useBrowserStore.getState().dragState !== null;
  }, []);

  // Set up Tauri native drag and drop listener
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;

    const setupListener = async () => {
      try {
        // Use the official isTauri() function from @tauri-apps/api/core
        const { isTauri } = await import("@tauri-apps/api/core");
        const tauriDetected = isTauri();

        console.log("[drop-zone] Tauri detected (via @tauri-apps/api/core):", tauriDetected);

        if (!tauriDetected) {
          console.log("[drop-zone] Not in Tauri environment, using web drag and drop");
          if (mounted) setInTauri(false);
          return;
        }

        if (mounted) setInTauri(true);
        console.log("[drop-zone] Setting up Tauri drag and drop listener");

        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();

        console.log("[drop-zone] Got webview, registering onDragDropEvent");

        unlisten = await webview.onDragDropEvent((event) => {
          console.log("[drop-zone] Drag event:", event.payload.type, event.payload);

          if (disabledRef.current) {
            console.log("[drop-zone] Disabled, ignoring event");
            return;
          }

          // Skip if there's an internal drag happening (dragging files within the bucket)
          // Use getState() to get current state synchronously, avoiding React re-render timing issues
          const currentDragState = useBrowserStore.getState().dragState;
          console.log("[drop-zone] Checking drag state:", currentDragState);
          if (currentDragState) {
            console.log("[drop-zone] Internal drag active, ignoring Tauri drag event");
            return;
          }

          const eventType = event.payload.type;
          if (eventType === "enter" || eventType === "over") {
            setIsDragOver(true);
          } else if (eventType === "leave") {
            setIsDragOver(false);
          } else if (eventType === "drop") {
            setIsDragOver(false);
            if ("paths" in event.payload && event.payload.paths.length > 0) {
              console.log("[drop-zone] Tauri drop:", event.payload.paths);
              queueFilePathsRef.current(event.payload.paths);
            }
          }
        });

        if (mounted) {
          console.log("[drop-zone] Tauri drag and drop listener registered");
        }
      } catch (error) {
        console.error("[drop-zone] Failed to set up Tauri drag and drop:", error);
        if (mounted) setInTauri(false);
      }
    };

    setupListener();

    return () => {
      mounted = false;
      if (unlisten) {
        console.log("[drop-zone] Cleaning up Tauri drag and drop listener");
        unlisten();
      }
    };
  }, []); // Empty deps - refs handle updates

  // Web-based drag and drop handlers (fallback for non-Tauri)
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      console.log("[drop-zone] Web dragEnter:", {
        inTauri,
        types: Array.from(e.dataTransfer.types),
        hasInternalType: e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE),
        target: (e.target as HTMLElement)?.tagName,
      });
      if (inTauri) return; // Skip web handlers in Tauri
      // Skip internal drags - they're handled by file-explorer
      if (isInternalDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current++;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [inTauri, isInternalDrag],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (inTauri) return;
      // Skip internal drags
      if (isInternalDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current--;
      if (dragCountRef.current === 0) {
        setIsDragOver(false);
      }
    },
    [inTauri, isInternalDrag],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (inTauri) return;
      // Skip internal drags
      if (isInternalDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [inTauri, isInternalDrag],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (inTauri) return; // Tauri handles drops natively
      // Skip internal drags - they're handled by file-explorer
      if (isInternalDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragOver(false);

      if (disabled) return;

      const items = e.dataTransfer.items;

      // Handle DataTransferItemList for folder support
      if (items && items.length > 0) {
        const entries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) {
            entries.push(entry);
          }
        }

        if (entries.length > 0) {
          const files = await processEntries(entries);
          if (files.length > 0) {
            queueFiles(files);
          }
          return;
        }
      }

      // Fallback to regular file list
      if (e.dataTransfer.files.length > 0) {
        queueFiles(e.dataTransfer.files);
      }
    },
    [inTauri, disabled, queueFiles, isInternalDrag],
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn("relative h-full", className)}
    >
      {children}

      {/* Drop overlay */}
      {isDragOver && !disabled && !dragState && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <div className="flex flex-col items-center gap-3 text-primary">
            <div className="p-4 bg-primary/10 rounded-full">
              <Upload className="h-8 w-8" />
            </div>
            <p className="text-sm font-medium">Drop files to upload</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Recursively process file entries (for folder support in web mode)
async function processEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const files: File[] = [];

  async function processEntry(entry: FileSystemEntry, path = ""): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      // Create a new File object with the relative path preserved
      const fileWithPath = new File([file], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      });
      // Preserve relative path using Object.defineProperty
      Object.defineProperty(fileWithPath, "webkitRelativePath", {
        value: path + file.name,
        writable: false,
      });
      files.push(fileWithPath);
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const subEntries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      for (const subEntry of subEntries) {
        await processEntry(subEntry, path + entry.name + "/");
      }
    }
  }

  for (const entry of entries) {
    await processEntry(entry);
  }

  return files;
}
