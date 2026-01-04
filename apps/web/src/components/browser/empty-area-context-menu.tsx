import { FolderPlus, ClipboardPaste } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface EmptyAreaContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCreateFolder: () => void;
  onPaste: () => void;
  hasClipboard: boolean;
  clipboardOperation?: "copy" | "cut";
  clipboardCount?: number;
}

export function EmptyAreaContextMenu({
  x,
  y,
  onClose,
  onCreateFolder,
  onPaste,
  hasClipboard,
  clipboardOperation,
  clipboardCount,
}: EmptyAreaContextMenuProps) {
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

  const disabledItemClass = cn(
    "relative flex w-full cursor-default select-none items-center gap-2 rounded-none px-2 py-2 text-xs outline-none",
    "text-muted-foreground opacity-50 cursor-not-allowed",
    "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  );

  const getPasteLabel = () => {
    if (!hasClipboard) return "Paste";
    const action = clipboardOperation === "cut" ? "Move" : "Paste";
    const count = clipboardCount && clipboardCount > 1 ? ` (${clipboardCount})` : "";
    return `${action}${count}`;
  };

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
      {/* Paste */}
      <button
        type="button"
        onClick={() => hasClipboard && handleAction(onPaste)}
        className={hasClipboard ? menuItemClass : disabledItemClass}
        role="menuitem"
        disabled={!hasClipboard}
      >
        <ClipboardPaste />
        <span>{getPasteLabel()}</span>
      </button>

      <div className="h-px bg-border my-1" />

      {/* New Folder */}
      <button
        type="button"
        onClick={() => handleAction(onCreateFolder)}
        className={menuItemClass}
        role="menuitem"
      >
        <FolderPlus />
        <span>New Folder</span>
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
