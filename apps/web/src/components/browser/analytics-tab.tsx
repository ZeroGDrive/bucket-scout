import { useState, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  HardDrive,
  FileStack,
  BarChart3,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useBucketAnalytics } from "@/lib/queries";
import { parseS3Error } from "@/lib/utils";
import { StorageDonutChart, FolderBarChart, LargeFilesTable } from "./analytics-charts";
import type { AnalyticsProgressPayload } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface AnalyticsTabProps {
  accountId: string;
  bucket: string;
}

// Loading State with Progress
function AnalyticsLoadingState({ progress }: { progress: AnalyticsProgressPayload | null }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h3 className="font-medium mb-1">Analyzing bucket contents...</h3>
        {progress ? (
          <p className="text-sm text-muted-foreground">
            Processed {progress.objectsProcessed.toLocaleString()} objects
            {progress.currentPrefix && (
              <span className="block text-xs mt-1 font-mono">
                {progress.currentPrefix}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">This may take a moment for large buckets</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// Error State
function AnalyticsErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h3 className="font-medium mb-1">Failed to load analytics</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">{parseS3Error(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

// Summary Card
function SummaryCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="p-4 rounded-xl border bg-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary border border-primary/10">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-lg font-semibold tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

// Chart Card Wrapper
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl border bg-card">
      <h4 className="text-sm font-medium mb-4">{title}</h4>
      {children}
    </div>
  );
}

export function AnalyticsTab({ accountId, bucket }: AnalyticsTabProps) {
  const [progress, setProgress] = useState<AnalyticsProgressPayload | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useBucketAnalytics(accountId, bucket);

  // Listen to analytics progress events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<AnalyticsProgressPayload>("analytics-progress", (event) => {
        setProgress(event.payload);
      });
    };

    if (isLoading || isFetching) {
      setupListener();
    }

    return () => {
      if (unlisten) {
        unlisten();
      }
      setProgress(null);
    };
  }, [isLoading, isFetching]);

  if (isLoading || (isFetching && !data)) {
    return <AnalyticsLoadingState progress={progress} />;
  }

  if (error) {
    return <AnalyticsErrorState error={error} onRetry={() => refetch()} />;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<HardDrive className="h-5 w-5" />}
          title="Total Size"
          value={formatBytes(data.totalSize)}
        />
        <SummaryCard
          icon={<FileStack className="h-5 w-5" />}
          title="Total Objects"
          value={data.totalObjects.toLocaleString()}
        />
        <SummaryCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Last Updated"
          value={formatRelativeTime(data.calculatedAt)}
          subtitle={new Date(data.calculatedAt).toLocaleString()}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Storage by File Type">
          <StorageDonutChart
            data={data.byContentType}
            type="contentType"
            totalSize={data.totalSize}
          />
        </ChartCard>
        <ChartCard title="Storage by Class">
          {data.byStorageClass.length > 0 ? (
            <StorageDonutChart
              data={data.byStorageClass}
              type="storageClass"
              totalSize={data.totalSize}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
              No storage class information available
            </div>
          )}
        </ChartCard>
      </div>

      {/* Folder Sizes */}
      {data.folders.length > 0 && (
        <ChartCard title="Top Folders by Size">
          <FolderBarChart data={data.folders} totalSize={data.totalSize} />
        </ChartCard>
      )}

      {/* Large Files Table */}
      <ChartCard title="Largest Files">
        <LargeFilesTable files={data.largestFiles} />
      </ChartCard>

      {/* Recalculate Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Calculating...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recalculate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
