import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_CDN_VERIFY_URL",
  "SENA_CDN_ENABLED",
  "SENA_CDN_PROVIDER",
  "SENA_CDN_URL",
  "SENA_CDN_COMPRESSION_CONFIRMED",
  "SENA_CDN_STATIC_ASSET_CACHE_SECONDS",
  "SENA_CDN_CONTRACT_REQUIRED",
  "SENA_CDN_CONTRACT_CONFIRMED",
  "SENA_CDN_CONTRACT_ARTIFACT_SHA256",
  "SENA_CDN_CONTRACT_VERIFIED_AT",
  "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_CDN_LIVE_PROBE_CONFIRMED",
  "SENA_CDN_LIVE_PROBE_REQUIRED",
  "SENA_CDN_PROBE_ARTIFACT_SHA256",
  "SENA_CDN_PROBE_VERIFIED_AT",
  "SENA_CDN_PROBE_ARTIFACT_VALIDATION",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
  "SENA_OPS_TOKEN"
];

function headers(entries: Record<string, string>) {
  return new Headers(entries);
}

describe("SENA CDN live verification", () => {
  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    vi.resetModules();
  });

  it("passes with compressed HTML and immutable static asset caching without leaking URL values", async () => {
    process.env.SENA_CDN_VERIFY_URL = "https://cdn.example.test/workspace/sena";
    const { verifyEnterpriseCdnProbe } = await import("../enterprise/cdn-verification");
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/workspace/sena")) {
        return new Response("<html><script src=\"/_next/static/chunks/app/workspace/sena/page-abc123.js\"></script></html>", {
          status: 200,
          headers: headers({
            "content-encoding": "br",
            "cache-control": "public, max-age=60"
          })
        });
      }
      if (url.endsWith("/_next/static/chunks/app/workspace/sena/page-abc123.js")) {
        return new Response("console.log('sena')", {
          status: 200,
          headers: headers({
            "cache-control": "public, max-age=31536000, immutable"
          })
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const probe = await verifyEnterpriseCdnProbe({ fetchImpl });

    expect(probe.schemaVersion).toBe("sena-enterprise-cdn-probe/v1");
    expect(probe.status).toBe("pass");
    expect(probe.contract).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-cdn-contract/v1",
      status: "pass"
    }));
    expect(probe.contract.cachePolicy.nextStaticAssets).toEqual(expect.objectContaining({
      immutableRequired: true,
      minMaxAgeSeconds: 31_536_000
    }));
    expect(probe.html).toEqual(expect.objectContaining({
      status: "pass",
      compressed: true,
      contentEncoding: "br"
    }));
    expect(probe.staticAsset).toEqual(expect.objectContaining({
      status: "pass",
      discovered: true,
      immutable: true,
      maxAgeSeconds: 31_536_000,
      pathHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(JSON.stringify(probe)).not.toContain("cdn.example.test");
    expect(JSON.stringify(probe)).not.toContain("/workspace/sena");
    expect(JSON.stringify(probe)).not.toContain("page-abc123.js");
  });

  it("generates a redacted CDN compression and immutable-cache contract", async () => {
    process.env.SENA_CDN_VERIFY_URL = "https://cdn.example.test/workspace/sena?token=secret";
    const { buildEnterpriseCdnContract } = await import("../enterprise/cdn-verification");

    const contract = buildEnterpriseCdnContract();
    const serialized = JSON.stringify(contract);

    expect(contract.schemaVersion).toBe("sena-enterprise-cdn-contract/v1");
    expect(contract.status).toBe("pass");
    expect(contract.summary).toEqual(expect.objectContaining({
      ruleCount: 6,
      htmlCompressionRequired: true,
      immutableStaticAssetCachingRequired: true,
      mutableHtmlNotImmutable: true,
      cacheKeyNoiseExcluded: true
    }));
    expect(contract.cachePolicy.html).toEqual(expect.objectContaining({
      compressionRequired: true,
      immutableForbidden: true,
      maxAgeRecommendationSeconds: 60
    }));
    expect(contract.cachePolicy.nextStaticAssets).toEqual(expect.objectContaining({
      pathPattern: "/_next/static/**",
      immutableRequired: true,
      minMaxAgeSeconds: 31_536_000,
      contentAddressedByBuild: true,
      queryValuesExcluded: true
    }));
    expect(contract.cachePolicy.cacheKey.excludedNoise).toEqual(expect.arrayContaining([
      "session-cookie",
      "authorization-header",
      "request-id",
      "timestamp",
      "csrf-token"
    ]));
    expect(contract.evidence).toEqual(expect.arrayContaining([
      "cdnContractSource=cdn-verification",
      "cdnContractStatus=pass",
      "cdnContractStaticAssetPattern=/_next/static/**",
      "cdnContractStaticAssetMinMaxAgeSeconds=31536000",
      "cdnContractStaleWhileRevalidate=opt-in-only"
    ]));
    expect(serialized).not.toContain("cdn.example.test");
    expect(serialized).not.toContain("/workspace/sena");
    expect(serialized).not.toContain("token=secret");
  });

  it("discovers Vercel static assets that include deployment query parameters", async () => {
    process.env.SENA_CDN_VERIFY_URL = "https://cdn.example.test/workspace/sena";
    const { verifyEnterpriseCdnProbe } = await import("../enterprise/cdn-verification");
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/workspace/sena")) {
        return new Response("<html><link rel=\"stylesheet\" href=\"/_next/static/css/app.css?dpl=dpl_123\"/></html>", {
          status: 200,
          headers: headers({
            "content-encoding": "br",
            "cache-control": "public, max-age=60"
          })
        });
      }
      if (url.endsWith("/_next/static/css/app.css?dpl=dpl_123")) {
        return new Response("body{}", {
          status: 200,
          headers: headers({
            "cache-control": "public, max-age=31536000, immutable"
          })
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const probe = await verifyEnterpriseCdnProbe({ fetchImpl });

    expect(probe.status).toBe("pass");
    expect(probe.staticAsset).toEqual(expect.objectContaining({
      attempted: true,
      discovered: true,
      status: "pass"
    }));
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/_next/static/css/app.css",
        search: "?dpl=dpl_123"
      }),
      expect.any(Object)
    );
  });

  it("requires a valid artifact hash and validation before live probe confirmation can satisfy readiness", async () => {
    const freshVerifiedAt = new Date().toISOString();
    process.env.SENA_CDN_LIVE_PROBE_REQUIRED = "1";
    process.env.SENA_CDN_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_CDN_PROBE_VERIFIED_AT = freshVerifiedAt;
    const { enterpriseCdnProbeReadiness } = await import("../enterprise/cdn-verification");

    expect(enterpriseCdnProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false
    }));

    process.env.SENA_CDN_PROBE_ARTIFACT_SHA256 = "a".repeat(64);
    process.env.SENA_CDN_PROBE_ARTIFACT_VALIDATION = "pass";
    expect(enterpriseCdnProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "a".repeat(64),
      verifiedAt: freshVerifiedAt
    }));
  });

  it("requires a valid CDN contract artifact before contract confirmation can satisfy readiness", async () => {
    const freshVerifiedAt = new Date().toISOString();
    process.env.SENA_CDN_CONTRACT_REQUIRED = "1";
    process.env.SENA_CDN_CONTRACT_CONFIRMED = "1";
    process.env.SENA_CDN_CONTRACT_VERIFIED_AT = freshVerifiedAt;
    const { enterpriseCdnContractReadiness } = await import("../enterprise/cdn-verification");

    expect(enterpriseCdnContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: false,
      verifiedAtConfigured: true
    }));

    process.env.SENA_CDN_CONTRACT_ARTIFACT_SHA256 = "b".repeat(64);
    process.env.SENA_CDN_CONTRACT_ARTIFACT_VALIDATION = "pass";
    expect(enterpriseCdnContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "b".repeat(64),
      verifiedAt: freshVerifiedAt,
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
  });

  it("requires live CDN probe evidence under production performance gates instead of manual compression claims", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_CDN_ENABLED = "1";
    process.env.SENA_CDN_PROVIDER = "institution-cdn";
    process.env.SENA_CDN_URL = "https://cdn.example.test/sena";
    process.env.SENA_CDN_COMPRESSION_CONFIRMED = "1";
    process.env.SENA_CDN_STATIC_ASSET_CACHE_SECONDS = "31536000";

    const { enterpriseCdnProbeReadiness } = await import("../enterprise/cdn-verification");
    const readiness = enterpriseCdnProbeReadiness();

    expect(readiness).toEqual(expect.objectContaining({
      required: true,
      confirmed: false
    }));
    expect(readiness.evidence).toEqual(expect.arrayContaining([
      "cdnProductionPerformancePathRequired=true",
      "cdnProbeArtifactSha256=missing-or-invalid",
      "cdnProbeVerifiedAt=missing-or-invalid"
    ]));

    const { buildEnterpriseProductionPerformancePath } = await import("../enterprise/ops-productionization");
    const performancePath = buildEnterpriseProductionPerformancePath({
      opsStatus: {
        storage: {
          engine: "postgres",
          primaryStateRuntime: {
            mode: "postgres",
            activePrimary: "postgres",
            postgresPrimaryRequested: true
          }
        },
        counts: {
          uploads: 0
        },
        deployment: {
          objectStorageNativeConfigured: true,
          objectStorageWebhookConfigured: false,
          opsTokenConfigured: true
        }
      } as never,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody: {
        source: "postgres-table",
        totalUploads: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        skipped: 0,
        pendingReview: 0,
        eligibleForDelivery: 0,
        eligibleDelivered: 0,
        eligibleUndelivered: 0,
        ready: true,
        evidence: ["uploadCustodySource=postgres-table"]
      }
    });
    const cdnItem = performancePath.items.find((item) => item.id === "production-cdn-compression");

    expect(cdnItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(cdnItem?.evidence).toEqual(expect.arrayContaining([
      "compressionConfirmed=true",
      "cdnContractRequired=true",
      "cdnContractConfirmed=false",
      "cdnContractArtifactSha256=missing-or-invalid",
      "cdnLiveProbeRequired=true",
      "cdnLiveProbeConfirmed=false",
      "cdnProbeArtifactSha256=missing-or-invalid",
      "cdnProbeVerifiedAt=missing-or-invalid"
    ]));
  });

  it("keeps production CDN under review when the live probe is confirmed but the contract artifact is missing", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_CDN_ENABLED = "1";
    process.env.SENA_CDN_PROVIDER = "institution-cdn";
    process.env.SENA_CDN_URL = "https://cdn.example.test/sena";
    process.env.SENA_CDN_COMPRESSION_CONFIRMED = "1";
    process.env.SENA_CDN_STATIC_ASSET_CACHE_SECONDS = "31536000";
    process.env.SENA_CDN_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_CDN_PROBE_ARTIFACT_SHA256 = "a".repeat(64);
    process.env.SENA_CDN_PROBE_VERIFIED_AT = new Date().toISOString();
    process.env.SENA_CDN_PROBE_ARTIFACT_VALIDATION = "pass";

    const { buildEnterpriseProductionPerformancePath } = await import("../enterprise/ops-productionization");
    const performancePath = buildEnterpriseProductionPerformancePath({
      opsStatus: {
        storage: {
          engine: "postgres",
          primaryStateRuntime: {
            mode: "postgres",
            activePrimary: "postgres",
            postgresPrimaryRequested: true
          }
        },
        counts: {
          uploads: 0
        },
        deployment: {
          objectStorageNativeConfigured: true,
          objectStorageWebhookConfigured: false,
          opsTokenConfigured: true
        }
      } as never,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody: {
        source: "postgres-table",
        totalUploads: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        skipped: 0,
        pendingReview: 0,
        eligibleForDelivery: 0,
        eligibleDelivered: 0,
        eligibleUndelivered: 0,
        ready: true,
        evidence: ["uploadCustodySource=postgres-table"]
      }
    });
    const cdnItem = performancePath.items.find((item) => item.id === "production-cdn-compression");

    expect(cdnItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(performancePath.summary.blockers).toContain("production-cdn-compression");
    expect(cdnItem?.evidence).toEqual(expect.arrayContaining([
      "cdnContractRequired=true",
      "cdnContractConfirmed=false",
      "cdnContractArtifactSha256=missing-or-invalid",
      "cdnLiveProbeRequired=true",
      "cdnLiveProbeConfirmed=true",
      "cdnProbeArtifactSha256=present",
      "cdnProbeVerifiedAt=valid"
    ]));
    expect(cdnItem?.nextAction).toContain("sena:cdn:contract");
    expect(JSON.stringify(cdnItem)).not.toContain("cdn.example.test");
  });

  it("exposes the CDN probe through the ops route with redacted headers", async () => {
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    process.env.SENA_CDN_VERIFY_URL = "https://cdn.example.test/workspace/sena";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/workspace/sena")) {
        return new Response("<html><script src=\"/_next/static/chunks/app/workspace/sena/page-abc123.js\"></script></html>", {
          status: 200,
          headers: headers({ "content-encoding": "gzip" })
        });
      }
      return new Response("console.log('sena')", {
        status: 200,
        headers: headers({ "cache-control": "public, max-age=31536000, immutable" })
      });
    }) as typeof fetch;
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/cdn/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/cdn", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as { schemaVersion?: string; status?: string };

      expect(response.status).toBe(200);
      expect(body.schemaVersion).toBe("sena-enterprise-cdn-probe/v1");
      expect(body.status).toBe("pass");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-cdn");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("x-sena-cdn-probe")).toBe("pass");
      expect(response.headers.get("x-sena-cdn-url-value")).toBe("excluded");
      expect(response.headers.get("x-sena-cdn-target-host-hash")).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(body)).not.toContain("cdn.example.test");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SENA_OPS_TOKEN;
    }
  });
});
