import { NextResponse } from "next/server";
import { buildSenaApiDocumentation, buildSenaOpenApiDocument } from "@/lib/sena/api-docs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format === "openapi") {
    return NextResponse.json(buildSenaOpenApiDocument({ serverUrl: url.origin }));
  }
  return NextResponse.json(buildSenaApiDocumentation({ baseUrl: url.origin }));
}
