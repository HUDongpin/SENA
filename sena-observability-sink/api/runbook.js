module.exports = function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SENA Observability Runbook</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; max-width: 760px; line-height: 1.55; color: #172033; }
    h1 { font-size: 1.6rem; margin-bottom: 0.5rem; }
    li { margin: 0.35rem 0; }
    code { background: #f2f5f8; padding: 0.1rem 0.25rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>SENA Meeting Demo Observability Runbook</h1>
  <ol>
    <li>Check <code>https://www.sena.hk</code> for HTTP 200 and <code>x-sena-runtime=enterprise-neon</code>.</li>
    <li>Run the SENA production preflight and observability probe from the release workspace.</li>
    <li>If signed delivery fails, rotate the shared sink secret in both Vercel projects and redeploy SENA.</li>
    <li>If p95 latency or error rate breaches SLO, pause the live demo and use the built-in sample dataset locally.</li>
  </ol>
</body>
</html>`);
};
