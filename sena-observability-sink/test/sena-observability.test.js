const { createHmac } = require("node:crypto");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const observabilityHandler = require("../api/sena-observability");
const alertsHandler = require("../api/sena-alerts");

function request(body, headers = {}) {
  const req = new EventEmitter();
  req.method = "POST";
  req.headers = headers;
  req.destroy = () => {};
  process.nextTick(() => {
    req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

function response() {
  return {
    statusCode: undefined,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    }
  };
}

test("accepts a valid signed SENA observability payload", async () => {
  const secret = "unit-test-secret";
  process.env.SENA_OBSERVABILITY_SINK_SECRET = secret;
  const body = JSON.stringify({
    schemaVersion: "sena-enterprise-observability-delivery/v1",
    sample: {
      requestIdHash: "a".repeat(64),
      routeId: "sena-observability-live-probe",
      method: "GET",
      statusClass: "2xx",
      durationMs: 1
    }
  });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const res = response();

  await observabilityHandler(request(body, {
    "x-sena-schema-version": "sena-enterprise-observed-request/v1",
    "x-sena-signature": `sha256=${signature}`
  }), res);

  assert.equal(res.statusCode, 204);
});

test("rejects an invalid signature", async () => {
  process.env.SENA_OBSERVABILITY_SINK_SECRET = "unit-test-secret";
  const res = response();

  await observabilityHandler(request("{}", {
    "x-sena-schema-version": "sena-enterprise-observed-request/v1",
    "x-sena-signature": `sha256=${"b".repeat(64)}`
  }), res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "invalid_signature" });
});

test("accepts a valid signed SENA alert webhook", async () => {
  const secret = "unit-test-secret";
  process.env.SENA_OBSERVABILITY_SINK_SECRET = secret;
  const timestamp = "2026-07-02T03:45:00.000Z";
  const body = JSON.stringify({ alertId: "redacted", severity: "p1" });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const res = response();

  await alertsHandler(request(body, {
    "x-sena-webhook-event": "ops.alert",
    "x-sena-webhook-timestamp": timestamp,
    "x-sena-webhook-signature": `sha256=${signature}`
  }), res);

  assert.equal(res.statusCode, 204);
});
