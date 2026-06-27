import { NextResponse, type NextRequest } from "next/server";
import { buildSenaSecurityHeaders } from "@/lib/sena/security-headers";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  Object.entries(buildSenaSecurityHeaders()).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("cache-control", "no-store");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
