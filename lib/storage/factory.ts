import { getStorageConfig } from "./settings";
import { GitHubStorageProvider } from "./github";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export async function getStorageProvider(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<{ provider: StorageProvider; isExternal: boolean }> {
  const config = await getStorageConfig(owner, repo);

  if (!config || config.provider === "github") {
    return {
      provider: new GitHubStorageProvider(token, owner, repo, branch),
      isExternal: false,
    };
  }

  return {
    provider: new S3StorageProvider(config),
    isExternal: true,
  };
}
