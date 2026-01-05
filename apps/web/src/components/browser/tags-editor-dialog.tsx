import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, AlertTriangle, Tag } from "lucide-react";
import { useObjectTags, useSetObjectTags } from "@/lib/queries";
import { toast } from "sonner";
import { parseS3Error } from "@/lib/utils";
import type { ObjectTag } from "@/lib/types";

interface TagsEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  bucket: string;
  objectKey: string;
}

export function TagsEditorDialog({
  open,
  onOpenChange,
  accountId,
  bucket,
  objectKey,
}: TagsEditorDialogProps) {
  const [localTags, setLocalTags] = useState<ObjectTag[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const {
    data,
    isLoading,
    error,
  } = useObjectTags(open ? accountId : null, open ? bucket : null, open ? objectKey : null);

  const setTagsMutation = useSetObjectTags();

  const fileName = objectKey.split("/").pop() || objectKey;

  // Sync local state with fetched data
  useEffect(() => {
    if (data?.tags) {
      setLocalTags(data.tags);
      setHasChanges(false);
    }
  }, [data]);

  const handleAddTag = () => {
    setLocalTags([...localTags, { key: "", value: "" }]);
    setHasChanges(true);
  };

  const handleRemoveTag = (index: number) => {
    setLocalTags(localTags.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleTagChange = (index: number, field: "key" | "value", value: string) => {
    const newTags = [...localTags];
    newTags[index] = { ...newTags[index], [field]: value };
    setLocalTags(newTags);
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Validate tags
    const validTags = localTags.filter((tag) => tag.key.trim() !== "");

    // Check for duplicate keys
    const keys = validTags.map((t) => t.key);
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
      toast.error("Duplicate tag keys are not allowed");
      return;
    }

    // Check tag key/value constraints (S3 limits)
    for (const tag of validTags) {
      if (tag.key.length > 128) {
        toast.error(`Tag key "${tag.key.slice(0, 20)}..." exceeds 128 characters`);
        return;
      }
      if (tag.value.length > 256) {
        toast.error(`Tag value for "${tag.key}" exceeds 256 characters`);
        return;
      }
    }

    try {
      await setTagsMutation.mutateAsync({
        accountId,
        bucket,
        key: objectKey,
        tags: validTags,
      });
      toast.success("Tags saved successfully");
      setHasChanges(false);
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to save tags", {
        description: parseS3Error(err),
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasChanges) {
      // Could add confirmation dialog here if desired
    }
    if (!newOpen) {
      setHasChanges(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Object Tags
          </AlertDialogTitle>
          <AlertDialogDescription>
            <code className="rounded bg-muted px-1 py-0.5 text-sm">{fileName}</code>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mb-2 text-destructive/70" />
              <p className="text-sm">Failed to load tags</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{parseS3Error(error)}</p>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[300px] pr-2">
                <div className="space-y-3">
                  {localTags.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <Tag className="h-6 w-6 mb-2 text-muted-foreground/50" />
                      <p className="text-sm">No tags</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Click "Add Tag" to create one
                      </p>
                    </div>
                  ) : (
                    localTags.map((tag, index) => (
                      <TagRow
                        key={index}
                        tag={tag}
                        index={index}
                        onChange={handleTagChange}
                        onRemove={handleRemoveTag}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>

              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddTag}
                  disabled={localTags.length >= 10}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tag
                  {localTags.length > 0 && (
                    <span className="ml-2 text-muted-foreground">({localTags.length}/10)</span>
                  )}
                </Button>
                {localTags.length >= 10 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Maximum of 10 tags per object
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || setTagsMutation.isPending || isLoading}
          >
            {setTagsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Tags"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TagRow({
  tag,
  index,
  onChange,
  onRemove,
}: {
  tag: ObjectTag;
  index: number;
  onChange: (index: number, field: "key" | "value", value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <Label htmlFor={`tag-key-${index}`} className="text-xs text-muted-foreground">
          Key
        </Label>
        <Input
          id={`tag-key-${index}`}
          value={tag.key}
          onChange={(e) => onChange(index, "key", e.target.value)}
          placeholder="e.g., Environment"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex-1 space-y-1">
        <Label htmlFor={`tag-value-${index}`} className="text-xs text-muted-foreground">
          Value
        </Label>
        <Input
          id={`tag-value-${index}`}
          value={tag.value}
          onChange={(e) => onChange(index, "value", e.target.value)}
          placeholder="e.g., Production"
          className="h-8 text-sm"
        />
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(index)}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        title="Remove tag"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
