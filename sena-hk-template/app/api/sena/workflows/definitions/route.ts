import { NextResponse } from "next/server";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { senaWorkflowDefinitions } from "@/lib/sena/workflow/definitions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-workflow-definitions" }, async () => {
    await requireApiSession();
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowDefinitionList,
      definitions: senaWorkflowDefinitions
    }, {
      headers: {
        "cache-control": "private, no-store",
        "x-sena-workflow-definition-count": String(senaWorkflowDefinitions.length)
      }
    });
  });
}
