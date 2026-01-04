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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (folderName: string) => void;
  isCreating: boolean;
  currentPath: string;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  onConfirm,
  isCreating,
  currentPath,
}: CreateFolderDialogProps) {
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validateFolderName = (name: string): string | null => {
    if (!name.trim()) {
      return "Folder name cannot be empty";
    }
    if (name.includes("/") || name.includes("\\")) {
      return "Folder name cannot contain slashes";
    }
    if (name.startsWith(".")) {
      return "Folder name cannot start with a dot";
    }
    if (name.length > 255) {
      return "Folder name is too long (max 255 characters)";
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateFolderName(folderName);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onConfirm(folderName.trim());
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFolderName("");
      setError(null);
    }
    onOpenChange(newOpen);
  };

  const displayPath = currentPath || "/";

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new folder in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm">{displayPath}</code>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder name</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => {
                  setFolderName(e.target.value);
                  setError(null);
                }}
                placeholder="New folder"
                disabled={isCreating}
                autoFocus
                autoComplete="off"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isCreating}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={isCreating || !folderName.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
