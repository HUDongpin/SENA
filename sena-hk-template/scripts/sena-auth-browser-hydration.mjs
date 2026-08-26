function isRegisterPreflightResponse(candidate, origin) {
  const candidateUrl = new URL(candidate.url());
  return (
    candidateUrl.origin === origin &&
    candidateUrl.pathname === "/api/auth/sso" &&
    candidateUrl.searchParams.get("status") === "1" &&
    candidateUrl.searchParams.get("preflight") === "1" &&
    candidate.request().method() === "GET"
  );
}

export async function gotoHydratedSenaRegisterPage(page, origin, timeout) {
  const [preflightResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) => isRegisterPreflightResponse(candidate, origin),
      { timeout }
    ),
    page.goto(`${origin}/register`, {
      waitUntil: "domcontentloaded",
      timeout
    })
  ]);

  if (!preflightResponse.ok()) {
    throw new Error(
      `Register hydration preflight returned HTTP ${preflightResponse.status()}.`
    );
  }
}
