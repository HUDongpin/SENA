import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createEnterpriseProjectAsync,
  listEnterpriseProjectsAsync,
  type SenaEnterpriseProject
} from "@/lib/sena/enterprise/team-project";
import {
  recordEnterpriseAuditAsync
} from "@/lib/sena/enterprise/ops-audit";
import { importSenaProjectSnapshotFromHandoff } from "@/lib/sena/project-handoff";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";

export const runtime = "nodejs";

function projectSnapshotSha256(project: SenaEnterpriseProject) {
  return createHash("sha256").update(JSON.stringify(project.snapshot)).digest("hex");
}

function projectLifecycleHeaders(project: SenaEnterpriseProject): HeadersInit {
  return {
    "x-sena-project-id": project.id,
    "x-sena-team-id": project.teamId,
    "x-sena-project-version": String(project.currentVersion),
    "x-sena-project-snapshot-sha256": projectSnapshotSha256(project)
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-projects" }, async () => {
    const context = await requireApiSession();
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.projectList, projects: await listEnterpriseProjectsAsync(context) });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-projects" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const snapshot = importSenaProjectSnapshotFromHandoff(body);
    const teamId = String(body.teamId || context.teams[0]?.id || "");
    const source = body.reviewPacket || body.packet || body.schemaVersion === SENA_SCHEMA_VERSIONS.reviewPacket
      ? "review-packet-save"
      : "project-save";
    const project = await createEnterpriseProjectAsync(context, {
      teamId,
      title: String(body.title ?? snapshot.title ?? "Untitled SENA Project"),
      description: String(body.description ?? ""),
      snapshot
    });
    await recordEnterpriseAuditAsync({
      event: "analysis.run",
      userId: context.user.id,
      teamId,
      projectId: project.id,
      detail: { source, people: project.datasetCounts.people, codes: project.datasetCounts.codes }
    });
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.project, project }, {
      status: 201,
      headers: projectLifecycleHeaders(project)
    });
  });
}
