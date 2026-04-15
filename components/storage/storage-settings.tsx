"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "sonner";
import { Loader, CheckCircle2, XCircle } from "lucide-react";

type Provider = "github" | "cloudflare-r2" | "aws-s3";

interface StorageData {
  provider: Provider;
  bucket: string | null;
  accountId: string | null;
  publicUrl: string | null;
  region: string | null;
  endpoint: string | null;
  hasCredentials: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
}

export function StorageSettings() {
  const { config } = useConfig();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const [provider, setProvider] = useState<Provider>("github");
  const [bucket, setBucket] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [region, setRegion] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [hasCredentials, setHasCredentials] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/${config.owner}/${config.repo}/storage`);
      const json = await res.json();
      if (json.status === "success" && json.data) {
        const d: StorageData = json.data;
        setProvider(d.provider);
        setBucket(d.bucket ?? "");
        setAccountId(d.accountId ?? "");
        setPublicUrl(d.publicUrl ?? "");
        setRegion(d.region ?? "");
        setEndpoint(d.endpoint ?? "");
        setHasCredentials(d.hasCredentials);
        setAccessKeyId("");
        setSecretAccessKey("");
      }
    } catch {
      toast.error("Failed to load storage settings.");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (!hasGithubIdentity(user)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Access denied</EmptyTitle>
          <EmptyDescription>
            Only GitHub users can manage storage settings.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <Loader className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const buildPayload = () => ({
    provider,
    bucket: bucket || null,
    accountId: accountId || null,
    accessKeyId: accessKeyId || null,
    secretAccessKey: secretAccessKey || null,
    publicUrl: publicUrl || null,
    region: region || null,
    endpoint: endpoint || null,
  });

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/${config.owner}/${config.repo}/storage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (json.status === "success") {
        toast.success(json.message || "Storage settings saved.");
        if (json.data) {
          setHasCredentials(json.data.hasCredentials);
          setAccessKeyId("");
          setSecretAccessKey("");
        }
      } else {
        toast.error(json.message || "Failed to save storage settings.");
      }
    } catch {
      toast.error("Failed to save storage settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/${config.owner}/${config.repo}/storage/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        },
      );
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setTestResult({
          success: json.data.success,
          message: json.data.message,
        });
      } else {
        setTestResult({
          success: false,
          message: json.message || "Connection test failed.",
        });
      }
    } catch {
      setTestResult({ success: false, message: "Connection test failed." });
    } finally {
      setTesting(false);
    }
  };

  const handleProviderChange = (value: string) => {
    setProvider(value as Provider);
    setTestResult(null);
  };

  return (
    <div className="max-w-screen-sm mx-auto flex-1 flex flex-col h-full p-6">
      <h1 className="text-lg font-medium tracking-tight mb-6">
        Storage settings
      </h1>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="provider">Storage provider</Label>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger id="provider" className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="github">GitHub (Default)</SelectItem>
              <SelectItem value="cloudflare-r2">Cloudflare R2</SelectItem>
              <SelectItem value="aws-s3">AWS S3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {provider === "github" && (
          <p className="text-sm text-muted-foreground">
            Images and media are stored in the GitHub repository. No additional
            configuration needed.
          </p>
        )}

        {provider === "cloudflare-r2" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bucket">Bucket Name</Label>
              <Input
                id="bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">Account ID</Label>
              <Input
                id="accountId"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Cloudflare Account ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessKeyId">Access Key ID</Label>
              <Input
                id="accessKeyId"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder={hasCredentials ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Access Key ID"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretAccessKey">Secret Access Key</Label>
              <Input
                id="secretAccessKey"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder={hasCredentials ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Secret Access Key"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publicUrl">Public URL</Label>
              <Input
                id="publicUrl"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                placeholder="https://media.example.com"
              />
            </div>
          </div>
        )}

        {provider === "aws-s3" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bucket">Bucket Name</Label>
              <Input
                id="bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessKeyId">Access Key ID</Label>
              <Input
                id="accessKeyId"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder={hasCredentials ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Access Key ID"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretAccessKey">Secret Access Key</Label>
              <Input
                id="secretAccessKey"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder={hasCredentials ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Secret Access Key"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publicUrl">
                Public URL{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="publicUrl"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                placeholder="https://media.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endpoint">
                Custom Endpoint{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://s3.custom-endpoint.com"
              />
            </div>
          </div>
        )}

        {testResult && (
          <div
            className={`flex items-center gap-2 text-sm ${
              testResult.success ? "text-green-600" : "text-destructive"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <XCircle className="size-4 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          {provider !== "github" && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || saving}
            >
              {testing && <Loader className="size-4 animate-spin" />}
              Test connection
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || testing}>
            {saving && <Loader className="size-4 animate-spin" />}
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}
