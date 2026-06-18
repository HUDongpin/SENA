import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  deleteEnterpriseProject,
  getEnterpriseProject,
  restoreEnterpriseProjectRevision,
  updateEnterpriseProject,
  type SenaEnterpriseProject
} from "@/lib/sena/enterprise";
import { importSenaProjectSnapshot } from "@/lib/sena/snapshot";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function projectSnapshotSha256(project: SenaEnterpriseProject) {
  return createHash("sha256").update(JSON.stringify(project.snapshot)).digest("hex");
}

function projectLifecycleHeaders(project: SenaEnterpriseProject, extra?: Record<string, string>): HeadersInit {
  return {
    "x-sena-project-id": project.id,
    "x-sena-team-id": project.teamId,
    "x-sena-project-version": String(project.currentVersion),
    "x-sena-project-snapshot-sha256": projectSnapshotSha256(project),
    ...extra
  };
}

function projectDeletionHeaders(deletion: ReturnType<typeof deleteEnterpriseProject>): HeadersInit {
  return {
    "x-sena-project-id": deletion.projectId,
    "x-sena-team-id": deletion.teamId,
    "x-sena-project-version": String(deletion.projectVersion),
    "x-sena-project-snapshot-sha256": deletion.snapshotSha256,
    "x-sena-project-deleted": String(deletion.deleted)
  };
}

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  try {
    const context = requireApiSession();
    const project = getEnterpriseProject(context, params.projectId);
    return NextResponse.json({ schemaVersion: "sena-project/v1", project }, {
      headers: projectLifecycleHeaders(project)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: { params: { projectId: string } }) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    const project = updateEnterpriseProject(context, params.projectId, {
      title: body.title === undefined ? undefined : String(body.title),
      description: body.description === undefined ? undefined : String(body.description),
      snapshot: body.snapshot ? importSenaProjectSnapshot(body.snapshot) : undefined,
      expectedVersion: body.expectedVersion === undefined ? undefined : Number(body.expectedVersion)
    });
    return NextResponse.json({ schemaVersion: "sena-project/v1", project }, {
      headers: projectLifecycleHeaders(project)
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { projectId: string } }) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json();
    const action = String(body.action ?? "");
    if (action === "restore-revision") {
      const result = restoreEnterpriseProjectRevision(context, params.projectId, {
        revisionId: body.revisionId === undefined ? undefined : String(body.revisionId),
        version: body.version === undefined ? undefined : Number(body.version),
        expectedVersion: body.expectedVersion === undefined ? undefined : Number(body.expectedVersion)
      });
      return NextResponse.json(result, {
        headers: projectLifecycleHeaders(result.project, {
          "x-sena-project-restored-from-version": String(result.restoredFrom.version),
          "x-sena-project-restored-version": String(result.restoredRevision.version)
        })
      });
    }
    return NextResponse.json({ error: "Unsupported project action.", code: "unsupported_project_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { projectId: string } }) {
  try {
    const context = requireApiSessionForMutation(request);
    const deletion = deleteEnterpriseProject(context, params.projectId);
    return NextResponse.json(deletion, {
      headers: projectDeletionHeaders(deletion)
    });
  } catch (error) {
    return jsonError(error);
  }
}
