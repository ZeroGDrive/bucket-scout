import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check, ExternalLink } from "lucide-react";
import { useGeneratePresignedUrl } from "@/lib/queries";
import { toast } from "sonner";
import { cn, parseS3Error } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { value: "3600", label: "1 hour" },
  { value: "21600", label: "6 hours" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

interface PresignedUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  bucket: string;
  fileKey: string;
  fileName: string;
}

export function PresignedUrlDialog({
  open,
  onOpenChange,
  accountId,
  bucket,
  fileKey,
  fileName,
}: PresignedUrlDialogProps) {
  const [expirySeconds, setExpirySeconds] = useState("86400");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMutation = useGeneratePresignedUrl();

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync({
        accountId,
        bucket,
        key: fileKey,
        expiresInSeconds: parseInt(expirySeconds),
      });
      setGeneratedUrl(result.url);
      setExpiresAt(result.expiresAt);
    } catch (error) {
      toast.error("Failed to generate shareable link", {
        description: parseS3Error(error),
      });
    }
  };

  const handleCopy = async () => {
    if (generatedUrl) {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setGeneratedUrl(null);
      setExpiresAt(null);
      setCopied(false);
    }
    onOpenChange(newOpen);
  };

  const formatExpiresAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Get Shareable Link</AlertDialogTitle>
          <AlertDialogDescription>
            Generate a temporary link for{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">{fileName}</code>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-4">
          {!generatedUrl ? (
            <div className="space-y-2">
              <Label htmlFor="expiry">Link expires in</Label>
              <select
                id="expiry"
                value={expirySeconds}
                onChange={(e) => setExpirySeconds(e.target.value)}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Shareable link</Label>
                <div className="relative">
                  <code className="block text-xs font-mono bg-muted px-3 py-2 pr-12 rounded border break-all">
                    {generatedUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              {expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires: {formatExpiresAt(expiresAt)}
                </p>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={generateMutation.isPending}>Close</AlertDialogCancel>
          {!generatedUrl ? (
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Link"
              )}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => window.open(generatedUrl, "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
