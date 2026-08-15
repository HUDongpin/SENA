import { createHash, createHmac, randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import { senaProductionPosture } from "./auth-config";
import {
  envValue,
  now,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";
import {
  webhookErrorHash,
  webhookTimeoutMs
} from "./webhook-delivery";

export type SenaEnterpriseObjectStorageNativeMode = "native-s3" | "native-r2" | "native-gcs-s3" | "native-vercel-blob" | "not-configured";

export type SenaEnterpriseObjectStorageNativeProvider = {
  mode: SenaEnterpriseObjectStorageNativeMode;
  configured: boolean;
  productionReady: boolean;
  endpointHash?: string;
  bucketHash?: string;
  region?: string;
  prefix: string;
  accessKeyConfigured: boolean;
  secretConfigured: boolean;
  timeoutMs: number;
  evidence: string[];
};

export type SenaEnterpriseObjectStoragePutResult = {
  ok: boolean;
  endpointHash?: string;
  bucketHash?: string;
  httpStatus?: number;
  objectVersion?: string;
  etagHash?: string;
  errorCode?: string;
  errorHash?: string;
};

export type SenaEnterpriseObjectStorageProbeStatus = "pass" | "review";

export type SenaEnterpriseObjectStorageProbeStep = {
  attempted: boolean;
  status: SenaEnterpriseObjectStorageProbeStatus;
  httpStatus?: number;
  objectVersion?: string;
  etagHash?: string;
  errorCode?: string;
  errorHash?: string;
};

export type SenaEnterpriseObjectStorageContract = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseObjectStorageContract;
  generatedAt: string;
  status: "pass" | "review";
  summary: {
    supportedProviderCount: number;
    operationCount: number;
    keyPolicyCount: number;
    privateAccessRequired: true;
    uploadCustodyRequired: true;
    liveProbeRequiredBeforeProduction: true;
    localFileStoreIsProductionBackend: false;
  };
  supportedProviders: Array<{
    mode: Exclude<SenaEnterpriseObjectStorageNativeMode, "not-configured">;
    label: string;
    acceptedEnv: string[];
    secretEnv: string[];
    endpointValuesExcluded: true;
    bucketValuesExcluded: true;
    secretValuesExcluded: true;
  }>;
  namespace: {
    prefixSourceEnv: "SENA_OBJECT_STORAGE_PREFIX";
    prefixNormalization: "slash-normalized-dot-segments-removed";
    uploadObjectKeyPattern: "teams/{teamId}/uploads/{uploadId}/{sha256}-{storedName}";
    probeObjectKeyPattern: "sena-probes/object-storage-probe-{suffix}.txt";
    pathTraversalSegmentsExcluded: true;
    backslashNormalized: true;
    objectKeyValuesExcluded: true;
  };
  operations: Array<{
    method: "PUT" | "HEAD" | "DELETE";
    purpose: string;
    requiredForLiveProbe: true;
  }>;
  custody: {
    postgresColumn: "sena_enterprise_uploads.object_storage_custody";
    localJsonFallbackIsProductionBackend: false;
    requiredFields: string[];
    hashedFields: string[];
    valueFieldsExcluded: string[];
    objectVersionCaptured: true;
    etagHashed: true;
    payloadSha256Required: true;
  };
  currentNativeProvider: SenaEnterpriseObjectStorageNativeProvider & {
    endpointValueExcluded: true;
    bucketValueExcluded: true;
  };
  evidence: string[];
  redaction: {
    endpointValuesExcluded: true;
    bucketValuesExcluded: true;
    objectKeyValuesExcluded: true;
    secretValuesExcluded: true;
    payloadValuesExcluded: true;
  };
};

export type SenaEnterpriseObjectStorageProbe = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe;
  generatedAt: string;
  status: SenaEnterpriseObjectStorageProbeStatus;
  provider: SenaEnterpriseObjectStorageNativeProvider & {
    endpointValueExcluded: true;
    bucketValueExcluded: true;
  };
  probe: {
    objectKeyHash?: string;
    contentSha256?: string;
    put: SenaEnterpriseObjectStorageProbeStep;
    head: SenaEnterpriseObjectStorageProbeStep;
    delete: SenaEnterpriseObjectStorageProbeStep;
    cleanupStatus: "not-attempted" | "deleted" | "review";
  };
  evidence: string[];
  redaction: {
    endpointValuesExcluded: true;
    bucketValuesExcluded: true;
    objectKeyValuesExcluded: true;
    secretValuesExcluded: true;
  };
  contract: SenaEnterpriseObjectStorageContract;
};

export type SenaEnterpriseObjectStorageProbeReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

export type SenaEnterpriseObjectStorageContractReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

type NativeObjectStorageConfig = SenaEnterpriseObjectStorageNativeProvider & {
  endpoint?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  vercelBlobToken?: string;
  vercelBlobStoreId?: string;
  vercelBlobOidcToken?: string;
};

type SignedObjectStorageRequestResult = SenaEnterpriseObjectStoragePutResult & {
  objectKey: string;
  objectKeyHash?: string;
};

function envFirst(keys: string[]) {
  for (const key of keys) {
    const value = envValue(key);
    if (value) return { key, value };
  }
  return undefined;
}

function r2AccountId() {
  return envFirst([
    "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
    "R2_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCOUNT_ID"
  ]);
}

function r2EndpointFromAccountId(accountId: string) {
  const safeAccountId = accountId.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!/^[a-zA-Z0-9_-]+$/.test(safeAccountId)) return undefined;
  return `https://${safeAccountId}.r2.cloudflarestorage.com`;
}

function normalizedNativeMode(): SenaEnterpriseObjectStorageNativeMode {
  const adapter = envValue("SENA_OBJECT_STORAGE_ADAPTER")?.toLowerCase().replace(/_/g, "-");
  if (adapter === "s3" || adapter === "s3-compatible") return "native-s3";
  if (adapter === "r2" || adapter === "cloudflare-r2") return "native-r2";
  if (adapter === "gcs" || adapter === "gcs-s3" || adapter === "gcs-hmac") return "native-gcs-s3";
  if (adapter === "blob" || adapter === "vercel-blob" || adapter === "vercelblob") return "native-vercel-blob";
  if (envFirst([
    "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
    "R2_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCOUNT_ID",
    "R2_ENDPOINT",
    "CLOUDFLARE_R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
  ])) return "native-r2";
  if (envFirst([
    "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
    "BLOB_STORE_ID"
  ])) return "native-vercel-blob";
  return "not-configured";
}

function objectStorageEndpoint(mode: SenaEnterpriseObjectStorageNativeMode) {
  const explicit = envFirst([
    "SENA_OBJECT_STORAGE_ENDPOINT",
    "R2_ENDPOINT",
    "CLOUDFLARE_R2_ENDPOINT"
  ]);
  const value = explicit?.value ?? (mode === "native-r2" ? r2EndpointFromAccountId(r2AccountId()?.value ?? "") : undefined);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new SenaEnterpriseError("SENA_OBJECT_STORAGE_ENDPOINT must be an HTTP(S) URL.", 500, "invalid_object_storage_endpoint");
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    if (error instanceof SenaEnterpriseError) throw error;
    throw new SenaEnterpriseError("SENA_OBJECT_STORAGE_ENDPOINT must be an HTTP(S) URL.", 500, "invalid_object_storage_endpoint");
  }
}

