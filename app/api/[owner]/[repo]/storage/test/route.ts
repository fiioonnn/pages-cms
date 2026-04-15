import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requireApiUserSession } from "@/lib/session-server";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { toErrorResponse } from "@/lib/api-error";

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

    if (!body.provider || body.provider === "github") {
      return Response.json({
        status: "success",
        data: { success: true, message: "GitHub storage requires no connection test." },
      });
    }

    if (!body.bucket || !body.accessKeyId || !body.secretAccessKey) {
      return Response.json({
        status: "error",
        message: "Bucket, Access Key ID, and Secret Access Key are required.",
      }, { status: 400 });
    }

    let endpoint: string | undefined;
    let region: string;

    if (body.provider === "cloudflare-r2") {
      if (!body.accountId) {
        return Response.json({
          status: "error",
          message: "Account ID is required for Cloudflare R2.",
        }, { status: 400 });
      }
      endpoint = `https://${body.accountId}.r2.cloudflarestorage.com`;
      region = "auto";
    } else {
      endpoint = body.endpoint || undefined;
      region = body.region || "us-east-1";
    }

    const client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: body.accessKeyId,
        secretAccessKey: body.secretAccessKey,
      },
      forcePathStyle: true,
    });

    const testKey = `.pagescms-connection-test-${Date.now()}`;

    await client.send(new PutObjectCommand({
      Bucket: body.bucket,
      Key: testKey,
      Body: "connection-test",
      ContentType: "text/plain",
    }));

    await client.send(new DeleteObjectCommand({
      Bucket: body.bucket,
      Key: testKey,
    }));

    return Response.json({
      status: "success",
      data: { success: true, message: "Connection successful — test file was uploaded and deleted." },
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Connection test failed.";
    return Response.json({
      status: "success",
      data: { success: false, message },
    });
  }
}
