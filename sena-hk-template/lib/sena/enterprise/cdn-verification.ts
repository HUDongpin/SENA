import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  envValue,
  now,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";

export type SenaEnterpriseCdnProbeStatus = "pass" | "review";

export type SenaEnterpriseCdnContract = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseCdnContract;
  generatedAt: string;
  status: "pass" | "review";
  summary: {
    ruleCount: number;
    htmlCompressionRequired: true;
    immutableStaticAssetCachingRequired: true;
    mutableHtmlNotImmutable: true;
    cacheKeyNoiseExcluded: true;
  };
  target: {
    configured: boolean;
    source: "SENA_CDN_VERIFY_URL" | "SENA_CDN_URL" | "SENA_APP_URL" | "NEXT_PUBLIC_SENA_APP_URL" | "missing";
    hostHash?: string;
    originHash?: string;
    urlValueExcluded: true;
  };
  cachePolicy: {
    html: {
      pathPattern: "application-html";
      compressionRequired: true;
      immutableForbidden: true;
      maxAgeRecommendationSeconds: 60;
      reason: "workspace shell and auth/runtime headers may vary";
    };
    nextStaticAssets: {
      pathPattern: "/_next/static/**";
      immutableRequired: true;
      minMaxAgeSeconds: 31_536_000;
      contentAddressedByBuild: true;
      queryValuesExcluded: true;
    };
    cacheKey: {
      stableInputs: string[];
      excludedNoise: string[];
      languageAwareWhenLocalized: true;
      staleWhileRevalidateOptInOnly: true;
    };
  };
  liveProbe: {
    requiredBeforeProduction: true;
    checks: Array<"html-compression" | "static-asset-discovery" | "static-asset-immutable-cache">;
    command: "npm run sena:cdn:verify";
  };
  evidence: string[];
  redaction: {
    urlValuesExcluded: true;
    hostValuesHashed: true;
    pathValuesHashed: true;
    queryValuesExcluded: true;
  };
};

export type SenaEnterpriseCdnProbe = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseCdnProbe;
  generatedAt: string;
  status: SenaEnterpriseCdnProbeStatus;
  target: {
    configured: boolean;
    source: "SENA_CDN_VERIFY_URL" | "SENA_CDN_URL" | "SENA_APP_URL" | "NEXT_PUBLIC_SENA_APP_URL" | "missing";
    hostHash?: string;
    originHash?: string;
    urlValueExcluded: true;
  };
  html: {
    attempted: boolean;
    status: SenaEnterpriseCdnProbeStatus;
    httpStatus?: number;
    contentEncoding?: string;
    compressed: boolean;
    cacheControl?: string;
  };
  staticAsset: {
    attempted: boolean;
    discovered: boolean;
    status: SenaEnterpriseCdnProbeStatus;
    pathHash?: string;
    httpStatus?: number;
    cacheControl?: string;
    maxAgeSeconds?: number;
    immutable: boolean;
  };
  evidence: string[];
  redaction: {
    urlValuesExcluded: true;
    hostValuesHashed: true;
  };
  contract: SenaEnterpriseCdnContract;
};

export type SenaEnterpriseCdnProbeReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  evidence: string[];
};

export type SenaEnterpriseCdnContractReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function positiveIntegerEnv(key: string, fallback: number, max: number) {
  const parsed = Number(envValue(key));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function validSha256(value: string | undefined) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

export function enterpriseCdnLiveProbeRequired() {
  return process.env.NODE_ENV === "production" ||
    booleanEnv("SENA_CDN_LIVE_PROBE_REQUIRED") ||
    booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH") ||
    booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED") ||
    booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED");
}

function targetFromEnv() {
  const candidates = [
    "SENA_CDN_VERIFY_URL",
    "SENA_CDN_URL",
    "SENA_APP_URL",
    "NEXT_PUBLIC_SENA_APP_URL"
  ] as const;
  for (const key of candidates) {
    const value = envValue(key);
    if (value) return { source: key, value };
  }
  return { source: "missing" as const, value: undefined };
}

function normalizeTargetUrl(raw?: string) {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

function responseHeader(headers: Headers, name: string) {
  return headers.get(name)?.trim() || undefined;
}

function compressedEncoding(value?: string) {
  const normalized = value?.toLowerCase() ?? "";
  return normalized.includes("br") || normalized.includes("gzip") || normalized.includes("zstd");
}

function maxAgeSeconds(cacheControl?: string) {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl ?? "");
  return match ? Number(match[1]) : undefined;
}

function immutableCache(cacheControl?: string) {
  return /(?:^|,)\s*immutable(?:,|$)/i.test(cacheControl ?? "");
}

function redactedCdnTarget(): SenaEnterpriseCdnContract["target"] {
  const target = targetFromEnv();
  const targetUrl = normalizeTargetUrl(target.value);
  return {
    configured: Boolean(targetUrl),
    source: target.source,
    hostHash: targetUrl ? sha256Text(targetUrl.host) : undefined,
    originHash: targetUrl ? sha256Text(targetUrl.origin) : undefined,
    urlValueExcluded: true
  };
}

export function buildEnterpriseCdnContract(): SenaEnterpriseCdnContract {
  const ruleCount = 6;
  const target = redactedCdnTarget();
  const status = ruleCount >= 6 ? "pass" : "review";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCdnContract,
    generatedAt: now(),
    status,
    summary: {
      ruleCount,
      htmlCompressionRequired: true,
      immutableStaticAssetCachingRequired: true,
      mutableHtmlNotImmutable: true,
      cacheKeyNoiseExcluded: true
    },
    target,
    cachePolicy: {
      html: {
        pathPattern: "application-html",
        compressionRequired: true,
        immutableForbidden: true,
        maxAgeRecommendationSeconds: 60,
        reason: "workspace shell and auth/runtime headers may vary"
      },
      nextStaticAssets: {
        pathPattern: "/_next/static/**",
        immutableRequired: true,
        minMaxAgeSeconds: 31_536_000,
        contentAddressedByBuild: true,
        queryValuesExcluded: true
      },
      cacheKey: {
        stableInputs: [
          "host",
          "pathname",
          "next-build-static-asset-id",
          "accept-encoding",
          "locale-when-localized"
        ],
        excludedNoise: [
          "session-cookie",
          "authorization-header",
          "request-id",
          "timestamp",
          "csrf-token",
          "opaque-query-values"
        ],
        languageAwareWhenLocalized: true,
        staleWhileRevalidateOptInOnly: true
      }
    },
    liveProbe: {
      requiredBeforeProduction: true,
      checks: [
        "html-compression",
        "static-asset-discovery",
        "static-asset-immutable-cache"
      ],
      command: "npm run sena:cdn:verify"
    },
    evidence: [
      "cdnContractSource=cdn-verification",
      `cdnContractStatus=${status}`,
      `cdnContractTargetConfigured=${target.configured}`,
      `cdnContractTargetSource=${target.source}`,
      "cdnContractHtmlCompressionRequired=true",
      "cdnContractHtmlImmutableForbidden=true",
      "cdnContractStaticAssetPattern=/_next/static/**",
      "cdnContractStaticAssetImmutableRequired=true",
      "cdnContractStaticAssetMinMaxAgeSeconds=31536000",
      "cdnContractCacheKeyNoise=session-cookie|authorization-header|request-id|timestamp|csrf-token|opaque-query-values",
      "cdnContractStaleWhileRevalidate=opt-in-only",
      "targetUrlValue=excluded",
      "hostValues=hashed",
      "pathValues=hashed",
      "queryValues=excluded"
    ],
    redaction: {
      urlValuesExcluded: true,
      hostValuesHashed: true,
      pathValuesHashed: true,
      queryValuesExcluded: true
    }
  };
}

