import { X, FileX, AlertCircle, Download, ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Image } from "@unpic/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useBrowserStore } from "@/lib/store";
import { usePreview, useAccount } from "@/lib/queries";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function getFileExtension(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext || "FILE";
}

export function PreviewPanel() {
  const selectedAccountId = useBrowserStore((s) => s.selectedAccountId);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);
  const selectedFileKey = useBrowserStore((s) => s.selectedFileKey);
  const selectFile = useBrowserStore((s) => s.selectFile);

  const { data: account } = useAccount(selectedAccountId);
  const { data: preview, isLoading, error } = usePreview(
    selectedAccountId,
    selectedBucket,
    selectedFileKey
  );

  const [copied, setCopied] = useState(false);

  const fileName = selectedFileKey?.split("/").pop() || "";
  const fileExtension = getFileExtension(fileName);

  const handleClose = () => {
    selectFile(null);
  };

  const handleCopyKey = async () => {
    if (selectedFileKey) {
      await navigator.clipboard.writeText(selectedFileKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Generate public URL for R2
  const getPublicUrl = () => {
    if (!account || !selectedBucket || !selectedFileKey) return null;
    return `https://${selectedBucket}.${account.accountId}.r2.cloudflarestorage.com/${selectedFileKey}`;
  };

  if (!selectedFileKey) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b bg-muted/20 shrink-0">
        <div className="min-w-0 flex-1 mr-3">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
              {fileExtension}
            </Badge>
            <h3 className="text-sm font-semibold truncate">{fileName}</h3>
          </div>
          {preview && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatFileSize(preview.size)}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="truncate">{preview.contentType}</span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          className="shrink-0 text-muted-foreground hover:text-foreground -mr-1 -mt-1"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Preview Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="w-full aspect-video rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-muted-foreground">
            <div className="relative mb-4">
              <div className="bg-destructive/10 rounded-xl p-4">
                <AlertCircle className="h-8 w-8 text-destructive/70" strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-sm font-medium mb-1">Failed to load preview</p>
            <p className="text-xs text-center max-w-[200px] text-muted-foreground/70">{String(error)}</p>
          </div>
        ) : preview ? (
          <ScrollArea className="h-full">
            <PreviewContent data={preview.data} />
          </ScrollArea>
        ) : null}
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 border-t bg-muted/10 p-3 space-y-2">
        {/* File Path */}
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-1.5 rounded truncate">
            {selectedFileKey}
          </code>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopyKey}
            className="shrink-0"
            title="Copy path"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const url = getPublicUrl();
              if (url) window.open(url, "_blank");
            }}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              // TODO: Implement download
              console.log("Download:", selectedFileKey);
            }}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewContent({ data }: { data: import("@/lib/types").PreviewContent }) {
  switch (data.type) {
    case "Image":
      return (
        <div className="p-4">
          <div className="rounded-lg overflow-hidden bg-[repeating-conic-gradient(var(--muted)_0_90deg,var(--background)_0_180deg)] bg-[length:12px_12px] border">
            <Image
              src={`data:${data.mimeType};base64,${data.base64}`}
              alt="Preview"
              layout="constrained"
              width={800}
              height={600}
              className="w-full h-auto max-h-[50vh] object-contain"
            />
          </div>
        </div>
      );

    case "Text":
      return (
        <div className="p-4">
          <div className="bg-muted/30 rounded-lg border overflow-hidden">
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words p-4 overflow-x-auto leading-relaxed text-muted-foreground">
              {data.content}
            </pre>
          </div>
          {data.truncated && (
            <p className="text-[10px] text-muted-foreground/70 mt-3 text-center">
              Content truncated — file too large to preview entirely
            </p>
          )}
        </div>
      );

    case "Json":
      return (
        <div className="p-4">
          <div className="bg-muted/30 rounded-lg border overflow-hidden">
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words p-4 overflow-x-auto leading-relaxed text-muted-foreground">
              {JSON.stringify(data.content, null, 2)}
            </pre>
          </div>
        </div>
      );

    case "Unsupported":
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-muted-foreground">
          <div className="relative mb-4">
            <div className="bg-muted/50 rounded-xl p-4">
              <FileX className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
            </div>
          </div>
          <p className="text-sm font-medium mb-1">Preview not available</p>
          <p className="text-xs text-center max-w-[200px] text-muted-foreground/70">{data.message}</p>
        </div>
      );

    default:
      return null;
  }
}