function safePrefix() {
  return (envValue("SENA_OBJECT_STORAGE_PREFIX") ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function defaultRegion(mode: SenaEnterpriseObjectStorageNativeMode) {
  if (mode === "native-vercel-blob") return "vercel";
  if (mode === "native-r2" || mode === "native-gcs-s3") return "auto";
  return "us-east-1";
}

function resolveNativeObjectStorageConfig(): NativeObjectStorageConfig {
  const mode = normalizedNativeMode();
  const vercelBlobToken = envFirst([
    "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
    "BLOB_READ_WRITE_TOKEN"
  ]);
  const vercelBlobStoreId = envFirst([
    "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
    "BLOB_STORE_ID"
  ]);
  const vercelBlobOidcToken = envFirst([
    "SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN",
    "VERCEL_OIDC_TOKEN"
  ]);
  const endpoint = mode === "not-configured"
    ? undefined
    : mode === "native-vercel-blob"
      ? "https://blob.vercel-storage.com"
      : objectStorageEndpoint(mode);
  const bucket = mode === "native-vercel-blob"
    ? (vercelBlobStoreId?.value ?? "vercel-blob-store")
    : envFirst([
    "SENA_OBJECT_STORAGE_BUCKET",
    "R2_BUCKET_NAME",
    "R2_BUCKET",
    "CLOUDFLARE_R2_BUCKET_NAME"
  ])?.value;
  const region = envValue("SENA_OBJECT_STORAGE_REGION") ?? defaultRegion(mode);
  const prefix = safePrefix();
  const accessKey = envFirst([
    "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_ACCESS_KEY_ID"
  ]);
  const secretKey = envFirst([
    "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
  ]);
  const accessKeyId = accessKey?.value;
  const secretAccessKey = secretKey?.value;
  const endpointHash = sha256Text(endpoint);
  const bucketHash = sha256Text(bucket);
  const vercelBlobTokenConfigured = Boolean(vercelBlobToken?.value);
  const vercelBlobOidcConfigured = Boolean(vercelBlobStoreId?.value && vercelBlobOidcToken?.value);
  const accessKeyConfigured = mode === "native-vercel-blob"
    ? Boolean(vercelBlobStoreId?.value || vercelBlobToken?.value)
    : Boolean(accessKeyId);
  const secretConfigured = mode === "native-vercel-blob"
    ? Boolean(vercelBlobToken?.value || vercelBlobOidcToken?.value)
    : Boolean(secretAccessKey);
  const configured = mode !== "not-configured" &&
    Boolean(endpoint) &&
    Boolean(bucket) &&
    Boolean(region) &&
    accessKeyConfigured &&
    secretConfigured &&
    (mode !== "native-vercel-blob" || vercelBlobTokenConfigured || vercelBlobOidcConfigured);
  const missing = [
    mode === "not-configured" ? "SENA_OBJECT_STORAGE_ADAPTER=s3|r2|gcs-s3|vercel-blob or R2_ACCOUNT_ID or BLOB_READ_WRITE_TOKEN" : null,
    endpoint ? null : "SENA_OBJECT_STORAGE_ENDPOINT or R2_ENDPOINT or R2_ACCOUNT_ID",
    bucket ? null : mode === "native-vercel-blob" ? "BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN" : "SENA_OBJECT_STORAGE_BUCKET or R2_BUCKET_NAME",
    region ? null : "SENA_OBJECT_STORAGE_REGION",
    accessKeyConfigured ? null : mode === "native-vercel-blob" ? "BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN" : "SENA_OBJECT_STORAGE_ACCESS_KEY_ID or R2_ACCESS_KEY_ID",
    secretConfigured ? null : mode === "native-vercel-blob" ? "BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN" : "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY",
    mode === "native-vercel-blob" && !vercelBlobTokenConfigured && !vercelBlobOidcConfigured ? "BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID with VERCEL_OIDC_TOKEN" : null
  ].filter((value): value is string => Boolean(value));
  const timeoutMs = webhookTimeoutMs("SENA_OBJECT_STORAGE_TIMEOUT_MS", 30_000, 120_000);
  return {
    mode,
    configured,
    productionReady: configured,
    endpoint,
    bucket,
    vercelBlobToken: vercelBlobToken?.value,
    vercelBlobStoreId: vercelBlobStoreId?.value,
    vercelBlobOidcToken: vercelBlobOidcToken?.value,
    endpointHash,
    bucketHash,
    region,
    prefix,
    accessKeyId,
    secretAccessKey,
    accessKeyConfigured,
    secretConfigured,
    timeoutMs,
    evidence: [
      `nativeAdapter=${mode}`,
      `nativeConfigured=${configured}`,
      `nativeEndpointHash=${endpointHash ? "present" : "missing"}`,
      `nativeBucketHash=${bucketHash ? "present" : "missing"}`,
      `nativeRegion=${region ?? "missing"}`,
      `nativePrefix=${prefix || "none"}`,
      `nativeAccessKey=${accessKeyConfigured ? "configured" : "missing"}`,
      `nativeSecret=${secretConfigured ? "configured" : "missing"}`,
      `nativeAccessKeySource=${mode === "native-vercel-blob" ? vercelBlobStoreId?.key ?? vercelBlobToken?.key ?? "missing" : accessKey?.key ?? "missing"}`,
      `nativeSecretSource=${mode === "native-vercel-blob" ? vercelBlobToken?.key ?? vercelBlobOidcToken?.key ?? "missing" : secretKey?.key ?? "missing"}`,
      `vercelBlobAuth=${mode === "native-vercel-blob" ? vercelBlobTokenConfigured ? "read-write-token" : vercelBlobOidcConfigured ? "oidc" : "missing" : "not-applicable"}`,
      `nativeTimeoutMs=${timeoutMs}`,
      `nativeMissing=${missing.join("|") || "none"}`,
      "nativeEndpointValue=excluded",
      "nativeBucketValue=excluded"
    ]
  };
}

export function enterpriseObjectStorageNativeProvider(): SenaEnterpriseObjectStorageNativeProvider {
  const {
    endpoint: _endpoint,
    bucket: _bucket,
    accessKeyId: _accessKeyId,
    secretAccessKey: _secretAccessKey,
    vercelBlobToken: _vercelBlobToken,
    vercelBlobStoreId: _vercelBlobStoreId,
    vercelBlobOidcToken: _vercelBlobOidcToken,
    ...provider
  } = resolveNativeObjectStorageConfig();
  return provider;
}

function redactedContractProvider(): SenaEnterpriseObjectStorageContract["currentNativeProvider"] {
  return {
    ...enterpriseObjectStorageNativeProvider(),
    endpointValueExcluded: true,
    bucketValueExcluded: true
  };
}

export function buildEnterpriseObjectStorageContract(): SenaEnterpriseObjectStorageContract {
  const supportedProviders: SenaEnterpriseObjectStorageContract["supportedProviders"] = [
    {
      mode: "native-s3",
      label: "S3-compatible object storage",
      acceptedEnv: [
        "SENA_OBJECT_STORAGE_ADAPTER=s3",
        "SENA_OBJECT_STORAGE_ENDPOINT",
        "SENA_OBJECT_STORAGE_BUCKET",
        "SENA_OBJECT_STORAGE_REGION",
        "SENA_OBJECT_STORAGE_ACCESS_KEY_ID"
      ],
      secretEnv: ["SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY"],
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      secretValuesExcluded: true
    },
    {
      mode: "native-r2",
      label: "Cloudflare R2 S3-compatible object storage",
      acceptedEnv: [
        "SENA_OBJECT_STORAGE_ADAPTER=r2",
        "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID|R2_ACCOUNT_ID|CLOUDFLARE_R2_ACCOUNT_ID",
        "R2_ENDPOINT|CLOUDFLARE_R2_ENDPOINT",
        "R2_BUCKET_NAME|R2_BUCKET|CLOUDFLARE_R2_BUCKET_NAME",
        "R2_ACCESS_KEY_ID|CLOUDFLARE_R2_ACCESS_KEY_ID"
      ],
      secretEnv: ["R2_SECRET_ACCESS_KEY|CLOUDFLARE_R2_SECRET_ACCESS_KEY"],
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      secretValuesExcluded: true
    },
    {
      mode: "native-gcs-s3",
      label: "Google Cloud Storage HMAC/S3-compatible object storage",
      acceptedEnv: [
        "SENA_OBJECT_STORAGE_ADAPTER=gcs-s3",
        "SENA_OBJECT_STORAGE_ENDPOINT",
        "SENA_OBJECT_STORAGE_BUCKET",
        "SENA_OBJECT_STORAGE_REGION",
        "SENA_OBJECT_STORAGE_ACCESS_KEY_ID"
      ],
      secretEnv: ["SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY"],
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      secretValuesExcluded: true
    },
    {
      mode: "native-vercel-blob",
      label: "Vercel Blob private object storage",
      acceptedEnv: [
        "SENA_OBJECT_STORAGE_ADAPTER=vercel-blob",
        "BLOB_STORE_ID|SENA_OBJECT_STORAGE_BLOB_STORE_ID",
        "VERCEL_OIDC_TOKEN|SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN"
      ],
      secretEnv: ["BLOB_READ_WRITE_TOKEN|SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN"],
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      secretValuesExcluded: true
    }
  ];
  const operations: SenaEnterpriseObjectStorageContract["operations"] = [
    {
      method: "PUT",
      purpose: "write upload payload or live-probe object with expected sha256",
      requiredForLiveProbe: true
    },
    {
      method: "HEAD",
      purpose: "confirm stored object metadata without returning payload bytes",
      requiredForLiveProbe: true
    },
    {
      method: "DELETE",
      purpose: "delete probe object and prove cleanup before artifact binding",
      requiredForLiveProbe: true
    }
  ];
  const keyPolicyCount = 5;
  const status = supportedProviders.length === 4 && operations.length === 3 ? "pass" : "review";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObjectStorageContract,
    generatedAt: now(),
    status,
    summary: {
      supportedProviderCount: supportedProviders.length,
      operationCount: operations.length,
      keyPolicyCount,
      privateAccessRequired: true,
      uploadCustodyRequired: true,
      liveProbeRequiredBeforeProduction: true,
      localFileStoreIsProductionBackend: false
    },
    supportedProviders,
    namespace: {
      prefixSourceEnv: "SENA_OBJECT_STORAGE_PREFIX",
      prefixNormalization: "slash-normalized-dot-segments-removed",
      uploadObjectKeyPattern: "teams/{teamId}/uploads/{uploadId}/{sha256}-{storedName}",
      probeObjectKeyPattern: "sena-probes/object-storage-probe-{suffix}.txt",
      pathTraversalSegmentsExcluded: true,
      backslashNormalized: true,
      objectKeyValuesExcluded: true
    },
    operations,
    custody: {
      postgresColumn: "sena_enterprise_uploads.object_storage_custody",
      localJsonFallbackIsProductionBackend: false,
      requiredFields: [
        "status",
        "providerMode",
        "objectKeyHash",
        "endpointHash",
        "bucketHash",
        "httpStatus",
        "deliveredAt",
        "lastAttemptedAt"
      ],
      hashedFields: [
        "objectKeyHash",
        "endpointHash",
        "bucketHash",
        "etagHash"
      ],
      valueFieldsExcluded: [
        "endpoint",
        "bucket",
        "objectKey",
        "accessKeyId",
        "secretAccessKey",
        "blobReadWriteToken",
        "blobStoreId",
        "payloadBytes"
      ],
      objectVersionCaptured: true,
      etagHashed: true,
      payloadSha256Required: true
    },
    currentNativeProvider: redactedContractProvider(),
    evidence: [
      "objectStorageContractSource=object-storage-adapter",
      `objectStorageContractStatus=${status}`,
      `objectStorageContractSupportedProviders=${supportedProviders.length}`,
      "objectStorageContractProviders=native-s3|native-r2|native-gcs-s3|native-vercel-blob",
      "objectStorageContractOperations=PUT|HEAD|DELETE",
      "objectStorageContractNamespace=prefix-normalized-dot-segments-removed",
      "objectStorageContractUploadKeyPattern=teams/{teamId}/uploads/{uploadId}/{sha256}-{storedName}",
      "objectStorageContractProbeKeyPattern=sena-probes/object-storage-probe-{suffix}.txt",
      "objectStorageContractPrivateAccessRequired=true",
      "objectStorageContractUploadCustody=postgres-column:sena_enterprise_uploads.object_storage_custody",
      "objectStorageContractLocalJsonProductionBackend=false",
      "endpointValues=excluded",
      "bucketValues=excluded",
      "objectKeyValues=excluded",
      "secretValues=excluded",
      "payloadValues=excluded"
    ],
    redaction: {
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      objectKeyValuesExcluded: true,
      secretValuesExcluded: true,
      payloadValuesExcluded: true
    }
  };
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hexHmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function signingKey(secret: string, date: string, region: string) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function objectPath(prefix: string, key: string) {
  return [prefix, key]
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function encodePath(pathValue: string) {
  return pathValue
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildObjectUrl(config: NativeObjectStorageConfig, key: string) {
  if (!config.endpoint || !config.bucket) {
    throw new SenaEnterpriseError("Native object storage is not configured.", 503, "object_storage_native_not_configured");
  }
  const url = new URL(config.endpoint);
  const basePath = url.pathname.replace(/\/+$/, "");
  const objectKey = objectPath(config.prefix, key);
  url.pathname = `${basePath}/${encodeURIComponent(config.bucket)}/${encodePath(objectKey)}`;
  return {
    url,
    objectKey
  };
}

function amzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

const emptyPayloadSha256 = createHash("sha256").update("").digest("hex");

async function signedObjectStorageRequest(input: {
  config: NativeObjectStorageConfig;
  method: "PUT" | "HEAD" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
  expectedSha256?: string;
  fetchImpl?: typeof fetch;
}): Promise<SignedObjectStorageRequestResult> {
  if (!input.config.configured || !input.config.accessKeyId || !input.config.secretAccessKey || !input.config.region) {
    throw new SenaEnterpriseError("Native object storage is not configured.", 503, "object_storage_native_not_configured");
  }
  const { url, objectKey } = buildObjectUrl(input.config, input.key);
  const payloadHash = input.body
    ? createHash("sha256").update(input.body).digest("hex")
    : emptyPayloadSha256;
  if (input.expectedSha256 && payloadHash !== input.expectedSha256) {
    throw new SenaEnterpriseError("Object storage upload payload hash did not match the registered upload.", 500, "object_storage_payload_hash_mismatch");
  }
  const { amzDate, dateStamp } = amzDates();
  const host = url.host;
  const canonicalHeaderEntries = [
    ...(input.contentType ? [["content-type", input.contentType] as const] : []),
    ["host", host] as const,
    ["x-amz-content-sha256", payloadHash] as const,
    ["x-amz-date", amzDate] as const
  ].sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = canonicalHeaderEntries.map(([name]) => name).join(";");
  const canonicalHeaders = canonicalHeaderEntries
    .map(([name, value]) => `${name}:${value}`)
    .join("\n") + "\n";
  const canonicalRequest = [
    input.method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signature = hexHmac(signingKey(input.config.secretAccessKey, dateStamp, input.config.region), stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers: Record<string, string> = {
    authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (input.contentType) {
    headers["content-type"] = input.contentType;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs);
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: input.method,
      headers,
      body: input.body ? new Uint8Array(input.body) : undefined,
      signal: controller.signal
    });
    const etag = response.headers.get("etag") ?? undefined;
    return {
      ok: response.ok,
      endpointHash: input.config.endpointHash,
      bucketHash: input.config.bucketHash,
      httpStatus: response.status,
      objectVersion: response.headers.get("x-amz-version-id") ?? response.headers.get("x-goog-generation") ?? undefined,
      etagHash: etag ? sha256Text(etag) : undefined,
      objectKey,
      objectKeyHash: sha256Text(objectKey),
      errorCode: response.ok ? undefined : `http_${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash: input.config.endpointHash,
      bucketHash: input.config.bucketHash,
      objectKey,
      objectKeyHash: sha256Text(objectKey),
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function vercelBlobOptions(config: NativeObjectStorageConfig, abortSignal: AbortSignal) {
  return {
    token: config.vercelBlobToken,
    storeId: config.vercelBlobStoreId,
    oidcToken: config.vercelBlobOidcToken,
    abortSignal
  };
}

async function vercelBlobObjectStorageRequest(input: {
  config: NativeObjectStorageConfig;
  method: "PUT" | "HEAD" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
  expectedSha256?: string;
}): Promise<SignedObjectStorageRequestResult> {
  if (!input.config.configured) {
    throw new SenaEnterpriseError("Vercel Blob object storage is not configured.", 503, "object_storage_native_not_configured");
  }
  const objectKey = objectPath(input.config.prefix, input.key);
  const payloadHash = input.body
    ? createHash("sha256").update(input.body).digest("hex")
    : emptyPayloadSha256;
  if (input.expectedSha256 && payloadHash !== input.expectedSha256) {
    throw new SenaEnterpriseError("Object storage upload payload hash did not match the registered upload.", 500, "object_storage_payload_hash_mismatch");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs);
  try {
    const blob = await import("@vercel/blob");
    if (input.method === "PUT") {
      const result = await blob.put(objectKey, input.body ?? Buffer.alloc(0), {
        ...vercelBlobOptions(input.config, controller.signal),
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: input.contentType
      });
      return {
        ok: true,
        endpointHash: input.config.endpointHash,
        bucketHash: input.config.bucketHash,
        httpStatus: 200,
        etagHash: sha256Text(result.etag),
        objectKey,
        objectKeyHash: sha256Text(objectKey)
      };
    }
    if (input.method === "HEAD") {
      const result = await blob.head(objectKey, vercelBlobOptions(input.config, controller.signal));
      return {
        ok: true,
        endpointHash: input.config.endpointHash,
        bucketHash: input.config.bucketHash,
        httpStatus: 200,
        etagHash: sha256Text(result.etag),
        objectKey,
        objectKeyHash: sha256Text(objectKey)
      };
    }
    await blob.del(objectKey, vercelBlobOptions(input.config, controller.signal));
    return {
      ok: true,
      endpointHash: input.config.endpointHash,
      bucketHash: input.config.bucketHash,
      httpStatus: 204,
      objectKey,
      objectKeyHash: sha256Text(objectKey)
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash: input.config.endpointHash,
      bucketHash: input.config.bucketHash,
      objectKey,
      objectKeyHash: sha256Text(objectKey),
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function nativeObjectStorageRequest(input: {
  config: NativeObjectStorageConfig;
  method: "PUT" | "HEAD" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
  expectedSha256?: string;
  fetchImpl?: typeof fetch;
}) {
  if (input.config.mode === "native-vercel-blob") {
    return vercelBlobObjectStorageRequest(input);
  }
  return signedObjectStorageRequest(input);
}

export async function putEnterpriseObjectStorageObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  sha256: string;
}): Promise<SenaEnterpriseObjectStoragePutResult> {
  const config = resolveNativeObjectStorageConfig();
  const result = await nativeObjectStorageRequest({
    config,
    method: "PUT",
    key: input.key,
    body: input.body,
    contentType: input.contentType,
    expectedSha256: input.sha256
  });
  const {
    objectKey: _objectKey,
    objectKeyHash: _objectKeyHash,
    ...putResult
  } = result;
  return putResult;
}

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function validSha256(value?: string) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

// Production posture is answered by senaProductionPosture() (auth-config.ts),
// never re-derived here: re-derivation is what let the password-reset interlock
// drift onto a NODE_ENV-only test and fail open (f5d94fa). The site-local
// opt-in flag is the only term this gate adds on top.
export function enterpriseObjectStorageLiveProbeRequired() {
  return booleanEnv("SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED") || senaProductionPosture();
}

function redactedProbeProvider(config: NativeObjectStorageConfig): SenaEnterpriseObjectStorageProbe["provider"] {
  const {
    endpoint: _endpoint,
    bucket: _bucket,
    accessKeyId: _accessKeyId,
    secretAccessKey: _secretAccessKey,
    vercelBlobToken: _vercelBlobToken,
    vercelBlobStoreId: _vercelBlobStoreId,
    vercelBlobOidcToken: _vercelBlobOidcToken,
    ...provider
  } = config;
  return {
    ...provider,
    endpointValueExcluded: true,
    bucketValueExcluded: true
  };
}

function probeStep(result?: SignedObjectStorageRequestResult): SenaEnterpriseObjectStorageProbeStep {
  if (!result) {
    return {
      attempted: false,
      status: "review"
    };
  }
  return {
    attempted: true,
    status: result.ok ? "pass" : "review",
    httpStatus: result.httpStatus,
    objectVersion: result.objectVersion,
    etagHash: result.etagHash,
    errorCode: result.errorCode,
    errorHash: result.errorHash
  };
}

function reviewObjectStorageProbe(input: {
  config?: NativeObjectStorageConfig;
  evidence: string[];
  errorHash?: string;
}): SenaEnterpriseObjectStorageProbe {
  const config = input.config ?? {
    mode: "not-configured",
    configured: false,
    productionReady: false,
    prefix: "",
    accessKeyConfigured: false,
    secretConfigured: false,
    timeoutMs: 30_000,
    evidence: [
      "nativeAdapter=not-configured",
      "nativeConfigured=false",
      "nativeMissing=SENA_OBJECT_STORAGE_ADAPTER=s3|r2|gcs-s3"
    ]
  };
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe,
    generatedAt: now(),
    status: "review",
    provider: redactedProbeProvider(config),
    probe: {
      put: probeStep(),
      head: probeStep(),
      delete: probeStep(),
      cleanupStatus: "not-attempted"
    },
    evidence: [
      ...config.evidence,
      ...input.evidence,
      input.errorHash ? `errorHash=${input.errorHash}` : "errorHash=none",
      "objectStorageProbeApi=/api/sena/ops/object-storage",
      "objectStorageProbeScript=npm run sena:object-storage:verify"
    ],
    redaction: {
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      objectKeyValuesExcluded: true,
      secretValuesExcluded: true
    },
    contract: buildEnterpriseObjectStorageContract()
  };
}

export function enterpriseObjectStorageContractReadiness(): SenaEnterpriseObjectStorageContractReadiness {
  const artifactHash = envValue("SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION") === "pass";
  const required = enterpriseObjectStorageLiveProbeRequired() ||
    booleanEnv("SENA_OBJECT_STORAGE_CONTRACT_REQUIRED");
  const confirmed = booleanEnv("SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED") &&
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
      `objectStorageContractRequired=${required}`,
      `objectStorageContractConfirmed=${confirmed}`,
      `objectStorageContractExplicitlyRequired=${booleanEnv("SENA_OBJECT_STORAGE_CONTRACT_REQUIRED")}`,
      `objectStorageContractProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `objectStorageContractProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `objectStorageContractProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `objectStorageContractSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `objectStorageContractArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `objectStorageContractVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `objectStorageContractArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      `objectStorageContractSchema=${SENA_SCHEMA_VERSIONS.enterpriseObjectStorageContract}`,
      "objectStorageContractScript=npm run sena:object-storage:contract",
      "objectStorageContractSource=object-storage-adapter"
    ]
  };
}

export function enterpriseObjectStorageProbeReadiness(): SenaEnterpriseObjectStorageProbeReadiness {
  const artifactHash = envValue("SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION") === "pass";
  const required = enterpriseObjectStorageLiveProbeRequired();
  const confirmed = booleanEnv("SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED") &&
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
      `objectStorageLiveProbeRequired=${required}`,
      `objectStorageLiveProbeConfirmed=${confirmed}`,
      `objectStorageProbeExplicitlyRequired=${booleanEnv("SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED")}`,
      `objectStorageProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `objectStorageProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `objectStorageProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `objectStorageSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `objectStorageProbeArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `objectStorageProbeVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `objectStorageProbeArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      "objectStorageProbeApi=/api/sena/ops/object-storage",
      "objectStorageProbeScript=npm run sena:object-storage:verify",
      "objectStorageProbeSteps=PUT|HEAD|DELETE"
    ]
  };
}

export async function verifyEnterpriseObjectStorageProbe(input: {
  fetchImpl?: typeof fetch;
  keySuffix?: string;
  body?: Buffer;
} = {}): Promise<SenaEnterpriseObjectStorageProbe> {
  let config: NativeObjectStorageConfig;
  try {
    config = resolveNativeObjectStorageConfig();
  } catch (error) {
    return reviewObjectStorageProbe({
      evidence: ["nativeConfig=invalid", "probe=not-attempted"],
      errorHash: webhookErrorHash(error)
    });
  }

  if (!config.configured) {
    return reviewObjectStorageProbe({
      config,
      evidence: ["nativeConfig=missing", "probe=not-attempted"]
    });
  }

  const body = input.body ?? Buffer.from(`sena object storage probe ${now()}\n`, "utf8");
  const contentSha256 = createHash("sha256").update(body).digest("hex");
  const keySuffix = input.keySuffix ?? randomBytes(8).toString("hex");
  const probeKey = `sena-probes/object-storage-probe-${keySuffix}.txt`;
  const put = await nativeObjectStorageRequest({
    config,
    method: "PUT",
    key: probeKey,
    body,
    contentType: "text/plain; charset=utf-8",
    expectedSha256: contentSha256,
    fetchImpl: input.fetchImpl
  });
  let head: SignedObjectStorageRequestResult | undefined;
  let cleanup: SignedObjectStorageRequestResult | undefined;
  if (put.ok) {
    head = await nativeObjectStorageRequest({
      config,
      method: "HEAD",
      key: probeKey,
      fetchImpl: input.fetchImpl
    });
    cleanup = await nativeObjectStorageRequest({
      config,
      method: "DELETE",
      key: probeKey,
      fetchImpl: input.fetchImpl
    });
  }
  const cleanupStatus = cleanup
    ? cleanup.ok ? "deleted" : "review"
    : "not-attempted";
  const status: SenaEnterpriseObjectStorageProbeStatus = put.ok && Boolean(head?.ok) && cleanupStatus === "deleted"
    ? "pass"
    : "review";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe,
    generatedAt: now(),
    status,
    provider: redactedProbeProvider(config),
    probe: {
      objectKeyHash: put.objectKeyHash,
      contentSha256,
      put: probeStep(put),
      head: probeStep(head),
      delete: probeStep(cleanup),
      cleanupStatus
    },
    evidence: [
      ...config.evidence,
      `probeStatus=${status}`,
      `probePut=${put.ok ? "pass" : "review"}`,
      `probeHead=${head?.ok ? "pass" : head ? "review" : "not-attempted"}`,
      `probeDelete=${cleanup?.ok ? "pass" : cleanup ? "review" : "not-attempted"}`,
      "probeObjectKeyValue=excluded",
      "probeEndpointValue=excluded",
      "probeBucketValue=excluded",
      "objectStorageProbeApi=/api/sena/ops/object-storage",
      "objectStorageProbeScript=npm run sena:object-storage:verify"
    ],
    redaction: {
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      objectKeyValuesExcluded: true,
      secretValuesExcluded: true
    },
    contract: buildEnterpriseObjectStorageContract()
  };
}
