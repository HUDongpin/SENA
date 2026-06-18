import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  createEnterpriseReliabilityAdjudications,
  createEnterpriseReliabilityRun,
  listEnterpriseReliabilityRuns,
  reviewEnterpriseReliabilityRun
} from "@/lib/sena/enterprise";
import { parseSenaCsv, type SenaImportRow } from "@/lib/sena/import";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview
} from "@/lib/sena/reliability";
import { prepareSenaReliabilityJsonRequest } from "@/lib/sena/reliability-api";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type BufferedReliabilityFile = {
  name: string;
  size: number;
  bytes: Buffer;
};

type ReliabilityRunHeaderSource = {
  id: string;
  status: string;
  projectId?: string;
  meanPairwiseKappa: number;
  krippendorffAlphaNominal: number;
  adjudicationCoverage: {
    coverageRate: number;
    unresolvedDisagreements: number;
  };
};

async function bufferReliabilityFiles(files: File[]): Promise<BufferedReliabilityFile[]> {
  return Promise.all(files.map(async (file) => {
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      name: file.name,
      size: bytes.byteLength,
      bytes
    };
  }));
}

function rowsFromFile(file: BufferedReliabilityFile): SenaImportRow[] {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = XLSX.read(file.bytes, { type: "buffer" });
    return workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return sheet ? XLSX.utils.sheet_to_json<SenaImportRow>(sheet, { defval: "" }) : [];
    });
  }
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(file.bytes.toString("utf8"));
    return Array.isArray(parsed) ? parsed.filter((row) => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
  }
  return parseSenaCsv(file.bytes.toString("utf8")).rows;
}

function fileSummary(file: BufferedReliabilityFile) {
  return {
    name: file.name,
    size: file.size,
    sha256: createHash("sha256").update(file.bytes).digest("hex")
  };
}

function reliabilityRunHeaders(run: ReliabilityRunHeaderSource) {
  return {
    "x-sena-reliability-run-id": run.id,
    "x-sena-reliability-status": run.status,
    ...(run.projectId ? { "x-sena-project-id": run.projectId } : {}),
    "x-sena-reliability-coverage-rate": String(run.adjudicationCoverage.coverageRate),
    "x-sena-unresolved-disagreements": String(run.adjudicationCoverage.unresolvedDisagreements),
    "x-sena-mean-pairwise-kappa": String(run.meanPairwiseKappa),
    "x-sena-krippendorff-alpha": String(run.krippendorffAlphaNominal)
  };
}

export async function GET(request: Request) {
  try {
    const context = requireApiSession();
    const url = new URL(request.url);
    return NextResponse.json({
      schemaVersion: "sena-reliability-run-list/v1",
      reliabilityRuns: listEnterpriseReliabilityRuns(context, {
        teamId: url.searchParams.get("teamId") || undefined,
        projectId: url.searchParams.get("projectId") || undefined
      })
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    if ((request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      const prepared = prepareSenaReliabilityJsonRequest(await request.json(), {
        defaultReviewer: context.user.name
      });
      const reliabilityRun = createEnterpriseReliabilityRun(context, {
        teamId: prepared.teamId || context.teams[0]?.id || "",
        projectId: prepared.projectId,
        reviewer: prepared.reviewer,
        fileCount: prepared.fileCount,
        annotationCount: prepared.annotationCount,
        inputFiles: prepared.inputFiles,
        dashboard: prepared.dashboard,
        reviewPatch: prepared.reviewPatch
      });
      return NextResponse.json({
        schemaVersion: "sena-reliability-response/v1",
        requestSchemaVersion: "sena-reliability-json-request/v1",
        source: prepared.source,
        dashboard: prepared.dashboard,
        reviewPatch: prepared.reviewPatch,
        reliabilityRun
      }, {
        headers: reliabilityRunHeaders(reliabilityRun)
      });
    }
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const bufferedFiles = await bufferReliabilityFiles(files);
    const rows = bufferedFiles.flatMap(rowsFromFile);
    const parsed = parseCoderAnnotationsFromRows(rows);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations);
    const dashboardWithWarnings = {
      ...dashboard,
      warnings: [...parsed.warnings, ...dashboard.warnings]
    };
    const reviewer = String(form.get("reviewer") || context.user.name);
    const reviewPatch = reliabilityDashboardToReview(dashboardWithWarnings, reviewer);
    const teamId = String(form.get("teamId") || context.teams[0]?.id || "");
    const projectId = form.get("projectId") ? String(form.get("projectId")) : undefined;
    const reliabilityRun = createEnterpriseReliabilityRun(context, {
      teamId,
      projectId,
      reviewer,
      fileCount: bufferedFiles.length,
      annotationCount: parsed.annotations.length,
      inputFiles: bufferedFiles.map(fileSummary),
      dashboard: dashboardWithWarnings,
      reviewPatch
    });
    return NextResponse.json({
      schemaVersion: "sena-reliability-response/v1",
      dashboard: dashboardWithWarnings,
      reviewPatch,
      reliabilityRun
    }, {
      headers: reliabilityRunHeaders(reliabilityRun)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    const action = String(body.action ?? "review");
    if (action === "adjudicate") {
      const decision = body.decision === "include" || body.decision === "exclude" || body.decision === "revise"
        ? body.decision
        : "revise";
      const adjudication = createEnterpriseReliabilityAdjudications(context, String(body.runId ?? ""), {
        decision,
        notes: body.notes ? String(body.notes) : undefined,
        limit: body.limit ? Number(body.limit) : undefined
      });
      return NextResponse.json({
        schemaVersion: "sena-reliability-adjudication-response/v1",
        adjudication
      }, {
        status: 201,
        headers: reliabilityRunHeaders(adjudication.reliabilityRun)
      });
    }
    const status = body.status === "approved" || body.status === "rejected"
      ? body.status
      : "pending-adjudication";
    const reliabilityRun = reviewEnterpriseReliabilityRun(context, String(body.runId ?? ""), {
      status,
      notes: body.notes ? String(body.notes) : undefined
    });
    return NextResponse.json({
      schemaVersion: "sena-reliability-run-review/v1",
      reliabilityRun
    }, {
      headers: reliabilityRunHeaders(reliabilityRun)
    });
  } catch (error) {
    return jsonError(error);
  }
}
