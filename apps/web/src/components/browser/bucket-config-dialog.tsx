import { useState, useCallback, type KeyboardEvent, type ChangeEvent } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Settings2,
  Shield,
  Clock,
  FileText,
  AlertTriangle,
  Check,
  X,
  Loader2,
  Plus,
  Trash2,
  Globe,
  ChevronRight,
} from "lucide-react";
import {
  useBucketConfig,
  useSetBucketVersioning,
  useSetBucketCors,
  useDeleteBucketCors,
  useSetBucketLifecycle,
  useDeleteBucketLifecycle,
} from "@/lib/queries";
import { toast } from "sonner";
import { parseS3Error } from "@/lib/utils";
import type {
  CorsRuleConfig,
  BucketConfigSummary,
  LifecycleRuleConfig,
  ProviderType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ConfigTab = "overview" | "versioning" | "cors" | "lifecycle";

interface BucketConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  bucket: string;
  providerType?: ProviderType;
}

export function BucketConfigDialog({
  open,
  onOpenChange,
  accountId,
  bucket,
  providerType,
}: BucketConfigDialogProps) {
  // R2 doesn't support versioning
  const isR2 = providerType === "cloudflare_r2";
  const [activeTab, setActiveTab] = useState<ConfigTab>("overview");

  const { data, isLoading, error, refetch } = useBucketConfig(
    open ? accountId : null,
    open ? bucket : null,
  );

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setActiveTab("overview");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-4xl flex flex-col p-0 gap-0 overflow-hidden"
      >
        {/* Header with gradient accent */}
        <div className="relative border-b bg-gradient-to-b from-accent/30 to-transparent">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Settings2 className="h-4.5 w-4.5" />
              </div>
              Bucket Configuration
            </DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md border">
                {bucket}
              </span>
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Tab Navigation - Horizontally scrollable */}
        <div className="border-b bg-muted/30 overflow-x-auto scrollbar-thin">
          <div className="flex px-2 min-w-max">
            <TabButton
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              icon={<Settings2 className="h-3.5 w-3.5" />}
            >
              Overview
            </TabButton>
            <TabButton
              active={activeTab === "versioning"}
              onClick={() => setActiveTab("versioning")}
              icon={<Clock className="h-3.5 w-3.5" />}
            >
              Versioning
            </TabButton>
            <TabButton
              active={activeTab === "cors"}
              onClick={() => setActiveTab("cors")}
              icon={<Globe className="h-3.5 w-3.5" />}
            >
              CORS
            </TabButton>
            <TabButton
              active={activeTab === "lifecycle"}
              onClick={() => setActiveTab("lifecycle")}
              icon={<FileText className="h-3.5 w-3.5" />}
            >
              Lifecycle
            </TabButton>
          </div>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            {isLoading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState error={error} onRetry={() => refetch()} />
            ) : data ? (
              <>
                {activeTab === "overview" && (
                  <OverviewTab config={data} onNavigate={setActiveTab} isR2={isR2} />
                )}
                {activeTab === "versioning" && (
                  <VersioningTab config={data} accountId={accountId} bucket={bucket} isR2={isR2} />
                )}
                {activeTab === "cors" && (
                  <CorsTab config={data} accountId={accountId} bucket={bucket} />
                )}
                {activeTab === "lifecycle" && (
                  <LifecycleTab config={data} accountId={accountId} bucket={bucket} />
                )}
              </>
            ) : null}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="border-t px-6 py-4 bg-muted/20">
          <DialogClose render={<Button variant="outline" className="min-w-[100px]" />}>
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tab Button Component
function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all duration-200 relative",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active ? "text-foreground" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  );
}

// Loading State
function LoadingState() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

// Error State
function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h3 className="font-medium mb-1">Failed to load configuration</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">{parseS3Error(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

