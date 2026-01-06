import { useState } from "react";
import { Github, Coffee, Copy, Check, ExternalLink, Heart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { openUrl } from "@/lib/open-url";

interface SupportMeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CRYPTO_ADDRESS = "0x424dd2471d8231140f64c292845fcb2ca0cb1f06";
const GITHUB_PROFILE_URL = "https://github.com/ZeroGDrive";
const GITHUB_REPO_URL = "https://github.com/ZeroGDrive/bucket-scout";
const BMC_URL = "https://buymeacoffee.com/zerogdrive";

export function SupportMeDialog({ open, onOpenChange }: SupportMeDialogProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(CRYPTO_ADDRESS);
      setCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy address");
    }
  };

  const openExternal = (url: string) => {
    openUrl(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden">
        <DialogHeader className="relative pt-4">
          <div className="flex flex-col items-center text-center gap-4">
            {/* Avatar/Logo area */}
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 border border-primary/30 flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="text-2xl font-bold text-primary-foreground">A</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center">
                <Heart className="w-3 h-3 text-primary fill-primary/50" />
              </div>
            </div>

            <div className="space-y-1.5">
              <DialogTitle className="text-lg">Built by Ayoub Alfurjani</DialogTitle>
              <button
                onClick={() => openExternal(GITHUB_PROFILE_URL)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
              >
                <Github className="w-3 h-3" />
                <span className="group-hover:underline underline-offset-2">@ZeroGDrive</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>

          <DialogDescription className="text-center pt-3">
            BucketScout is free and open source. If you find it useful, consider supporting its
            development.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          {/* Buy Me a Coffee */}
          <button
            onClick={() => openExternal(BMC_URL)}
            className="group w-full p-4 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent hover:border-amber-500/30 hover:from-amber-500/15 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Coffee className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-sm flex items-center gap-2">
                  Buy Me a Coffee
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-xs text-muted-foreground">One-time or monthly support</div>
              </div>
            </div>
          </button>

          {/* Crypto */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Crypto (ERC-20)</div>
                <div className="text-xs text-muted-foreground">USDT on Ethereum</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-[10px] font-mono text-muted-foreground truncate select-all">
                {CRYPTO_ADDRESS}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={copyAddress}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Star on GitHub */}
          <button
            onClick={() => openExternal(GITHUB_REPO_URL)}
            className="group w-full p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
          >
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              <Github className="w-4 h-4" />
              Star on GitHub
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
