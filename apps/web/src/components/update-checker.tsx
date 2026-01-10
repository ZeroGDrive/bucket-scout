import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openUrl } from "@/lib/open-url";
import { Download, FileText, RefreshCw } from "lucide-react";

const DISMISSED_VERSION_KEY = "update-dismissed-version";

export function UpdateChecker() {
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    async function checkAndDownload() {
      try {
        const update = await check();
        if (!update) return;

        // Check if user dismissed this version
        const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissedVersion === update.version) return;

        // Download in background
        await update.downloadAndInstall();

        // Show toast when download is complete
        toastIdRef.current = toast.custom(
          (id) => (
            <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-4 w-full max-w-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Update Ready</p>
                  <p className="text-xs text-muted-foreground">
                    Version {update.version} has been downloaded
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    toast.dismiss(id);
                    relaunch();
                  }}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Update
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    openUrl(
                      `https://github.com/ZeroGDrive/bucket-scout/releases/tag/v${update.version}`,
                    );
                  }}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Changelog
                </Button>
              </div>
              <button
                type="button"
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  localStorage.setItem(DISMISSED_VERSION_KEY, update.version);
                  toast.dismiss(id);
                }}
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ),
          { duration: Infinity },
        );
      } catch {
        // Silently fail - update check is not critical
      }
    }

    // Check for updates on mount, but only in production
    if (!import.meta.env.DEV) {
      checkAndDownload();
    }

    return () => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
    };
  }, []);

  return null;
}