// Status Badge Component
function StatusBadge({
  enabled,
  enabledText = "Enabled",
  disabledText = "Disabled",
}: {
  enabled: boolean;
  enabledText?: string;
  disabledText?: string;
}) {
  return (
    <Badge
      variant={enabled ? "default" : "secondary"}
      className={cn(
        "gap-1 font-medium",
        enabled
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          : "bg-muted text-muted-foreground",
      )}
    >
      {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {enabled ? enabledText : disabledText}
    </Badge>
  );
}

// Config Card Component
function ConfigCard({
  icon,
  title,
  description,
  status,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  status?: React.ReactNode;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border bg-card transition-all duration-200",
        onClick &&
          "hover:border-primary/30 hover:shadow-sm hover:bg-accent/30 cursor-pointer group",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary border border-primary/10">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-sm">{title}</h4>
            <div className="flex items-center gap-2">
              {status}
              {onClick && (
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          )}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </Wrapper>
  );
}

// Overview Tab
function OverviewTab({
  config,
  onNavigate,
  isR2,
}: {
  config: BucketConfigSummary;
  onNavigate: (tab: ConfigTab) => void;
  isR2: boolean;
}) {
  const versioningEnabled = config.versioning.status === "Enabled";
  // R2 doesn't support versioning at all
  const versioningUnsupported = isR2 || config.versioning.status === "Unsupported";
  const corsEnabled = config.cors.rules.length > 0;
  const lifecycleEnabled = config.lifecycle.rules.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Quick overview of your bucket settings. Click any card to configure.
      </p>

      <ConfigCard
        icon={<Clock className="h-5 w-5" />}
        title="Versioning"
        description={
          versioningUnsupported
            ? "Not supported by this provider"
            : versioningEnabled
              ? "Keep multiple versions of objects for recovery"
              : "Enable to preserve object history"
        }
        status={
          versioningUnsupported ? (
            <Badge variant="secondary" className="gap-1 font-medium bg-muted text-muted-foreground">
              Unsupported
            </Badge>
          ) : (
            <StatusBadge enabled={versioningEnabled} />
          )
        }
        onClick={versioningUnsupported ? undefined : () => onNavigate("versioning")}
      />

      <ConfigCard
        icon={<Globe className="h-5 w-5" />}
        title="CORS"
        description={
          corsEnabled
            ? `${config.cors.rules.length} rule${config.cors.rules.length > 1 ? "s" : ""} configured`
            : "Allow cross-origin requests to your bucket"
        }
        status={
          <StatusBadge
            enabled={corsEnabled}
            enabledText={`${config.cors.rules.length} Rule${config.cors.rules.length > 1 ? "s" : ""}`}
            disabledText="None"
          />
        }
        onClick={() => onNavigate("cors")}
      />

      <ConfigCard
        icon={<FileText className="h-5 w-5" />}
        title="Lifecycle Rules"
        description={
          lifecycleEnabled
            ? `${config.lifecycle.rules.length} rule${config.lifecycle.rules.length > 1 ? "s" : ""} managing object lifecycle`
            : "Automate object transitions and deletions"
        }
        status={
          <StatusBadge
            enabled={lifecycleEnabled}
            enabledText={`${config.lifecycle.rules.length} Rule${config.lifecycle.rules.length > 1 ? "s" : ""}`}
            disabledText="None"
          />
        }
        onClick={() => onNavigate("lifecycle")}
      />
    </div>
  );
}

