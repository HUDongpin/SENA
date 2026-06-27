import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import { buildSenaAnalysisRun } from "@/lib/sena/analysis-run";
import {
  createEnterpriseAnalysisRun,
  createEnterpriseImportRun,
  createEnterpriseUploads,
  listEnterpriseImportRuns,
  type SenaEnterpriseAnalysisRun,
  type SenaEnterpriseImportRun
} from "@/lib/sena/enterprise/import-analysis";
import {
  createEnterpriseProject,
  type SenaEnterpriseProject
} from "@/lib/sena/enterprise/team-project";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import type { SenaEnterpriseImportCleaningManifest } from "@/lib/sena/import-adapters";
import { importSenaEnterpriseFiles } from "@/lib/sena/import-adapters";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function formBoolean(value: FormDataEntryValue | null) {
  const normalized = formString(value).toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function formJson(value: FormDataEntryValue | null, fieldName: string) {
  const raw = formString(value);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new SenaEnterpriseError(`${fieldName} must be valid JSON.`, 400, "invalid_import_form_json");
  }
}

function importResponseHeaders(input: {
  importRun: SenaEnterpriseImportRun;
  cleaningManifest?: SenaEnterpriseImportCleaningManifest;
  persistedProject?: SenaEnterpriseProject;
  enterpriseAnalysisRun?: SenaEnterpriseAnalysisRun;
}): HeadersInit {
  const profiles = Array.from(new Set(input.importRun.sources.map((source) => source.profile)));
  const reviewChecks = input.cleaningManifest?.checks.filter((check) => check.status === "review").length ?? 0;
  const headers: Record<string, string> = {
    "x-sena-import-run-id": input.importRun.id,
    "x-sena-import-status": input.importRun.status,
    "x-sena-team-id": input.importRun.teamId,
    "x-sena-import-file-count": String(input.importRun.fileCount),
    "x-sena-import-warning-count": String(input.importRun.warningCount),
    "x-sena-import-cleaning-manifest": input.cleaningManifest?.schemaVersion ?? "none",
    "x-sena-import-cleaning-review-checks": String(reviewChecks),
    "x-sena-import-profiles": profiles.join("|") || "unknown"
  };
  if (input.persistedProject) {
    headers["x-sena-project-id"] = input.persistedProject.id;
    headers["x-sena-project-version"] = String(input.persistedProject.currentVersion);
  }
  if (input.enterpriseAnalysisRun) {
    headers["x-sena-analysis-run-id"] = input.enterpriseAnalysisRun.id;
    headers["x-sena-analysis-source-kind"] = input.enterpriseAnalysisRun.sourceKind;
    headers["x-sena-report-sha256"] = input.enterpriseAnalysisRun.artifactFingerprints.reportSha256;
    headers["x-sena-project-snapshot-sha256"] = input.enterpriseAnalysisRun.artifactFingerprints.projectSnapshotSha256;
    if (input.enterpriseAnalysisRun.artifactFingerprints.runtimeBundleSha256) {
      headers["x-sena-runtime-bundle-sha256"] = input.enterpriseAnalysisRun.artifactFingerprints.runtimeBundleSha256;
    }
  }
  return headers;
}

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId") || undefined;
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.importRunList,
      importRuns: listEnterpriseImportRuns(context, teamId)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const bufferedFiles = await Promise.all(files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return {
        name: file.name,
        contentType: file.type || "application/octet-stream",
        bytes: buffer,
        text: async () => buffer.toString("utf8"),
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      };
    }));
    const result = await importSenaEnterpriseFiles(bufferedFiles);
    const teamId = String(form.get("teamId") || context.teams[0]?.id || "");
    const sourceByName = new Map(result.sources.map((source) => [source.name, source]));
    const uploads = createEnterpriseUploads(context, {
      teamId,
      files: bufferedFiles.map((file) => {
        const source = sourceByName.get(file.name);
        return {
          name: file.name,
          contentType: file.contentType,
          bytes: file.bytes,
          importProfile: source?.profile,
          warningCount: source?.warnings.length ?? 0
        };
      })
    });
    const importRun = createEnterpriseImportRun(context, {
      teamId,
      uploadIds: uploads.map((upload) => upload.id),
      sources: result.sources,
      warnings: result.warnings,
      dataset: result.dataset,
      cleaningManifest: result.cleaningManifest
    });
    const action = formString(form.get("action"));
    const shouldCreateProject = action === "create-project" || formBoolean(form.get("persistProject"));
    if (!shouldCreateProject) {
      return NextResponse.json({ ...result, uploads, importRun }, {
        headers: importResponseHeaders({ importRun, cleaningManifest: result.cleaningManifest })
      });
    }

    const title = formString(form.get("title")) || `Imported SENA Project ${new Date().toISOString().slice(0, 10)}`;
    const analysisRun = buildSenaAnalysisRun({
      sourceKind: "dataset",
      dataset: result.dataset,
      buildOptions: formJson(form.get("buildOptions"), "buildOptions"),
      title,
      activeTemporalWindowId: formString(form.get("activeTemporalWindowId")) || undefined,
      includeRuntimeBundle: formBoolean(form.get("includeRuntimeBundle"))
    });
    const persistedProject = createEnterpriseProject(context, {
      teamId,
      title,
      description: formString(form.get("description")) || `Created from import run ${importRun.id}.`,
      snapshot: analysisRun.projectSnapshot
    });
    const enterpriseAnalysisRun = createEnterpriseAnalysisRun(context, {
      teamId,
      persistedProjectId: persistedProject.id,
      run: analysisRun
    });

    return NextResponse.json({
      ...result,
      uploads,
      importRun,
      analysisRun,
      persistedProject,
      enterpriseAnalysisRun
    }, {
      status: 201,
      headers: importResponseHeaders({
        importRun,
        cleaningManifest: result.cleaningManifest,
        persistedProject,
        enterpriseAnalysisRun
      })
    });
  } catch (error) {
    return jsonError(error);
  }
}
