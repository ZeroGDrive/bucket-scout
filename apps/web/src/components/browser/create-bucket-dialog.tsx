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
import { useCreateBucket, useAccount } from "@/lib/queries";
import { toast } from "sonner";
import { parseS3Error } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { R2_LOCATIONS, AWS_REGIONS } from "@/lib/types";

interface CreateBucketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}

export function CreateBucketDialog({ open, onOpenChange, accountId }: CreateBucketDialogProps) {
  const [bucketName, setBucketName] = useState("");
  const [location, setLocation] = useState<string>("");

  const { data: account } = useAccount(accountId);
  const createBucket = useCreateBucket();

  const isR2 = account?.providerType === "cloudflare_r2";
  const isAwsS3 = account?.providerType === "aws_s3";

  const resetForm = () => {
    setBucketName("");
    setLocation("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!bucketName) {
      toast.error("Please enter a bucket name");
      return;
    }

    // Basic validation
    if (bucketName.length < 3 || bucketName.length > 63) {
      toast.error("Bucket name must be 3-63 characters");
      return;
    }

    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucketName) && bucketName.length > 2) {
      toast.error("Bucket name can only contain lowercase letters, numbers, hyphens, and periods");
      return;
    }

    try {
      await createBucket.mutateAsync({
        accountId,
        bucketName,
        location: location || undefined,
      });
      toast.success(`Bucket "${bucketName}" created successfully`);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error("Failed to create bucket", {
        description: parseS3Error(error),
      });
    }
  };

  if (!open) return null;

  const handleClose = () => {
    if (createBucket.isPending) return;
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Create New Bucket</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bucketName">Bucket Name</Label>
            <Input
              id="bucketName"
              placeholder="my-bucket-name"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value.toLowerCase())}
              disabled={createBucket.isPending}
            />
            <p className="text-xs text-muted-foreground">
              3-63 characters, lowercase letters, numbers, hyphens, and periods only
            </p>
          </div>

          {isR2 && (
            <div className="space-y-2">
              <Label htmlFor="location">Location Hint (Optional)</Label>
              <Select
                value={location || "auto"}
                onValueChange={(val) => setLocation(val === "auto" ? "" : val || "")}
                items={[{ value: "auto", label: "Automatic (recommended)" }, ...R2_LOCATIONS]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic (recommended)</SelectItem>
                  {R2_LOCATIONS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                R2 will automatically choose the best location if not specified
              </p>
            </div>
          )}

          {isAwsS3 && (
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select
                value={location || account?.region || "us-east-1"}
                onValueChange={(val) => val && setLocation(val)}
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

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createBucket.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createBucket.isPending}>
              {createBucket.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {createBucket.isPending ? "Creating..." : "Create Bucket"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