// Versioning Tab
function VersioningTab({
  config,
  accountId,
  bucket,
  isR2,
}: {
  config: BucketConfigSummary;
  accountId: string;
  bucket: string;
  isR2: boolean;
}) {
  const setVersioningMutation = useSetBucketVersioning();
  const isEnabled = config.versioning.status === "Enabled";
  const isSuspended = config.versioning.status === "Suspended";
  // R2 doesn't support versioning at all
  const isUnsupported = isR2 || config.versioning.status === "Unsupported";

  const handleToggle = async () => {
    const newEnabled = !isEnabled;
    try {
      await setVersioningMutation.mutateAsync({
        accountId,
        bucket,
        enabled: newEnabled,
      });
      toast.success(newEnabled ? "Versioning enabled" : "Versioning suspended");
    } catch (err) {
      toast.error("Failed to update versioning", {
        description: parseS3Error(err),
      });
    }
  };

  if (isUnsupported) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <h3 className="font-medium mb-1">Versioning Not Supported</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          This storage provider does not support bucket versioning through the S3 API.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="p-5 rounded-xl border-2 border-dashed bg-gradient-to-br from-card to-accent/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                isEnabled
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">
                {isEnabled
                  ? "Versioning Enabled"
                  : isSuspended
                    ? "Versioning Suspended"
                    : "Versioning Disabled"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isEnabled
                  ? "New object versions are being preserved"
                  : isSuspended
                    ? "Existing versions preserved, new versions not created"
                    : "Enable to keep multiple versions of objects"}
              </p>
            </div>
          </div>
          <Button
            variant={isEnabled ? "outline" : "default"}
            onClick={handleToggle}
            disabled={setVersioningMutation.isPending}
            className="min-w-[100px]"
          >
            {setVersioningMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isEnabled ? (
              "Suspend"
            ) : (
              "Enable"
            )}
          </Button>
        </div>
      </div>

      {/* Info Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          About Versioning
        </h4>
        <div className="grid gap-3 text-sm">
          <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
            <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <p>Preserve, retrieve, and restore every version of every object</p>
          </div>
          <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
            <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <p>Recover from unintended user actions and application failures</p>
          </div>
          <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p>Once enabled, versioning cannot be fully disabled, only suspended</p>
          </div>
        </div>
      </div>

      {config.versioning.mfaDelete && (
        <div className="p-3 rounded-lg border bg-amber-500/5 border-amber-500/20">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-amber-600" />
            <span className="font-medium">MFA Delete:</span>
            <Badge variant="secondary">{config.versioning.mfaDelete}</Badge>
          </div>
        </div>
      )}
    </div>
  );
}

// CORS Tab
function CorsTab({
  config,
  accountId,
  bucket,
}: {
  config: BucketConfigSummary;
  accountId: string;
  bucket: string;
}) {
  const [localRules, setLocalRules] = useState<CorsRuleConfig[]>(config.cors.rules);
  const [hasChanges, setHasChanges] = useState(false);

  const setCors = useSetBucketCors();
  const deleteCors = useDeleteBucketCors();

  const handleAddRule = () => {
    setLocalRules([
      ...localRules,
      {
        allowedOrigins: ["*"],
        allowedMethods: ["GET"],
        allowedHeaders: ["*"],
        exposeHeaders: [],
        maxAgeSeconds: 3600,
      },
    ]);
    setHasChanges(true);
  };

  const handleRemoveRule = (index: number) => {
    setLocalRules(localRules.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      if (localRules.length === 0) {
        await deleteCors.mutateAsync({ accountId, bucket });
        toast.success("CORS configuration removed");
      } else {
        await setCors.mutateAsync({ accountId, bucket, rules: localRules });
        toast.success("CORS configuration saved");
      }
      setHasChanges(false);
    } catch (err) {
      toast.error("Failed to save CORS configuration", {
        description: parseS3Error(err),
      });
    }
  };

  const isPending = setCors.isPending || deleteCors.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">CORS Rules</h4>
          <p className="text-sm text-muted-foreground">
            Configure cross-origin resource sharing for browser access
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddRule}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Rule
        </Button>
      </div>

      {localRules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl">
          <Globe className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="font-medium mb-1">No CORS Rules</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Add a rule to allow web browsers to access your bucket
          </p>
          <Button variant="outline" size="sm" onClick={handleAddRule}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add First Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {localRules.map((rule, index) => (
            <CorsRuleCard
              key={index}
              rule={rule}
              index={index}
              onChange={(newRule) => {
                const updated = [...localRules];
                updated[index] = newRule;
                setLocalRules(updated);
                setHasChanges(true);
              }}
              onRemove={() => handleRemoveRule(index)}
            />
          ))}
        </div>
      )}

      {hasChanges && (
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              setLocalRules(config.cors.rules);
              setHasChanges(false);
            }}
          >
            Reset
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// Comma-separated input with smart backspace handling
// When pressing backspace after ", " it deletes the comma as well
function CommaSeparatedInput({
  value,
  onChange,
  transform,
  placeholder,
  className,
}: {
  value: string[];
  onChange: (values: string[]) => void;
  transform?: (value: string) => string;
  placeholder?: string;
  className?: string;
}) {
  const displayValue = value.join(", ");

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      const values = newValue.split(",").map((s) => {
        const trimmed = s.trim();
        return transform ? transform(trimmed) : trimmed;
      });
      onChange(values);
    },
    [onChange, transform],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        const input = e.currentTarget;
        const cursorPos = input.selectionStart ?? 0;
        const val = input.value;

        // Check if cursor is right after ", " (comma + space)
        // Delete ", " together when backspacing from the space
        if (cursorPos >= 2 && val.slice(cursorPos - 2, cursorPos) === ", ") {
          e.preventDefault();
          const newValue = val.slice(0, cursorPos - 2) + val.slice(cursorPos);
          const values = newValue.split(",").map((s) => {
            const trimmed = s.trim();
            return transform ? transform(trimmed) : trimmed;
          });
          onChange(values);

          // Set cursor position after React re-renders
          requestAnimationFrame(() => {
            input.setSelectionRange(cursorPos - 2, cursorPos - 2);
          });
        }
      }
    },
    [onChange, transform],
  );

  return (
    <Input
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
    />
  );
}

// CORS Rule Card
function CorsRuleCard({
  rule,
  index,
  onChange,
  onRemove,
}: {
  rule: CorsRuleConfig;
  index: number;
  onChange: (rule: CorsRuleConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border bg-card">
      <div className="flex items-center justify-between mb-4">
        <Badge variant="secondary" className="font-mono text-xs">
          Rule {index + 1}
        </Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Allowed Origins</Label>
          <CommaSeparatedInput
            value={rule.allowedOrigins}
            onChange={(allowedOrigins) => onChange({ ...rule, allowedOrigins })}
            placeholder="*, https://example.com"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Allowed Methods</Label>
          <CommaSeparatedInput
            value={rule.allowedMethods}
            onChange={(allowedMethods) => onChange({ ...rule, allowedMethods })}
            transform={(v) => v.toUpperCase()}
            placeholder="GET, PUT, POST, DELETE"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Allowed Headers</Label>
          <CommaSeparatedInput
            value={rule.allowedHeaders}
            onChange={(allowedHeaders) => onChange({ ...rule, allowedHeaders })}
            placeholder="*, Content-Type"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Max Age (seconds)</Label>
          <Input
            type="number"
            value={rule.maxAgeSeconds || ""}
            onChange={(e) =>
              onChange({
                ...rule,
                maxAgeSeconds: e.target.value ? parseInt(e.target.value, 10) : undefined,
              })
            }
            placeholder="3600"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>
    </div>
  );
}

// Lifecycle Tab
function LifecycleTab({
  config,
  accountId,
  bucket,
}: {
  config: BucketConfigSummary;
  accountId: string;
  bucket: string;
}) {
  const [localRules, setLocalRules] = useState<LifecycleRuleConfig[]>(config.lifecycle.rules);
  const [hasChanges, setHasChanges] = useState(false);

  const setLifecycle = useSetBucketLifecycle();
  const deleteLifecycle = useDeleteBucketLifecycle();

  const handleAddRule = () => {
    const newRule: LifecycleRuleConfig = {
      id: `rule-${Date.now()}`,
      status: "Enabled",
      prefix: undefined,
      expirationDays: 30,
      noncurrentVersionExpirationDays: undefined,
      abortIncompleteMultipartUploadDays: 7,
      transitions: [],
    };
    setLocalRules([...localRules, newRule]);
    setHasChanges(true);
  };

  const handleRemoveRule = (index: number) => {
    setLocalRules(localRules.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      if (localRules.length === 0) {
        await deleteLifecycle.mutateAsync({ accountId, bucket });
        toast.success("Lifecycle rules removed");
      } else {
        await setLifecycle.mutateAsync({ accountId, bucket, rules: localRules });
        toast.success("Lifecycle rules saved");
      }
      setHasChanges(false);
    } catch (err) {
      toast.error("Failed to save lifecycle rules", {
        description: parseS3Error(err),
      });
    }
  };

  const isPending = setLifecycle.isPending || deleteLifecycle.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Lifecycle Rules</h4>
          <p className="text-sm text-muted-foreground">Automate object expiration and cleanup</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddRule}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Rule
        </Button>
      </div>

      {localRules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="font-medium mb-1">No Lifecycle Rules</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Add a rule to automatically expire or clean up objects
          </p>
          <Button variant="outline" size="sm" onClick={handleAddRule}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add First Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {localRules.map((rule, index) => (
            <LifecycleRuleCard
              key={rule.id || index}
              rule={rule}
              index={index}
              onChange={(newRule) => {
                const updated = [...localRules];
                updated[index] = newRule;
                setLocalRules(updated);
                setHasChanges(true);
              }}
              onRemove={() => handleRemoveRule(index)}
            />
          ))}
        </div>
      )}

      {hasChanges && (
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              setLocalRules(config.lifecycle.rules);
              setHasChanges(false);
            }}
          >
            Reset
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// Lifecycle Rule Card
function LifecycleRuleCard({
  rule,
  index,
  onChange,
  onRemove,
}: {
  rule: LifecycleRuleConfig;
  index: number;
  onChange: (rule: LifecycleRuleConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border bg-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {rule.id || `Rule ${index + 1}`}
          </Badge>
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              onChange({ ...rule, status: rule.status === "Enabled" ? "Disabled" : "Enabled" })
            }
            className={cn(
              "h-6 text-xs",
              rule.status === "Enabled"
                ? "text-emerald-600 hover:text-emerald-700"
                : "text-muted-foreground",
            )}
          >
            {rule.status === "Enabled" ? (
              <>
                <Check className="h-3 w-3 mr-1" /> Enabled
              </>
            ) : (
              <>
                <X className="h-3 w-3 mr-1" /> Disabled
              </>
            )}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Rule ID</Label>
          <Input
            value={rule.id || ""}
            onChange={(e) => onChange({ ...rule, id: e.target.value || undefined })}
            placeholder="my-expiration-rule"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Prefix Filter (optional)</Label>
          <Input
            value={rule.prefix || ""}
            onChange={(e) => onChange({ ...rule, prefix: e.target.value || undefined })}
            placeholder="logs/, temp/"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Expire Objects After (days)</Label>
          <Input
            type="number"
            value={rule.expirationDays || ""}
            onChange={(e) =>
              onChange({
                ...rule,
                expirationDays: e.target.value ? parseInt(e.target.value, 10) : undefined,
              })
            }
            placeholder="30"
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Abort Incomplete Uploads After (days)
          </Label>
          <Input
            type="number"
            value={rule.abortIncompleteMultipartUploadDays || ""}
            onChange={(e) =>
              onChange({
                ...rule,
                abortIncompleteMultipartUploadDays: e.target.value
                  ? parseInt(e.target.value, 10)
                  : undefined,
              })
            }
            placeholder="7"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>
    </div>
  );
}
