import { useState, useCallback, useRef, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadManager } from "@/hooks/use-upload-manager";
import { useBrowserStore } from "@/lib/store";

interface DropZoneProps {
  children: ReactNode;
  className?: string;
}

export function DropZone({ children, className }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCountRef = useRef(0);
  const { queueFiles } = useUploadManager();
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);

  const disabled = !selectedBucket;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
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
    [disabled, queueFiles]
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn("relative", className)}
    >
      {children}

      {/* Drop overlay */}
      {isDragOver && !disabled && (
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

// Recursively process file entries (for folder support)
async function processEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const files: File[] = [];

  async function processEntry(
    entry: FileSystemEntry,
    path = ""
  ): Promise<void> {
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
      const subEntries = await new Promise<FileSystemEntry[]>(
        (resolve, reject) => {
          reader.readEntries(resolve, reject);
        }
      );
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
