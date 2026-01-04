import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddAccount } from "@/lib/queries";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");

  const addAccount = useAddAccount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !accountId || !accessKeyId || !secretAccessKey) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      await addAccount.mutateAsync({
        name,
        endpoint,
        accessKeyId,
        secretAccessKey,
        accountId,
      });
      toast.success("Account added successfully");
      onOpenChange(false);
      // Reset form
      setName("");
      setAccountId("");
      setAccessKeyId("");
      setSecretAccessKey("");
    } catch (error) {
      toast.error("Failed to add account", {
        description: String(error),
      });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Add R2 Account</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              placeholder="My R2 Account"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountId">Cloudflare Account ID</Label>
            <Input
              id="accountId"
              placeholder="abc123def456..."
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Found in your Cloudflare dashboard URL</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessKeyId">Access Key ID</Label>
            <Input
              id="accessKeyId"
              placeholder="Access Key ID"
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secretAccessKey">Secret Access Key</Label>
            <Input
              id="secretAccessKey"
              type="password"
              placeholder="Secret Access Key"
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addAccount.isPending}>
              {addAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
