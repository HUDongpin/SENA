module.exports = function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SENA Observability Dashboard</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; max-width: 760px; line-height: 1.55; color: #172033; }
    h1 { font-size: 1.6rem; margin-bottom: 0.5rem; }
    code { background: #f2f5f8; padding: 0.1rem 0.25rem; border-radius: 4px; }
    .status { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 999px; background: #e8f7ee; color: #166534; font-weight: 650; }
  </style>
</head>
<body>
  <h1>SENA Observability Dashboard</h1>
  <p><span class="status">external sink online</span></p>
  <p>This endpoint is the human-readable dashboard URL used by SENA production evidence. The signed machine sinks are <code>/api/sena-observability</code> and <code>/api/sena-alerts</code>.</p>
  <p>Signals: signed probe delivery, redacted observed-request payloads, request-id hashes, route IDs, status class, latency, and error flags.</p>
</body>
</html>`);
};
