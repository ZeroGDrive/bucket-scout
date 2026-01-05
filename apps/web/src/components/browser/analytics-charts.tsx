import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ContentTypeStats, StorageClassStats, FolderStats, LargeFile } from "@/lib/types";

// Chart color palette - using HSL values that work with dark/light mode
const CHART_COLORS = [
  "hsl(220, 70%, 50%)", // Blue
  "hsl(160, 60%, 45%)", // Teal
  "hsl(30, 80%, 55%)", // Orange
  "hsl(280, 60%, 55%)", // Purple
  "hsl(350, 70%, 55%)", // Red
  "hsl(45, 80%, 50%)", // Yellow
  "hsl(190, 70%, 50%)", // Cyan
  "hsl(320, 60%, 55%)", // Pink
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatPercentage(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { name: string; size: number; count: number };
  }>;
  total: number;
}

function CustomTooltip({ active, payload, total }: ChartTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground">
        {formatBytes(data.size)} ({formatPercentage(data.size, total)})
      </p>
      <p className="text-muted-foreground">
        {data.count.toLocaleString()} {data.count === 1 ? "file" : "files"}
      </p>
    </div>
  );
}

interface StorageDonutChartProps {
  data: ContentTypeStats[] | StorageClassStats[];
  type: "contentType" | "storageClass";
  totalSize: number;
}

export function StorageDonutChart({ data, type, totalSize }: StorageDonutChartProps) {
  const chartData = data.map((item, index) => ({
    name: type === "contentType" ? (item as ContentTypeStats).contentType : (item as StorageClassStats).storageClass,
    size: item.size,
    count: item.objectCount,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="size"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip total={totalSize} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 justify-center">
        {chartData.map((item, index) => (
          <div key={index} className="flex items-center gap-1.5 text-xs">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.fill }}
            />
            <span className="text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FolderBarChartProps {
  data: FolderStats[];
  totalSize: number;
}

export function FolderBarChart({ data, totalSize }: FolderBarChartProps) {
  const chartData = data.map((folder) => ({
    name: folder.name || "(root)",
    size: folder.size,
    count: folder.objectCount,
    prefix: folder.prefix,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-muted-foreground">
        No folders found
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 35)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
        <XAxis type="number" tickFormatter={(value) => formatBytes(value)} />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => value.length > 12 ? value.slice(0, 12) + "..." : value}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const data = payload[0].payload;
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                <p className="font-medium">{data.name}</p>
                <p className="text-muted-foreground">
                  {formatBytes(data.size)} ({formatPercentage(data.size, totalSize)})
                </p>
                <p className="text-muted-foreground">
                  {data.count.toLocaleString()} files
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="size" fill="hsl(220, 70%, 50%)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface LargeFilesTableProps {
  files: LargeFile[];
}

export function LargeFilesTable({ files }: LargeFilesTableProps) {
  if (files.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-muted-foreground">
        No files found
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
        <div>File</div>
        <div className="text-right w-20">Size</div>
        <div className="text-right w-24 hidden sm:block">Class</div>
      </div>
      {/* Rows */}
      <div className="divide-y">
        {files.slice(0, 10).map((file, index) => {
          const fileName = file.key.split("/").pop() || file.key;
          const folderPath = file.key.includes("/")
            ? file.key.substring(0, file.key.lastIndexOf("/"))
            : "";
          return (
            <div key={index} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-sm hover:bg-muted/30">
              <div className="min-w-0">
                <div className="font-medium truncate" title={fileName}>
                  {fileName}
                </div>
                {folderPath && (
                  <div className="text-xs text-muted-foreground truncate" title={folderPath}>
                    {folderPath}
                  </div>
                )}
              </div>
              <div className="text-right font-mono text-xs w-20">
                {formatBytes(file.size)}
              </div>
              <div className="text-right text-muted-foreground text-xs w-24 hidden sm:block">
                {file.storageClass || "STANDARD"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
