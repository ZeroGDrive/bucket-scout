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
import { Loader2 } from "lucide-react";
import type { FileItem } from "@/lib/types";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FileItem[];
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
  isDeleting,
}: DeleteConfirmationDialogProps) {
  const fileCount = items.filter((item) => !item.isFolder).length;
  const folderCount = items.filter((item) => item.isFolder).length;

  const getDescription = () => {
    const parts: string[] = [];
    if (fileCount > 0) {
      parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
    }
    if (folderCount > 0) {
      parts.push(`${folderCount} folder${folderCount > 1 ? "s" : ""}`);
    }
    return parts.join(" and ");
  };

  const itemNames =
    items.length <= 5
      ? items.map((item) => item.name)
      : [...items.slice(0, 4).map((item) => item.name), `and ${items.length - 4} more...`];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {items.length === 1 ? `"${items[0].name}"` : `${items.length} items`}?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              You are about to delete {getDescription()}. This action cannot be undone.
            </p>
            {items.length > 1 && items.length <= 5 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {itemNames.map((name, index) => (
                  <li key={index} className="text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            )}
            {items.length > 5 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {itemNames.map((name, index) => (
                  <li key={index} className="text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            )}
            {folderCount > 0 && (
              <p className="mt-2 text-amber-500 dark:text-amber-400 text-sm font-medium">
                Warning: Folders will be deleted with all their contents.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
