import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildEnterpriseReliabilityAdjudicationResponse,
  buildEnterpriseReliabilityJsonRunResponse,
  buildEnterpriseReliabilityRunResponse,
  buildEnterpriseReliabilityRunListResponse,
  buildEnterpriseReliabilityRunReviewResponse
} from "@/lib/sena/enterprise/reliability-runs";
import { readXlsxWorkbookRows } from "@/lib/sena/excel-workbook";
import { parseSenaCsv, type SenaImportRow } from "@/lib/sena/import";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview
} from "@/lib/sena/reliability";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type BufferedReliabilityFile = {
  name: string;
  size: number;
  bytes: Buffer;
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

async function rowsFromFile(file: BufferedReliabilityFile): Promise<SenaImportRow[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const workbook = await readXlsxWorkbookRows(file.bytes);
    return workbook.flatMap((sheet) => sheet.rows);
  }
  if (lower.endsWith(".xls")) {
    throw new Error(`${file.name}: legacy .xls reliability uploads are not accepted. Save the workbook as .xlsx, CSV, or JSON before uploading.`);
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

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const response = buildEnterpriseReliabilityRunListResponse(context, {
      teamId: url.searchParams.get("teamId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined
    });
    return NextResponse.json(response.body);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    if ((request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      const response = buildEnterpriseReliabilityJsonRunResponse(context, await request.json());
      return NextResponse.json(response.body, { headers: response.headers });
    }
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const bufferedFiles = await bufferReliabilityFiles(files);
    const rows = (await Promise.all(bufferedFiles.map(rowsFromFile))).flat();
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
    const response = buildEnterpriseReliabilityRunResponse(context, {
      teamId,
      projectId,
      reviewer,
      fileCount: bufferedFiles.length,
      annotationCount: parsed.annotations.length,
      inputFiles: bufferedFiles.map(fileSummary),
      dashboard: dashboardWithWarnings,
      reviewPatch
    });
    return NextResponse.json(response.body, { headers: response.headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const action = String(body.action ?? "review");
    if (action === "adjudicate") {
      const response = buildEnterpriseReliabilityAdjudicationResponse(context, body);
      return NextResponse.json(response.body, {
        status: response.status,
        headers: response.headers
      });
    }
    const response = buildEnterpriseReliabilityRunReviewResponse(context, body);
    return NextResponse.json(response.body, { headers: response.headers });
  } catch (error) {
    return jsonError(error);
  }
}
