import { getMediaCache } from "@/lib/github-cache-file";
import { getFileExtension } from "@/lib/utils/file";
import type { StorageProvider, StorageListItem } from "./types";

export class GitHubStorageProvider implements StorageProvider {
  private token: string;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(token: string, owner: string, repo: string, branch: string) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  async upload(): Promise<{ url: string; size: number }> {
    // GitHub uploads are handled by the existing githubSaveFile logic in route.ts
    throw new Error("GitHub uploads are handled by the existing route handler.");
  }

  async delete(): Promise<void> {
    // GitHub deletes are handled by the existing DELETE handler in route.ts
    throw new Error("GitHub deletes are handled by the existing route handler.");
  }

  async list(prefix: string): Promise<StorageListItem[]> {
    const results = await getMediaCache(
      this.owner,
      this.repo,
      this.branch,
      prefix,
      this.token,
      false,
    );

    return results.map((item: any) => ({
      type: item.type === "dir" ? "dir" as const : "file" as const,
      name: item.name,
      path: item.path,
      size: item.size ?? 0,
      url: item.downloadUrl ?? null,
      sha: item.sha,
      extension: item.type === "dir" ? undefined : getFileExtension(item.name),
    }));
  }
}
