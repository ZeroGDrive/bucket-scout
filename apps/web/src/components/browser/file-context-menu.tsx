import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface FileContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
  selectedCount: number;
}

export function FileContextMenu({
  x,
  y,
  onClose,
  onDelete,
  selectedCount,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust if menu would overflow right edge
      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${viewportWidth - rect.width - 8}px`;
      }

      // Adjust if menu would overflow bottom edge
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${viewportHeight - rect.height - 8}px`;
      }
    }
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Add listener after a short delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  // Using shadcn context-menu styles
  const menu = (
    <div
      ref={menuRef}
      className={cn(
        "fixed z-50 min-w-36 ring-foreground/10 bg-popover text-popover-foreground rounded-none shadow-md ring-1",
        "animate-in fade-in-0 zoom-in-95"
      )}
      style={{ left: x, top: y }}
      role="menu"
      aria-orientation="vertical"
    >
      <button
        type="button"
        onClick={handleDelete}
        className={cn(
          // Using shadcn ContextMenuItem destructive variant styles
          "relative flex w-full cursor-default select-none items-center gap-2 rounded-none px-2 py-2 text-xs outline-none",
          "text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive",
          "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
        )}
        role="menuitem"
      >
        <Trash2 />
        <span>
          Delete{selectedCount > 1 ? ` (${selectedCount} items)` : ""}
        </span>
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
