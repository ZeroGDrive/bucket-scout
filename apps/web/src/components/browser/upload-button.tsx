import { useRef } from "react";
import { Upload, FolderUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUploadManager } from "@/hooks/use-upload-manager";
import { useBrowserStore } from "@/lib/store";

export function UploadButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { queueFiles } = useUploadManager();

  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const disabled = !selectedBucket;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      queueFiles(e.target.files);
      e.target.value = ""; // Reset input
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      queueFiles(e.target.files);
      e.target.value = ""; // Reset input
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error - webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderSelect}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="default"
              size="sm"
              disabled={disabled}
              className="gap-2"
              data-upload-trigger
            />
          }
        >
          <Upload className="h-4 w-4" />
          Upload
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
            <FolderUp className="h-4 w-4 mr-2" />
            Upload Folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