function discoverStaticAsset(html: string, baseUrl: URL) {
  const match = /(?:src|href)=["']([^"']*\/_next\/static\/[^"']+\.(?:js|css)(?:\?[^"']*)?)["']/i.exec(html);
  const configured = envValue("SENA_CDN_STATIC_ASSET_URL");
  const candidate = configured || match?.[1];
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate, baseUrl);
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

function reviewProbe(input: {
  source: SenaEnterpriseCdnProbe["target"]["source"];
  targetUrl?: URL;
  evidence: string[];
}): SenaEnterpriseCdnProbe {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCdnProbe,
    generatedAt: now(),
    status: "review",
    target: {
      configured: Boolean(input.targetUrl),
      source: input.source,
      hostHash: input.targetUrl ? sha256Text(input.targetUrl.host) : undefined,
      originHash: input.targetUrl ? sha256Text(input.targetUrl.origin) : undefined,
      urlValueExcluded: true
    },
    html: {
      attempted: Boolean(input.targetUrl),
      status: "review",
      compressed: false
    },
    staticAsset: {
      attempted: false,
      discovered: false,
      status: "review",
      immutable: false
    },
    evidence: input.evidence,
    redaction: {
      urlValuesExcluded: true,
      hostValuesHashed: true
    },
    contract: buildEnterpriseCdnContract()
  };
}

export function enterpriseCdnContractReadiness(): SenaEnterpriseCdnContractReadiness {
  const artifactHash = envValue("SENA_CDN_CONTRACT_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_CDN_CONTRACT_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_CDN_CONTRACT_ARTIFACT_VALIDATION") === "pass";
  const required = enterpriseCdnLiveProbeRequired() ||
    booleanEnv("SENA_CDN_CONTRACT_REQUIRED");
  const confirmed = booleanEnv("SENA_CDN_CONTRACT_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  return {
    required,
    confirmed,
    artifactHash,
    verifiedAt,
    artifactHashConfigured,
    verifiedAtConfigured,
    evidence: [
      `cdnContractRequired=${required}`,
      `cdnContractConfirmed=${confirmed}`,
      `cdnContractExplicitlyRequired=${booleanEnv("SENA_CDN_CONTRACT_REQUIRED")}`,
      `cdnContractProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `cdnContractProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `cdnContractProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `cdnContractSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `cdnContractArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `cdnContractVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `cdnContractArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      `cdnContractSchema=${SENA_SCHEMA_VERSIONS.enterpriseCdnContract}`,
      "cdnContractScript=npm run sena:cdn:contract",
      "cdnContractSource=cdn-verification"
    ]
  };
}

export function enterpriseCdnProbeReadiness(): SenaEnterpriseCdnProbeReadiness {
  const artifactHash = envValue("SENA_CDN_PROBE_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_CDN_PROBE_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_CDN_PROBE_ARTIFACT_VALIDATION") === "pass";
  const confirmed = booleanEnv("SENA_CDN_LIVE_PROBE_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  const required = enterpriseCdnLiveProbeRequired();
  return {
    required,
    confirmed,
    artifactHash,
    verifiedAt,
    evidence: [
      `cdnLiveProbeRequired=${required}`,
      `cdnLiveProbeConfirmed=${confirmed}`,
      `cdnProbeExplicitlyRequired=${booleanEnv("SENA_CDN_LIVE_PROBE_REQUIRED")}`,
      `cdnProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `cdnProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `cdnProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `cdnSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `cdnProbeArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `cdnProbeVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `cdnProbeArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      "cdnProbeApi=/api/sena/ops/cdn",
      "cdnProbeScript=npm run sena:cdn:verify"
    ]
  };
}

export async function verifyEnterpriseCdnProbe(input: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<SenaEnterpriseCdnProbe> {
  const target = targetFromEnv();
  const targetUrl = normalizeTargetUrl(target.value);
  if (!targetUrl) {
    return reviewProbe({
      source: target.source,
      targetUrl,
      evidence: [
        "target=missing-or-invalid",
        "set=SENA_CDN_VERIFY_URL|SENA_CDN_URL|SENA_APP_URL"
      ]
    });
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? positiveIntegerEnv("SENA_CDN_PROBE_TIMEOUT_MS", 5000, 30_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const htmlResponse = await fetchImpl(targetUrl, {
      headers: {
        "accept": "text/html",
        "accept-encoding": "br, gzip"
      },
      signal: controller.signal
    });
    const htmlText = await htmlResponse.text();
    const htmlEncoding = responseHeader(htmlResponse.headers, "content-encoding");
    const htmlCacheControl = responseHeader(htmlResponse.headers, "cache-control");
    const htmlCompressed = compressedEncoding(htmlEncoding);
    const staticAssetUrl = discoverStaticAsset(htmlText, targetUrl);
    let staticHttpStatus: number | undefined;
    let staticCacheControl: string | undefined;
    let staticImmutable = false;
    let staticMaxAge: number | undefined;
    if (staticAssetUrl) {
      const staticResponse = await fetchImpl(staticAssetUrl, {
        headers: {
          "accept": "*/*",
          "accept-encoding": "br, gzip"
        },
        signal: controller.signal
      });
      staticHttpStatus = staticResponse.status;
      staticCacheControl = responseHeader(staticResponse.headers, "cache-control");
      staticMaxAge = maxAgeSeconds(staticCacheControl);
      staticImmutable = immutableCache(staticCacheControl);
      await staticResponse.arrayBuffer().catch(() => undefined);
    }

    const staticReady = Boolean(staticAssetUrl) &&
      staticHttpStatus !== undefined &&
      staticHttpStatus >= 200 &&
      staticHttpStatus < 400 &&
      staticImmutable &&
      (staticMaxAge ?? 0) >= 31_536_000;
    const htmlReady = htmlResponse.status >= 200 && htmlResponse.status < 400 && htmlCompressed;
    const status: SenaEnterpriseCdnProbeStatus = htmlReady && staticReady ? "pass" : "review";
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCdnProbe,
      generatedAt: now(),
      status,
      target: {
        configured: true,
        source: target.source,
        hostHash: sha256Text(targetUrl.host),
        originHash: sha256Text(targetUrl.origin),
        urlValueExcluded: true
      },
      html: {
        attempted: true,
        status: htmlReady ? "pass" : "review",
        httpStatus: htmlResponse.status,
        contentEncoding: htmlEncoding,
        compressed: htmlCompressed,
        cacheControl: htmlCacheControl
      },
      staticAsset: {
        attempted: Boolean(staticAssetUrl),
        discovered: Boolean(staticAssetUrl),
        status: staticReady ? "pass" : "review",
        pathHash: staticAssetUrl ? sha256Text(staticAssetUrl.pathname) : undefined,
        httpStatus: staticHttpStatus,
        cacheControl: staticCacheControl,
        maxAgeSeconds: staticMaxAge,
        immutable: staticImmutable
      },
      evidence: [
        `targetSource=${target.source}`,
        `targetHostHash=${sha256Text(targetUrl.host) ?? "missing"}`,
        "targetUrlValue=excluded",
        `htmlStatus=${htmlResponse.status}`,
        `htmlCompression=${htmlCompressed ? "pass" : "review"}`,
        `htmlContentEncoding=${htmlEncoding ?? "missing"}`,
        `staticDiscovered=${Boolean(staticAssetUrl)}`,
        `staticPathHash=${staticAssetUrl ? sha256Text(staticAssetUrl.pathname) : "missing"}`,
        `staticStatus=${staticHttpStatus ?? "missing"}`,
        `staticImmutable=${staticImmutable}`,
        `staticMaxAgeSeconds=${staticMaxAge ?? "missing"}`,
        `timeoutMs=${timeoutMs}`
      ],
      redaction: {
        urlValuesExcluded: true,
        hostValuesHashed: true
      },
      contract: buildEnterpriseCdnContract()
    };
  } catch (error) {
    const code = error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch_error";
    return reviewProbe({
      source: target.source,
      targetUrl,
      evidence: [
        `targetSource=${target.source}`,
        `targetHostHash=${sha256Text(targetUrl.host) ?? "missing"}`,
        `errorCode=${code}`,
        "errorValue=excluded",
        `timeoutMs=${timeoutMs}`
      ]
    });
  } finally {
    clearTimeout(timeout);
  }
}
