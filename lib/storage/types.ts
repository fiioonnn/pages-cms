export interface StorageProvider {
  upload(
    file: Buffer,
    path: string,
    contentType: string,
  ): Promise<{ url: string; size: number }>;

  delete(path: string): Promise<void>;

  list(prefix: string): Promise<StorageListItem[]>;
}

export interface StorageListItem {
  type: "file" | "dir";
  name: string;
  path: string;
  size: number;
  url: string | null;
  sha?: string;
  extension?: string;
}

export interface StorageConfig {
  provider: "github" | "cloudflare-r2" | "aws-s3";
  bucket: string | null;
  accountId: string | null;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  publicUrl: string | null;
  region: string | null;
  endpoint: string | null;
}
