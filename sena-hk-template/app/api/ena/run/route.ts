import { NextResponse } from "next/server";
import { runEnaRequest } from "@/lib/ena/server";
import { EnaInputError, type EnaRunRequest } from "@/lib/ena/types";
import { observeSenaApiRoute, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "ena-run" }, async () => {
    await requireApiSessionForMutation(request);
    try {
      const body = (await request.json()) as EnaRunRequest;
      const result = runEnaRequest(body, "api");
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof EnaInputError) {
        return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : "ENA analysis failed." },
        { status: 500 }
      );
    }
  });
}
