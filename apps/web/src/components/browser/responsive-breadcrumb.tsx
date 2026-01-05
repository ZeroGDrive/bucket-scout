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

interface ResponsiveBreadcrumbProps {
  bucket: string | null;
  path: string[];
  onNavigate: (index: number) => void;
}

// Minimum width for each visible segment (approx characters * avg char width + padding)
const MIN_SEGMENT_WIDTH = 80;
// Width of home button + chevron
const HOME_WIDTH = 50;
// Width of ellipsis button + chevron
const ELLIPSIS_WIDTH = 50;
// Width of chevron separator
const CHEVRON_WIDTH = 20;

export function ResponsiveBreadcrumb({
  bucket,
  path,
  onNavigate,
}: ResponsiveBreadcrumbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxVisibleSegments, setMaxVisibleSegments] = useState(10);

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
      {/* Home button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-muted-foreground hover:text-foreground shrink-0"
        onClick={() => onNavigate(-1)}
        disabled={!bucket}
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
              )}
              onClick={() => onNavigate(segment.index)}
            >
              <span className="truncate max-w-[120px]">{segment.name}</span>
            </Button>
          </div>
        );
      })}
    </nav>
  );
}
