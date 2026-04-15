import { db } from "@/db";
import { projectStorageTable } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { eq, sql } from "drizzle-orm";
import type { StorageConfig } from "./types";

export async function getStorageConfig(
  owner: string,
  repo: string,
): Promise<StorageConfig | null> {
  const row = await db.query.projectStorageTable.findFirst({
    where: (table, { and }) =>
      and(
        eq(sql`lower(${table.owner})`, owner.toLowerCase()),
        eq(sql`lower(${table.repo})`, repo.toLowerCase()),
      ),
  });

  if (!row) return null;

  let accessKeyId: string | null = null;
  let secretAccessKey: string | null = null;

  if (row.accessKeyId && row.accessKeyIv) {
    accessKeyId = await decrypt(row.accessKeyId, row.accessKeyIv);
  }
  if (row.secretAccessKey && row.secretKeyIv) {
    secretAccessKey = await decrypt(row.secretAccessKey, row.secretKeyIv);
  }

  return {
    provider: row.provider as StorageConfig["provider"],
    bucket: row.bucket,
    accountId: row.accountId,
    accessKeyId,
    secretAccessKey,
    publicUrl: row.publicUrl,
    region: row.region,
    endpoint: row.endpoint,
  };
}

export async function saveStorageConfig(
  owner: string,
  repo: string,
  config: StorageConfig,
): Promise<void> {
  let encryptedAccessKey: { ciphertext: string; iv: string } | null = null;
  let encryptedSecretKey: { ciphertext: string; iv: string } | null = null;

  if (config.accessKeyId) {
    encryptedAccessKey = await encrypt(config.accessKeyId);
  }
  if (config.secretAccessKey) {
    encryptedSecretKey = await encrypt(config.secretAccessKey);
  }

  const values = {
    owner,
    repo,
    provider: config.provider,
    bucket: config.bucket,
    accountId: config.accountId,
    accessKeyId: encryptedAccessKey?.ciphertext ?? null,
    accessKeyIv: encryptedAccessKey?.iv ?? null,
    secretAccessKey: encryptedSecretKey?.ciphertext ?? null,
    secretKeyIv: encryptedSecretKey?.iv ?? null,
    publicUrl: config.publicUrl,
    region: config.region,
    endpoint: config.endpoint,
    updatedAt: new Date(),
  };

  const existing = await db.query.projectStorageTable.findFirst({
    where: (table, { and }) =>
      and(
        eq(sql`lower(${table.owner})`, owner.toLowerCase()),
        eq(sql`lower(${table.repo})`, repo.toLowerCase()),
      ),
  });

  if (existing) {
    const updateValues: Record<string, unknown> = { ...values };
    if (!config.accessKeyId) {
      updateValues.accessKeyId = existing.accessKeyId;
      updateValues.accessKeyIv = existing.accessKeyIv;
    }
    if (!config.secretAccessKey) {
      updateValues.secretAccessKey = existing.secretAccessKey;
      updateValues.secretKeyIv = existing.secretKeyIv;
    }

    await db
      .update(projectStorageTable)
      .set(updateValues)
      .where(eq(projectStorageTable.id, existing.id));
  } else {
    await db.insert(projectStorageTable).values(values);
  }
}

export function sanitizeStorageConfig(config: StorageConfig) {
  return {
    provider: config.provider,
    bucket: config.bucket,
    accountId: config.accountId,
    publicUrl: config.publicUrl,
    region: config.region,
    endpoint: config.endpoint,
    hasCredentials: !!(config.accessKeyId && config.secretAccessKey),
  };
}
