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
import { Loader2 } from "lucide-react";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newName: string) => void;
  isRenaming: boolean;
  currentName: string;
  isFolder: boolean;
}

export function RenameDialog({
  open,
  onOpenChange,
  onConfirm,
  isRenaming,
  currentName,
  isFolder,
}: RenameDialogProps) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the input when the dialog opens with a new file
  useEffect(() => {
    if (open) {
      // For folders, remove trailing slash for display
      const displayName = isFolder ? currentName.replace(/\/$/, "") : currentName;
      setNewName(displayName);
      setError(null);
    }
  }, [open, currentName, isFolder]);

  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return "Name cannot be empty";
    }
    if (name.includes("/") || name.includes("\\")) {
      return "Name cannot contain slashes";
    }
    if (name.startsWith(".")) {
      return "Name cannot start with a dot";
    }
    if (name.length > 255) {
      return "Name is too long (max 255 characters)";
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateName(newName);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onConfirm(newName.trim());
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setNewName("");
      setError(null);
    }
    onOpenChange(newOpen);
  };

  const displayCurrentName = isFolder ? currentName.replace(/\/$/, "") : currentName;
  const hasChanged = newName.trim() !== displayCurrentName;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename {isFolder ? "Folder" : "File"}</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm">{displayCurrentName}</code>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">New name</Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setError(null);
                }}
                placeholder={displayCurrentName}
                disabled={isRenaming}
                autoFocus
                autoComplete="off"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isRenaming}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={isRenaming || !newName.trim() || !hasChanged}>
              {isRenaming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
