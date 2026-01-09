import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronRight, Home, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useBrowserStore, useDragState } from "@/lib/store";

interface ResponsiveBreadcrumbProps {
  bucket: string | null;
  path: string[];
  onNavigate: (index: number) => void;
  onDrop?: (targetPrefix: string, keys: string[]) => void;
}

// Minimum width for each visible segment (approx characters * avg char width + padding)
const MIN_SEGMENT_WIDTH = 80;
// Width of home button + chevron
const HOME_WIDTH = 50;
// Width of ellipsis button + chevron
const ELLIPSIS_WIDTH = 50;
// Width of chevron separator
const CHEVRON_WIDTH = 20;

// Custom drag data type marker for internal drags
const INTERNAL_DRAG_TYPE = "application/x-bucketscout-items";

export function ResponsiveBreadcrumb({
  bucket,
  path,
  onNavigate,
  onDrop,
}: ResponsiveBreadcrumbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxVisibleSegments, setMaxVisibleSegments] = useState(10);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Get drag state from store (for Tauri compatibility)
  const dragState = useDragState();

  // Calculate how many segments we can show based on available width
  const calculateVisibleSegments = useCallback(() => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;

    // Total segments = bucket + path segments
    const totalSegments = (bucket ? 1 : 0) + path.length;

    if (totalSegments === 0) {
      setMaxVisibleSegments(10);
      return;
    }

    // Available width after home button
    let availableWidth = containerWidth - HOME_WIDTH;

    // If we have segments, calculate how many fit
    // Each visible segment needs: chevron + button
    const segmentWidth = MIN_SEGMENT_WIDTH + CHEVRON_WIDTH;

    // Calculate max segments that fit
    let visibleCount = Math.floor(availableWidth / segmentWidth);

    // If we need to collapse, account for ellipsis button
    if (visibleCount < totalSegments && visibleCount > 0) {
      availableWidth -= ELLIPSIS_WIDTH;
      visibleCount = Math.max(1, Math.floor(availableWidth / segmentWidth));
    }

    // Always show at least 1 segment (the current folder)
    setMaxVisibleSegments(Math.max(1, visibleCount));
  }, [bucket, path.length]);

  // Use ResizeObserver to track container width changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleSegments();
    });

    resizeObserver.observe(container);
    calculateVisibleSegments();

    return () => resizeObserver.disconnect();
  }, [calculateVisibleSegments]);

  // Recalculate when path changes
  useEffect(() => {
    calculateVisibleSegments();
  }, [path, bucket, calculateVisibleSegments]);

  // Get prefix for a segment index (-1 = root, 0 = first folder, etc.)
  const getPrefixForIndex = useCallback(
    (index: number): string => {
      if (index < 0) return ""; // Root
      return path.slice(0, index + 1).join("/") + "/";
    },
    [path],
  );

  // Drag enter handler
  const handleDragEnter = useCallback(
    (e: React.DragEvent, segmentIndex: number) => {
      if (!onDrop) return;

      // Check for internal drag via dataTransfer or store state
      const isInternalDrag =
        e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE) ||
        dragState !== null ||
        useBrowserStore.getState().dragState !== null;
      if (!isInternalDrag) return;

      e.preventDefault();
      e.stopPropagation();
      setDropTargetIndex(segmentIndex);
    },
    [onDrop, dragState],
  );

  // Drag over handler
  const handleDragOver = useCallback(
    (e: React.DragEvent, segmentIndex: number) => {
      if (!onDrop) return;

      // Check for internal drag via dataTransfer or store state
      const isInternalDrag =
        e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE) ||
        dragState !== null ||
        useBrowserStore.getState().dragState !== null;
      if (!isInternalDrag) return;

      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropTargetIndex(segmentIndex);
    },
    [onDrop, dragState],
  );

  // Drag leave handler
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only clear if we're actually leaving the element (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    setDropTargetIndex(null);
  }, []);

  // Drop handler
  const handleDrop = useCallback(
    (e: React.DragEvent, segmentIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTargetIndex(null);

      if (!onDrop) return;

      // Get keys from dataTransfer or fall back to store state
      const data = e.dataTransfer.getData(INTERNAL_DRAG_TYPE);
      let keys: string[] | null = null;

      if (data) {
        keys = JSON.parse(data);
      } else {
        const currentDragState = useBrowserStore.getState().dragState ?? dragState;
        if (currentDragState) {
          keys = currentDragState.keys;
        }
      }

      if (!keys || keys.length === 0) return;

      const targetPrefix = getPrefixForIndex(segmentIndex);
      onDrop(targetPrefix, keys);
    },
    [onDrop, getPrefixForIndex, dragState],
  );

  // Build the segments array: bucket + path folders
  const allSegments = [
    ...(bucket ? [{ name: bucket, index: -1, isBucket: true }] : []),
    ...path.map((folder, idx) => ({ name: folder, index: idx, isBucket: false })),
  ];

  // Determine which segments to show and which to collapse
  const shouldCollapse = allSegments.length > maxVisibleSegments;

  let visibleSegments: typeof allSegments;
  let collapsedSegments: typeof allSegments = [];

  if (shouldCollapse && maxVisibleSegments > 0) {
    // Always show first segment (bucket) and last N-1 segments
    const firstSegment = allSegments[0];
    const lastSegments = allSegments.slice(-(maxVisibleSegments - 1));
    collapsedSegments = allSegments.slice(1, -(maxVisibleSegments - 1));

    // If collapsed is empty but we still need to collapse, adjust
    if (collapsedSegments.length === 0 && allSegments.length > maxVisibleSegments) {
      // Just show last maxVisibleSegments
      visibleSegments = allSegments.slice(-maxVisibleSegments);
      collapsedSegments = allSegments.slice(0, -maxVisibleSegments);
    } else {
      visibleSegments = [firstSegment, ...lastSegments];
    }
  } else {
    visibleSegments = allSegments;
  }

  return (
    <nav
      ref={containerRef}
      className="flex items-center gap-0.5 text-sm min-w-0 flex-1 overflow-hidden"
    >
      {/* Home button - drop target for root */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 px-2 text-muted-foreground hover:text-foreground shrink-0",
          dropTargetIndex === -1 && "bg-primary/10 ring-2 ring-primary",
        )}
        onClick={() => onNavigate(-1)}
        disabled={!bucket}
        data-drop-prefix=""
        onDragEnter={(e) => handleDragEnter(e, -1)}
        onDragOver={(e) => handleDragOver(e, -1)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, -1)}
      >
        <Home className="h-3.5 w-3.5" />
      </Button>

      {/* Collapsed segments dropdown */}
      {collapsedSegments.length > 0 && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-muted-foreground hover:text-foreground shrink-0"
                />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
              {collapsedSegments.map((segment) => (
                <DropdownMenuItem
                  key={`${segment.isBucket ? "bucket" : segment.index}`}
                  onClick={() => onNavigate(segment.index)}
                  className="max-w-[250px]"
                >
                  <span className="truncate">{segment.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Visible segments */}
      {visibleSegments.map((segment, idx) => {
        const isLast = idx === visibleSegments.length - 1;
        const isFirst = idx === 0 && collapsedSegments.length === 0;
        const isDropTarget = dropTargetIndex === segment.index;

        return (
          <div
            key={`${segment.isBucket ? "bucket" : segment.index}`}
            className="flex items-center gap-0.5 min-w-0"
          >
            {/* Don't show chevron for first visible segment if no collapsed segments */}
            {!(isFirst && collapsedSegments.length === 0) && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            )}
            {/* Show chevron for first segment when there are collapsed segments */}
            {isFirst && collapsedSegments.length > 0 && null}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 min-w-0",
                isLast
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                isDropTarget && "bg-primary/10 ring-2 ring-primary",
              )}
              onClick={() => onNavigate(segment.index)}
              data-drop-prefix={getPrefixForIndex(segment.index)}
              onDragEnter={(e) => handleDragEnter(e, segment.index)}
              onDragOver={(e) => handleDragOver(e, segment.index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, segment.index)}
            >
              <span className="truncate max-w-[120px]">{segment.name}</span>
            </Button>
          </div>
        );
      })}
    </nav>
  );
}
