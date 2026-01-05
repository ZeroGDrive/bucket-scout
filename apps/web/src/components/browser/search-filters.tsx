import { useCallback, useMemo } from "react";
import { Filter, X, Calendar, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useBrowserStore } from "@/lib/store";
import { cn } from "@/lib/utils";

// Size presets in bytes
const SIZE_PRESETS = [
  { label: "Any", min: null, max: null },
  { label: "< 1 KB", min: null, max: 1024 },
  { label: "< 100 KB", min: null, max: 100 * 1024 },
  { label: "< 1 MB", min: null, max: 1024 * 1024 },
  { label: "< 10 MB", min: null, max: 10 * 1024 * 1024 },
  { label: "> 10 MB", min: 10 * 1024 * 1024, max: null },
  { label: "> 100 MB", min: 100 * 1024 * 1024, max: null },
  { label: "> 1 GB", min: 1024 * 1024 * 1024, max: null },
] as const;

// Date presets
const DATE_PRESETS = [
  { label: "Any time", from: null, to: null },
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 },
] as const;

function getDateFromDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${Math.round(size)} ${units[i]}`;
}

interface SearchFiltersProps {
  className?: string;
}

export function SearchFilters({ className }: SearchFiltersProps) {
  const filterMinSize = useBrowserStore((s) => s.filterMinSize);
  const filterMaxSize = useBrowserStore((s) => s.filterMaxSize);
  const filterDateFrom = useBrowserStore((s) => s.filterDateFrom);
  const filterDateTo = useBrowserStore((s) => s.filterDateTo);
  const setFilterMinSize = useBrowserStore((s) => s.setFilterMinSize);
  const setFilterMaxSize = useBrowserStore((s) => s.setFilterMaxSize);
  const setFilterDateFrom = useBrowserStore((s) => s.setFilterDateFrom);
  const setFilterDateTo = useBrowserStore((s) => s.setFilterDateTo);
  const clearFilters = useBrowserStore((s) => s.clearFilters);
  const hasActiveFilters = useBrowserStore((s) => s.hasActiveFilters);
  const selectedBucket = useBrowserStore((s) => s.selectedBucket);

  const isActive = hasActiveFilters();

  // Format active filters for display
  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];

    if (filterMinSize !== null || filterMaxSize !== null) {
      if (filterMinSize !== null && filterMaxSize !== null) {
        parts.push(`${formatBytes(filterMinSize)} - ${formatBytes(filterMaxSize)}`);
      } else if (filterMinSize !== null) {
        parts.push(`> ${formatBytes(filterMinSize)}`);
      } else if (filterMaxSize !== null) {
        parts.push(`< ${formatBytes(filterMaxSize)}`);
      }
    }

    if (filterDateFrom !== null) {
      const date = new Date(filterDateFrom);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        parts.push("Today");
      } else if (diffDays <= 7) {
        parts.push("Last 7 days");
      } else if (diffDays <= 30) {
        parts.push("Last 30 days");
      } else if (diffDays <= 90) {
        parts.push("Last 90 days");
      } else {
        parts.push("Last year");
      }
    }

    return parts.join(", ");
  }, [filterMinSize, filterMaxSize, filterDateFrom]);

  const handleSizePreset = useCallback(
    (preset: (typeof SIZE_PRESETS)[number]) => {
      setFilterMinSize(preset.min);
      setFilterMaxSize(preset.max);
    },
    [setFilterMinSize, setFilterMaxSize],
  );

  const handleDatePreset = useCallback(
    (preset: (typeof DATE_PRESETS)[number]) => {
      if ("days" in preset) {
        setFilterDateFrom(getDateFromDays(preset.days));
        setFilterDateTo(null);
      } else {
        setFilterDateFrom(preset.from);
        setFilterDateTo(preset.to);
      }
    },
    [setFilterDateFrom, setFilterDateTo],
  );

  const handleClearFilters = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  // Check which size preset is active
  const activeSizePreset = useMemo(() => {
    return SIZE_PRESETS.find(
      (preset) => preset.min === filterMinSize && preset.max === filterMaxSize,
    );
  }, [filterMinSize, filterMaxSize]);

  // Check which date preset is active
  const activeDatePreset = useMemo(() => {
    if (filterDateFrom === null && filterDateTo === null) {
      return DATE_PRESETS[0]; // "Any time"
    }

    for (const preset of DATE_PRESETS) {
      if ("days" in preset && filterDateFrom !== null) {
        const expectedDate = getDateFromDays(preset.days);
        // Compare dates (within a minute tolerance)
        const expected = new Date(expectedDate).getTime();
        const actual = new Date(filterDateFrom).getTime();
        if (Math.abs(expected - actual) < 60000) {
          return preset;
        }
      }
    }

    return null;
  }, [filterDateFrom, filterDateTo]);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={isActive ? "default" : "ghost"}
            size="icon-sm"
            disabled={!selectedBucket}
            title="Filters"
            className={cn(
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
              className,
            )}
          />
        }
      >
        <Filter className="h-4 w-4" />
        {isActive && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Filters</h4>
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </Button>
            )}
          </div>

          {/* Size filter */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <HardDrive className="h-3 w-3" />
              File size
            </Label>
            <div className="grid grid-cols-4 gap-1">
              {SIZE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant={activeSizePreset === preset ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSizePreset(preset)}
                  className="h-7 text-xs px-2"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator className="my-3" />

          {/* Date filter */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Modified date
            </Label>
            <div className="grid grid-cols-3 gap-1">
              {DATE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant={activeDatePreset === preset ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleDatePreset(preset)}
                  className="h-7 text-xs px-2"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom date range */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={filterDateFrom ? filterDateFrom.split("T")[0] : ""}
                onChange={(e) =>
                  setFilterDateFrom(e.target.value ? new Date(e.target.value).toISOString() : null)
                }
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={filterDateTo ? filterDateTo.split("T")[0] : ""}
                onChange={(e) =>
                  setFilterDateTo(e.target.value ? new Date(e.target.value).toISOString() : null)
                }
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Active filters summary */}
        {isActive && activeFilterSummary && (
          <>
            <Separator />
            <div className="px-3 py-2 bg-muted/50 text-xs text-muted-foreground">
              Active: {activeFilterSummary}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
