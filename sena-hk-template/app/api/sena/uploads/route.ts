import { NextResponse } from "next/server";
import {
  createEnterpriseUploads,
  deliverEnterpriseUploadBlobs,
  listEnterpriseUploads,
  verifyEnterpriseUploadStorage
} from "@/lib/sena/enterprise/import-analysis";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";

export const runtime = "nodejs";

async function uploadFiles(files: File[]) {
  return Promise.all(files.map(async (file) => ({
    name: file.name,
    contentType: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer())
  })));
}

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId") || undefined;
    const verify = url.searchParams.get("verify") === "1" || url.searchParams.get("verify") === "true";
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.uploadList,
      uploads: listEnterpriseUploads(context, teamId),
      storageVerification: verify ? verifyEnterpriseUploadStorage(context, { teamId }) : undefined
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      if (body.action === "deliver-object-storage") {
        return NextResponse.json(await deliverEnterpriseUploadBlobs(context, {
          teamId: body.teamId,
          uploadId: body.uploadId,
          limit: body.limit,
          includeReview: Boolean(body.includeReview)
        }));
      }
      return NextResponse.json({ error: "Unsupported upload action." }, { status: 400 });
    }
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const teamId = String(form.get("teamId") || context.teams[0]?.id || "");
    const uploads = createEnterpriseUploads(context, {
      teamId,
      files: await uploadFiles(files)
    });
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.uploadList,
      uploads
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
