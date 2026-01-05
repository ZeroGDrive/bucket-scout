import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateObjectMetadata, useObjectMetadata } from "@/lib/queries";
import { toast } from "sonner";
import { parseS3Error } from "@/lib/utils";

interface EditMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  bucket: string;
  objectKey: string;
}

export function EditMetadataDialog({
  open,
  onOpenChange,
  accountId,
  bucket,
  objectKey,
}: EditMetadataDialogProps) {
  const [contentType, setContentType] = useState("");
  const [cacheControl, setCacheControl] = useState("");
  const [contentDisposition, setContentDisposition] = useState("");
  const [contentEncoding, setContentEncoding] = useState("");
  const [customMetadata, setCustomMetadata] = useState<{ key: string; value: string }[]>([]);

  const { data: metadata, isLoading: metadataLoading } = useObjectMetadata(
    open ? accountId : null,
    open ? bucket : null,
    open ? objectKey : null
  );

  const updateMetadata = useUpdateObjectMetadata();

  // Reset form when dialog opens or metadata loads
  useEffect(() => {
    if (open && metadata) {
      setContentType(metadata.contentType || "");
      setCacheControl(metadata.cacheControl || "");
      setContentDisposition("");
      setContentEncoding(metadata.contentEncoding || "");

      // Convert metadata object to array of key-value pairs
      if (metadata.metadata) {
        setCustomMetadata(
          Object.entries(metadata.metadata).map(([key, value]) => ({ key, value }))
        );
      } else {
        setCustomMetadata([]);
      }
    }
  }, [open, metadata]);

  const handleAddCustomMetadata = () => {
    setCustomMetadata([...customMetadata, { key: "", value: "" }]);
  };

  const handleRemoveCustomMetadata = (index: number) => {
    setCustomMetadata(customMetadata.filter((_, i) => i !== index));
  };

  const handleUpdateCustomMetadata = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const updated = [...customMetadata];
    updated[index][field] = value;
    setCustomMetadata(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Convert custom metadata array to object
    const customMetadataObj: Record<string, string> = {};
    for (const { key, value } of customMetadata) {
      if (key.trim()) {
        customMetadataObj[key.trim()] = value;
      }
    }

    try {
      await updateMetadata.mutateAsync({
        accountId,
        bucket,
        key: objectKey,
        contentType: contentType || undefined,
        cacheControl: cacheControl || undefined,
        contentDisposition: contentDisposition || undefined,
        contentEncoding: contentEncoding || undefined,
        customMetadata: Object.keys(customMetadataObj).length > 0 ? customMetadataObj : undefined,
      });
      toast.success("Metadata updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update metadata", {
        description: parseS3Error(error),
      });
    }
  };

  if (!open) return null;

  const fileName = objectKey.split("/").pop() || objectKey;

  const handleClose = () => {
    if (updateMetadata.isPending) return;
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">Edit Metadata</h2>
        <p className="text-sm text-muted-foreground mb-4 truncate" title={fileName}>
          {fileName}
        </p>

        {metadataLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading metadata...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="content-type">Content-Type</Label>
              <Input
                id="content-type"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                placeholder="application/octet-stream"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cache-control">Cache-Control</Label>
              <Input
                id="cache-control"
                value={cacheControl}
                onChange={(e) => setCacheControl(e.target.value)}
                placeholder="max-age=31536000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content-disposition">Content-Disposition</Label>
              <Input
                id="content-disposition"
                value={contentDisposition}
                onChange={(e) => setContentDisposition(e.target.value)}
                placeholder="attachment; filename=example.pdf"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content-encoding">Content-Encoding</Label>
              <Input
                id="content-encoding"
                value={contentEncoding}
                onChange={(e) => setContentEncoding(e.target.value)}
                placeholder="gzip"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Custom Metadata</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddCustomMetadata}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {customMetadata.length === 0 ? (
                <p className="text-sm text-muted-foreground">No custom metadata</p>
              ) : (
                <div className="space-y-2">
                  {customMetadata.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={item.key}
                        onChange={(e) =>
                          handleUpdateCustomMetadata(index, "key", e.target.value)
                        }
                        placeholder="Key"
                        className="flex-1"
                      />
                      <Input
                        value={item.value}
                        onChange={(e) =>
                          handleUpdateCustomMetadata(index, "value", e.target.value)
                        }
                        placeholder="Value"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveCustomMetadata(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={updateMetadata.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMetadata.isPending}>
                {updateMetadata.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
