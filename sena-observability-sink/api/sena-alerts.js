const { createHmac, timingSafeEqual } = require("node:crypto");

const maxBodyBytes = 128 * 1024;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function signatureMatches(timestamp, body, signatureHeader, secret) {
  const received = String(signatureHeader || "").replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(received) || !timestamp) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer);
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const secret = process.env.SENA_OBSERVABILITY_SINK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "sink_secret_not_configured" });
    return;
  }

  let body;
  try {
    body = await readRawBody(req);
  } catch {
    res.status(413).json({ error: "payload_too_large" });
    return;
  }

  const event = req.headers["x-sena-webhook-event"];
  const timestamp = req.headers["x-sena-webhook-timestamp"];
  if (event !== "ops.alert") {
    res.status(400).json({ error: "event_mismatch" });
    return;
  }

  if (!signatureMatches(timestamp, body, req.headers["x-sena-webhook-signature"], secret)) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  console.log(JSON.stringify({
    event: "sena.alert.accepted",
    generatedAt: new Date().toISOString(),
    webhookEvent: event,
    payloadValuesExcluded: true
  }));

  res.status(204).end();
};
