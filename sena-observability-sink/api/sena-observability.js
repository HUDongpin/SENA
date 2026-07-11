const { createHmac, timingSafeEqual } = require("node:crypto");

const expectedSchema = "sena-enterprise-observed-request/v1";
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

function signatureMatches(body, signatureHeader, secret) {
  const received = String(signatureHeader || "").replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer);
}

function redactedLog(payload) {
  const sample = payload && typeof payload === "object" ? payload.sample : undefined;
  if (!sample || typeof sample !== "object") return;
  console.log(JSON.stringify({
    event: "sena.observability.accepted",
    generatedAt: new Date().toISOString(),
    routeId: sample.routeId,
    method: sample.method,
    statusClass: sample.statusClass,
    durationMs: sample.durationMs,
    requestIdHashPresent: typeof sample.requestIdHash === "string",
    payloadValuesExcluded: true
  }));
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
  } catch (error) {
    res.status(413).json({ error: "payload_too_large" });
    return;
  }

  if (req.headers["x-sena-schema-version"] !== expectedSchema) {
    res.status(400).json({ error: "schema_version_mismatch" });
    return;
  }

  if (!signatureMatches(body, req.headers["x-sena-signature"], secret)) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  try {
    redactedLog(JSON.parse(body));
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  res.status(204).end();
};
