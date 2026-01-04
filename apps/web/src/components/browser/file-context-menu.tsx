import { Trash2, Pencil, Copy, Scissors, Link, Download } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface FileContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
  onCopy: () => void;
  onCut: () => void;
  onShare: () => void;
  onDownload: () => void;
  selectedCount: number;
  isFolder: boolean;
}

export function FileContextMenu({
  x,
  y,
  onClose,
  onDelete,
  onRename,
  onCopy,
  onCut,
  onShare,
  onDownload,
  selectedCount,
  isFolder,
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

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const menuItemClass = cn(
    "relative flex w-full cursor-default select-none items-center gap-2 rounded-none px-2 py-2 text-xs outline-none",
    "hover:bg-accent focus:bg-accent",
    "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  );

  const destructiveItemClass = cn(
    "relative flex w-full cursor-default select-none items-center gap-2 rounded-none px-2 py-2 text-xs outline-none",
    "text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive",
    "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  );

  const separatorClass = "h-px bg-border my-1";

  // Using shadcn context-menu styles
  const menu = (
    <div
      ref={menuRef}
      className={cn(
        "fixed z-50 min-w-40 ring-foreground/10 bg-popover text-popover-foreground rounded-none shadow-md ring-1",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{ left: x, top: y }}
      role="menu"
      aria-orientation="vertical"
    >
      {/* Rename - only for single selection */}
      {selectedCount === 1 && (
        <button
          type="button"
          onClick={() => handleAction(onRename)}
          className={menuItemClass}
          role="menuitem"
        >
          <Pencil />
          <span>Rename</span>
        </button>
      )}

      {/* Copy */}
      <button
        type="button"
        onClick={() => handleAction(onCopy)}
        className={menuItemClass}
        role="menuitem"
      >
        <Copy />
        <span>Copy{selectedCount > 1 ? ` (${selectedCount})` : ""}</span>
      </button>

      {/* Cut */}
      <button
        type="button"
        onClick={() => handleAction(onCut)}
        className={menuItemClass}
        role="menuitem"
      >
        <Scissors />
        <span>Cut{selectedCount > 1 ? ` (${selectedCount})` : ""}</span>
      </button>

      <div className={separatorClass} />

      {/* Download */}
      <button
        type="button"
        onClick={() => handleAction(onDownload)}
        className={menuItemClass}
        role="menuitem"
      >
        <Download />
        <span>Download{selectedCount > 1 ? ` (${selectedCount})` : ""}</span>
      </button>

      {/* Share - only for single file (not folder) */}
      {selectedCount === 1 && !isFolder && (
        <>
          <div className={separatorClass} />
          <button
            type="button"
            onClick={() => handleAction(onShare)}
            className={menuItemClass}
            role="menuitem"
          >
            <Link />
            <span>Get Shareable Link</span>
          </button>
        </>
      )}

      {/* Delete */}
      <div className={separatorClass} />
      <button
        type="button"
        onClick={() => handleAction(onDelete)}
        className={destructiveItemClass}
        role="menuitem"
      >
        <Trash2 />
        <span>Delete{selectedCount > 1 ? ` (${selectedCount})` : ""}</span>
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
