import { createHash } from "node:crypto";
import { getEnterpriseClaimEvidencePackage, getEnterpriseProject, recordEnterpriseAudit, SenaEnterpriseError } from "@/lib/sena/enterprise";
import { buildSenaPublicationExport, type SenaPublicationEnterpriseProjectEvidence, type SenaPublicationFormat } from "@/lib/sena/publication-export";
import { importSenaProjectSnapshot } from "@/lib/sena/snapshot";
import type { SenaProjectSnapshot } from "@/lib/sena/types";
import { jsonError, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

const formats = new Set<SenaPublicationFormat>(["html", "svg", "png", "xlsx", "docx", "pdf", "package"]);

function bodyBuffer(body: string | Buffer) {
  return typeof body === "string" ? Buffer.from(body, "utf8") : body;
}

function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function publicationPackageHeaders(format: SenaPublicationFormat, body: string | Buffer) {
  if (format !== "package" || typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body) as {
      manifest?: {
        packageSha256?: string;
        artifactCount?: number;
        formats?: string[];
        reportSha256?: string;
      };
      verificationCertificate?: { status?: string };
    };
    return {
      ...(parsed.manifest?.packageSha256 ? { "x-sena-publication-package-sha256": parsed.manifest.packageSha256 } : {}),
      ...(parsed.manifest?.artifactCount !== undefined ? { "x-sena-publication-artifact-count": String(parsed.manifest.artifactCount) } : {}),
      ...(parsed.manifest?.formats?.length ? { "x-sena-publication-formats": parsed.manifest.formats.join(",") } : {}),
      ...(parsed.manifest?.reportSha256 ? { "x-sena-report-sha256": parsed.manifest.reportSha256 } : {}),
      ...(parsed.verificationCertificate?.status ? { "x-sena-publication-verification-status": parsed.verificationCertificate.status } : {})
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const requestBody = await request.json();
    const format = formats.has(requestBody.format) ? requestBody.format : "html";
    const projectId = requestBody.projectId ? String(requestBody.projectId) : "";
    let snapshot: SenaProjectSnapshot;
    let teamId = String(requestBody.teamId || context.teams[0]?.id || "");
    let source = "snapshot";
    let projectVersion: number | undefined;
    let enterpriseProjectEvidence: SenaPublicationEnterpriseProjectEvidence | undefined;
    if (projectId) {
      const project = getEnterpriseProject(context, projectId);
      const claimPackage = getEnterpriseClaimEvidencePackage(context, { projectId });
      snapshot = project.snapshot;
      teamId = project.teamId;
      source = "project";
      projectVersion = project.currentVersion;
      enterpriseProjectEvidence = {
        schemaVersion: "sena-publication-enterprise-project-evidence/v1",
        projectId: project.id,
        teamId: project.teamId,
        currentVersion: project.currentVersion,
        title: project.title,
        activeWindowLabel: project.activeWindowLabel,
        claimUse: project.claimUse,
        sourceSnapshotSha256: claimPackage.sourceSnapshotEvidence.snapshotSha256,
        reportSha256: claimPackage.sourceSnapshotEvidence.reportSha256,
        claimPackage: {
          schemaVersion: claimPackage.schemaVersion,
          status: claimPackage.status,
          blockers: claimPackage.summary.blockers,
          warnings: claimPackage.summary.warnings,
          sourceSnapshotSha256: claimPackage.sourceSnapshotEvidence.snapshotSha256
        }
      };
    } else if (requestBody.snapshot) {
      snapshot = importSenaProjectSnapshot(requestBody.snapshot);
    } else {
      throw new SenaEnterpriseError("Provide projectId or snapshot for publication export.", 400, "publication_export_source_required");
    }
    const result = await buildSenaPublicationExport(snapshot, format, enterpriseProjectEvidence);
    recordEnterpriseAudit({
      event: "export.run",
      userId: context.user.id,
      teamId,
      projectId: projectId || undefined,
      detail: {
        source,
        format,
        title: snapshot.title,
        projectVersion: projectVersion ?? null,
        sourceSnapshotSha256: enterpriseProjectEvidence?.sourceSnapshotSha256 ?? null,
        claimPackageStatus: enterpriseProjectEvidence?.claimPackage.status ?? null
      }
    });
    const exportBuffer = bodyBuffer(result.body);
    const responseBody = typeof result.body === "string" ? result.body : new Uint8Array(result.body);
    const packageHeaders = publicationPackageHeaders(format, result.body);
    return new Response(responseBody, {
      headers: {
        "content-type": result.contentType,
        "content-disposition": `attachment; filename="${result.filename}"`,
        "x-sena-export-source": source,
        "x-sena-export-format": format,
        "x-sena-export-filename": result.filename,
        "x-sena-export-bytes": String(exportBuffer.byteLength),
        "x-sena-export-sha256": sha256Buffer(exportBuffer),
        ...(projectId ? { "x-sena-project-id": projectId } : {}),
        ...(projectVersion ? { "x-sena-project-version": String(projectVersion) } : {}),
        ...(enterpriseProjectEvidence?.sourceSnapshotSha256 ? { "x-sena-source-snapshot-sha256": enterpriseProjectEvidence.sourceSnapshotSha256 } : {}),
        ...(enterpriseProjectEvidence?.reportSha256 ? { "x-sena-report-sha256": enterpriseProjectEvidence.reportSha256 } : {}),
        ...(enterpriseProjectEvidence?.claimPackage.status ? { "x-sena-claim-package-status": enterpriseProjectEvidence.claimPackage.status } : {}),
        ...packageHeaders
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
