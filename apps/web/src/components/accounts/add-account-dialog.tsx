import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddAccount } from "@/lib/queries";
import { toast } from "sonner";
import { parseS3Error } from "@/lib/utils";
import { Loader2, Cloud, Server } from "lucide-react";
import { PROVIDERS, AWS_REGIONS, type ProviderType } from "@/lib/types";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
  const [providerType, setProviderType] = useState<ProviderType>("cloudflare_r2");
  const [name, setName] = useState("");
  const [cloudflareAccountId, setCloudflareAccountId] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");

  const addAccount = useAddAccount();

  const resetForm = () => {
    setProviderType("cloudflare_r2");
    setName("");
    setCloudflareAccountId("");
    setRegion("us-east-1");
    setAccessKeyId("");
    setSecretAccessKey("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate common fields
    if (!name || !accessKeyId || !secretAccessKey) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Provider-specific validation
    if (providerType === "cloudflare_r2" && !cloudflareAccountId) {
      toast.error("Cloudflare Account ID is required for R2");
      return;
    }

    if (providerType === "aws_s3" && !region) {
      toast.error("Region is required for AWS S3");
      return;
    }

    try {
      // Build endpoint based on provider
      let endpoint = "";
      if (providerType === "cloudflare_r2") {
        endpoint = `https://${cloudflareAccountId}.r2.cloudflarestorage.com`;
      }
      // AWS S3 uses default endpoint (empty string means SDK defaults)

      await addAccount.mutateAsync({
        name,
        endpoint,
        accessKeyId,
        secretAccessKey,
        providerType,
        cloudflareAccountId: providerType === "cloudflare_r2" ? cloudflareAccountId : undefined,
        region: providerType === "aws_s3" ? region : undefined,
      });
      toast.success("Account added successfully");
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error("Failed to add account", {
        description: parseS3Error(error),
      });
    }
  };

  if (!open) return null;

  const selectedProvider = PROVIDERS.find((p) => p.value === providerType);

  const handleClose = () => {
    if (addAccount.isPending) return;
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Add Storage Account</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  onClick={() => setProviderType(provider.value)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                    providerType === provider.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  {provider.value === "cloudflare_r2" ? (
                    <Cloud className="h-4 w-4 text-orange-500" />
                  ) : (
                    <Server className="h-4 w-4 text-yellow-500" />
                  )}
                  <span className="text-sm font-medium">{provider.label}</span>
                </button>
              ))}
            </div>
            {selectedProvider && (
              <p className="text-xs text-muted-foreground">{selectedProvider.description}</p>
            )}
          </div>

          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              placeholder={providerType === "cloudflare_r2" ? "My R2 Account" : "My AWS Account"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Provider-specific fields */}
          {providerType === "cloudflare_r2" && (
            <div className="space-y-2">
              <Label htmlFor="cloudflareAccountId">Cloudflare Account ID</Label>
              <Input
                id="cloudflareAccountId"
                placeholder="abc123def456..."
                value={cloudflareAccountId}
                onChange={(e) => setCloudflareAccountId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Found in your Cloudflare dashboard URL
              </p>
            </div>
          )}

          {providerType === "aws_s3" && (
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select
                value={region}
                onValueChange={(val) => val && setRegion(val)}
                items={AWS_REGIONS}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AWS_REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Credentials */}
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
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={addAccount.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addAccount.isPending}>
              {addAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {addAccount.isPending ? "Adding..." : "Add Account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
