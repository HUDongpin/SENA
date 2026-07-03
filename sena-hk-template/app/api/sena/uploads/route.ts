import { NextResponse } from "next/server";
import {
  createEnterpriseUploadsWithPostgresMirrorAsync,
  deliverEnterpriseUploadBlobsWithPostgresEvidence,
  listEnterpriseUploadsAsync,
  verifyEnterpriseUploadStorageAsync
} from "@/lib/sena/enterprise/import-analysis";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
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
  return observeSenaApiRoute(request, { routeId: "sena-uploads" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId") || undefined;
    const verify = url.searchParams.get("verify") === "1" || url.searchParams.get("verify") === "true";
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.uploadList,
      uploads: await listEnterpriseUploadsAsync(context, teamId),
      storageVerification: verify ? await verifyEnterpriseUploadStorageAsync(context, { teamId }) : undefined
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-uploads" }, async () => {
    const context = await requireApiSessionForMutation(request);
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      if (body.action === "deliver-object-storage") {
        return NextResponse.json(await deliverEnterpriseUploadBlobsWithPostgresEvidence(context, {
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
    const uploads = await createEnterpriseUploadsWithPostgresMirrorAsync(context, {
      teamId,
      files: await uploadFiles(files)
    });
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.uploadList,
      uploads
    }, { status: 201 });
  });
}
