import { Twitter, Github, ExternalLink, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "@/components/ui/dialog";
import { openUrl } from "@/lib/open-url";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TWITTER_HANDLE = "ZeroDrive1";
const TWITTER_URL = `https://twitter.com/intent/tweet?text=@${TWITTER_HANDLE}%20`;
const GITHUB_ISSUES_URL = "https://github.com/ZeroGDrive/bucket-scout/issues/new";

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const openExternal = (url: string) => {
    openUrl(url);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm overflow-hidden">
        <DialogHeader className="relative pt-4">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center">
              <MessageSquare className="w-7 h-7 text-blue-500" />
            </div>

            <div className="space-y-1.5">
              <DialogTitle className="text-lg">Send Feedback</DialogTitle>
            </div>
          </div>

          <DialogDescription className="text-center pt-3">
            Have a suggestion, found a bug, or just want to say hi? Choose how you'd like to reach
            out.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-3">
          {/* Twitter/X */}
          <button
            onClick={() => openExternal(TWITTER_URL)}
            className="group w-full p-4 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent hover:border-sky-500/30 hover:from-sky-500/15 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Twitter className="w-6 h-6 text-sky-500" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-sm flex items-center gap-2">
                  Post on X / Twitter
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-xs text-muted-foreground">
                  Mention @{TWITTER_HANDLE} with your feedback
                </div>
              </div>
            </div>
          </button>

          {/* GitHub Issue */}
          <button
            onClick={() => openExternal(GITHUB_ISSUES_URL)}
            className="group w-full p-4 rounded-xl border border-border bg-muted/30 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Github className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-sm flex items-center gap-2">
                  Open GitHub Issue
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-xs text-muted-foreground">Report bugs or request features</div>
              </div>
            </div>
          </button>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
