import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getFileExtension } from "@/lib/utils/file";
import type { StorageProvider, StorageListItem, StorageConfig } from "./types";

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(config: StorageConfig) {
    if (!config.bucket) throw new Error("Bucket is required for S3 storage.");
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error("Credentials are required for S3 storage.");
    }

    let endpoint: string | undefined;
    let region: string;

    if (config.provider === "cloudflare-r2") {
      if (!config.accountId) throw new Error("Account ID is required for Cloudflare R2.");
      endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
      region = "auto";
    } else {
      endpoint = config.endpoint || undefined;
      region = config.region || "us-east-1";
    }

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });

    this.bucket = config.bucket;

    if (config.publicUrl) {
      this.publicUrl = config.publicUrl.replace(/\/+$/, "");
    } else if (config.provider === "cloudflare-r2") {
      this.publicUrl = `https://${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`;
    } else {
      this.publicUrl = `https://${config.bucket}.s3.${region}.amazonaws.com`;
    }
  }

  async upload(
    file: Buffer,
    path: string,
    contentType: string,
  ): Promise<{ url: string; size: number }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: file,
        ContentType: contentType,
      }),
    );

    return {
      url: `${this.publicUrl}/${path}`,
      size: file.length,
    };
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }),
    );
  }

  async list(prefix: string): Promise<StorageListItem[]> {
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: normalizedPrefix,
        Delimiter: "/",
      }),
    );

    const items: StorageListItem[] = [];

    if (response.CommonPrefixes) {
      for (const cp of response.CommonPrefixes) {
        if (!cp.Prefix) continue;
        const dirPath = cp.Prefix.replace(/\/+$/, "");
        const name = dirPath.split("/").pop() || "";
        items.push({
          type: "dir",
          name,
          path: dirPath,
          size: 0,
          url: null,
        });
      }
    }

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (!obj.Key || obj.Key === normalizedPrefix) continue;
        const name = obj.Key.split("/").pop() || "";
        if (name === ".gitkeep") continue;
        items.push({
          type: "file",
          name,
          path: obj.Key,
          size: obj.Size ?? 0,
          url: `${this.publicUrl}/${obj.Key}`,
          extension: getFileExtension(name),
        });
      }
    }

    items.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });

    return items;
  }
}
