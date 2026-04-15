import { requireApiUserSession } from "@/lib/session-server";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { getStorageConfig, saveStorageConfig, sanitizeStorageConfig } from "@/lib/storage/settings";
import { toErrorResponse } from "@/lib/api-error";
import type { StorageConfig } from "@/lib/storage/types";

export async function GET(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    await requireGithubRepoWriteAccess(sessionResult.user, params.owner, params.repo);

    const config = await getStorageConfig(params.owner, params.repo);

    return Response.json({
      status: "success",
      data: config ? sanitizeStorageConfig(config) : {
        provider: "github",
        bucket: null,
        accountId: null,
        publicUrl: null,
        region: null,
        endpoint: null,
        hasCredentials: false,
      },
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    await requireGithubRepoWriteAccess(sessionResult.user, params.owner, params.repo);

    const body = await request.json();

    const config: StorageConfig = {
      provider: body.provider ?? "github",
      bucket: body.bucket ?? null,
      accountId: body.accountId ?? null,
      accessKeyId: body.accessKeyId || null,
      secretAccessKey: body.secretAccessKey || null,
      publicUrl: body.publicUrl ?? null,
      region: body.region ?? null,
      endpoint: body.endpoint ?? null,
    };

    await saveStorageConfig(params.owner, params.repo, config);

    const saved = await getStorageConfig(params.owner, params.repo);

    return Response.json({
      status: "success",
      message: "Storage settings saved.",
      data: saved ? sanitizeStorageConfig(saved) : null,
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
