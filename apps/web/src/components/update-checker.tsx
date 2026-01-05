import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Loader2, RefreshCw } from "lucide-react";

export function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const available = await check();
        if (available) {
          setUpdate(available);
        }
      } catch {
        // Silently fail - update check is not critical
      }
    }

    // Check for updates on mount, but only in production
    if (!import.meta.env.DEV) {
      checkForUpdates();
    }
  }, []);

  const handleUpdate = async () => {
    if (!update) return;

    setIsDownloading(true);
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          setDownloadProgress(0);
        } else if (event.event === "Progress") {
          setDownloadProgress((prev) => prev + event.data.chunkLength);
        } else if (event.event === "Finished") {
          setIsDownloading(false);
          setIsInstalling(true);
        }
      });
      await relaunch();
    } catch {
      setIsDownloading(false);
      setIsInstalling(false);
    }
  };

  if (!update || dismissed) return null;

  return (
    <AlertDialog open={true} onOpenChange={(open) => !open && setDismissed(true)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Update Available
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              A new version <strong>v{update.version}</strong> is available.
            </p>
            {update.body && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded bg-muted p-2 text-sm">
                {update.body}
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => setDismissed(true)}
            disabled={isDownloading || isInstalling}
          >
            Later
          </Button>
          <Button onClick={handleUpdate} disabled={isDownloading || isInstalling}>
            {isInstalling ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Restarting...
              </>
            ) : isDownloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Update Now
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
