import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_OBJECT_STORAGE_ADAPTER",
  "SENA_OBJECT_STORAGE_ENDPOINT",
  "SENA_OBJECT_STORAGE_BUCKET",
  "SENA_OBJECT_STORAGE_REGION",
  "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
  "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
  "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
  "SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
  "R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "R2_ENDPOINT",
  "CLOUDFLARE_R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_BUCKET",
  "CLOUDFLARE_R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "SENA_OBJECT_STORAGE_PREFIX",
  "SENA_OBJECT_STORAGE_TIMEOUT_MS",
  "SENA_OBJECT_STORAGE_CONTRACT_REQUIRED",
  "SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED",
  "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256",
  "SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT",
  "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED",
  "SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED",
  "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256",
  "SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT",
  "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
  "SENA_OPS_TOKEN",
  "SENA_ENTERPRISE_STATE_STORE",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_POSTGRES_URL"
];

function configureNativeObjectStorageEnv() {
  process.env.SENA_OBJECT_STORAGE_ADAPTER = "s3";
  process.env.SENA_OBJECT_STORAGE_ENDPOINT = "https://objects.example.test";
  process.env.SENA_OBJECT_STORAGE_BUCKET = "sena-private-bucket";
  process.env.SENA_OBJECT_STORAGE_REGION = "us-east-1";
  process.env.SENA_OBJECT_STORAGE_ACCESS_KEY_ID = "sena-access-key";
  process.env.SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY = "sena-object-storage-secret";
  process.env.SENA_OBJECT_STORAGE_PREFIX = "sena/uploads";
}

describe("SENA native object storage adapter", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.unstubAllGlobals();
    vi.doUnmock("pg");
    vi.doUnmock("@vercel/blob");
    vi.resetModules();
  });

  it("normalizes Cloudflare R2 env aliases into a native S3-compatible provider without leaking values", async () => {
    process.env.R2_ACCOUNT_ID = "senaaccount123";
    process.env.R2_BUCKET_NAME = "sena-r2-private-bucket";
    process.env.R2_ACCESS_KEY_ID = "r2-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "r2-secret-key";
    const { enterpriseObjectStorageNativeProvider } = await import("../enterprise/object-storage-adapter");

    const provider = enterpriseObjectStorageNativeProvider();

    expect(provider).toEqual(expect.objectContaining({
      mode: "native-r2",
      configured: true,
      productionReady: true,
      endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      bucketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      region: "auto",
      accessKeyConfigured: true,
      secretConfigured: true
    }));
    expect(provider.evidence).toEqual(expect.arrayContaining([
      "nativeAdapter=native-r2",
      "nativeConfigured=true",
      "nativeAccessKeySource=R2_ACCESS_KEY_ID",
      "nativeSecretSource=R2_SECRET_ACCESS_KEY"
    ]));
    expect(JSON.stringify(provider)).not.toContain("senaaccount123");
    expect(JSON.stringify(provider)).not.toContain("sena-r2-private-bucket");
    expect(JSON.stringify(provider)).not.toContain("r2-access-key");
    expect(JSON.stringify(provider)).not.toContain("r2-secret-key");
  });

  it("normalizes Vercel Blob env aliases into a native provider without leaking token or store values", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel-blob-secret-token";
    process.env.BLOB_STORE_ID = "store_secret_sena";
    const { enterpriseObjectStorageNativeProvider } = await import("../enterprise/object-storage-adapter");

    const provider = enterpriseObjectStorageNativeProvider();

    expect(provider).toEqual(expect.objectContaining({
      mode: "native-vercel-blob",
      configured: true,
      productionReady: true,
      endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      bucketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      region: "vercel",
      accessKeyConfigured: true,
      secretConfigured: true
    }));
    expect(provider.evidence).toEqual(expect.arrayContaining([
      "nativeAdapter=native-vercel-blob",
      "nativeConfigured=true",
      "nativeAccessKeySource=BLOB_STORE_ID",
      "nativeSecretSource=BLOB_READ_WRITE_TOKEN",
      "vercelBlobAuth=read-write-token"
    ]));
    expect(JSON.stringify(provider)).not.toContain("vercel-blob-secret-token");
    expect(JSON.stringify(provider)).not.toContain("store_secret_sena");
  });

  it("generates a redacted object-storage namespace and custody contract without provider secrets", async () => {
    configureNativeObjectStorageEnv();
    const { buildEnterpriseObjectStorageContract } = await import("../enterprise/object-storage-adapter");

    const contract = buildEnterpriseObjectStorageContract();
    const serialized = JSON.stringify(contract);

    expect(contract.schemaVersion).toBe("sena-enterprise-object-storage-contract/v1");
    expect(contract.status).toBe("pass");
    expect(contract.summary).toEqual(expect.objectContaining({
      supportedProviderCount: 4,
      operationCount: 3,
      keyPolicyCount: 5,
      privateAccessRequired: true,
      uploadCustodyRequired: true,
      liveProbeRequiredBeforeProduction: true,
      localFileStoreIsProductionBackend: false
    }));
    expect(contract.supportedProviders.map((provider) => provider.mode)).toEqual([
      "native-s3",
      "native-r2",
      "native-gcs-s3",
      "native-vercel-blob"
    ]);
    expect(contract.namespace).toEqual(expect.objectContaining({
      prefixNormalization: "slash-normalized-dot-segments-removed",
      uploadObjectKeyPattern: "teams/{teamId}/uploads/{uploadId}/{sha256}-{storedName}",
      probeObjectKeyPattern: "sena-probes/object-storage-probe-{suffix}.txt",
      pathTraversalSegmentsExcluded: true,
      objectKeyValuesExcluded: true
    }));
    expect(contract.operations.map((operation) => operation.method)).toEqual(["PUT", "HEAD", "DELETE"]);
    expect(contract.custody).toEqual(expect.objectContaining({
      postgresColumn: "sena_enterprise_uploads.object_storage_custody",
      localJsonFallbackIsProductionBackend: false,
      objectVersionCaptured: true,
      etagHashed: true,
      payloadSha256Required: true
    }));
    expect(contract.custody.requiredFields).toEqual(expect.arrayContaining([
      "status",
      "providerMode",
      "objectKeyHash",
      "endpointHash",
      "bucketHash"
    ]));
    expect(contract.evidence).toEqual(expect.arrayContaining([
      "objectStorageContractSource=object-storage-adapter",
      "objectStorageContractStatus=pass",
      "objectStorageContractProviders=native-s3|native-r2|native-gcs-s3|native-vercel-blob",
      "objectStorageContractOperations=PUT|HEAD|DELETE",
      "objectStorageContractLocalJsonProductionBackend=false"
    ]));
    expect(serialized).not.toContain("sena-object-storage-secret");
    expect(serialized).not.toContain("sena-access-key");
    expect(serialized).not.toContain("sena-private-bucket");
    expect(serialized).not.toContain("objects.example.test");
  });

  it("delivers upload blobs through a native S3-compatible PUT without exposing storage secrets", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-native-object-storage-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    configureNativeObjectStorageEnv();
    const putRequests: Array<{ url: string; method?: string; headers: Record<string, string>; body: Uint8Array }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      putRequests.push({
        url: String(input),
        method: init?.method,
        headers,
        body: init?.body as Uint8Array
      });
      return new Response("", {
        status: 200,
        headers: {
          etag: "\"native-etag\"",
          "x-amz-version-id": "version-1"
        }
      });
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Native Object Storage Owner",
      email: "native-object-storage@example.edu",
      password: "sena-secure-123",
      organization: "Object Storage Lab",
      plan: "lab"
    });
    const csv = Buffer.from("person_id,name\np1,Ada\n", "utf8");
    const uploads = enterprise.createEnterpriseUploads(registered.context, {
      teamId: registered.context.teams[0].id,
      files: [{
        name: "people.csv",
        contentType: "text/csv",
        bytes: csv
      }]
    });

    const delivery = await enterprise.deliverEnterpriseUploadBlobs(registered.context, {
      teamId: registered.context.teams[0].id,
      uploadId: uploads[0].id
    });

    expect(delivery.status).toBe("completed");
    expect(delivery.provider).toEqual(expect.objectContaining({
      mode: "native-s3",
      configured: true,
      nativeConfigured: true,
      endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      bucketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      region: "us-east-1",
      prefix: "sena/uploads",
      accessKeyConfigured: true,
      secretConfigured: true
    }));
    expect(delivery.summary).toEqual(expect.objectContaining({
      attempted: 1,
      delivered: 1,
      failed: 0
    }));
    expect(delivery.uploads[0]).toEqual(expect.objectContaining({
      uploadId: uploads[0].id,
      deliveryStatus: "delivered",
      objectVersion: "version-1",
      etagHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    const listedUploads = enterprise.listEnterpriseUploads(registered.context, registered.context.teams[0].id);
    expect(listedUploads[0].objectStorageCustody).toEqual(expect.objectContaining({
      status: "delivered",
      providerMode: "native-s3",
      objectKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      bucketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      objectVersion: "version-1",
      etagHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      httpStatus: 200,
      deliveredAt: expect.any(String),
      lastAttemptedAt: expect.any(String)
    }));
    expect(putRequests).toHaveLength(1);
    expect(putRequests[0].method).toBe("PUT");
    expect(putRequests[0].url).toContain("/sena-private-bucket/sena/uploads/teams/");
    expect(putRequests[0].url).toContain(`/uploads/${uploads[0].id}/`);
    expect(putRequests[0].headers.authorization).toContain("AWS4-HMAC-SHA256");
    expect(putRequests[0].headers["x-amz-content-sha256"]).toBe(uploads[0].sha256);
    expect(Buffer.from(putRequests[0].body).equals(csv)).toBe(true);
    expect(putRequests[0].headers["x-sena-webhook-event"]).toBeUndefined();
    expect(JSON.stringify(delivery)).not.toContain("sena-object-storage-secret");
    expect(JSON.stringify(delivery)).not.toContain("sena-access-key");
    expect(JSON.stringify(delivery)).not.toContain("sena-private-bucket");
    expect(JSON.stringify(delivery)).not.toContain("objects.example.test");
    expect(JSON.stringify(listedUploads)).not.toContain("sena-object-storage-secret");
    expect(JSON.stringify(listedUploads)).not.toContain("sena-access-key");
    expect(JSON.stringify(listedUploads)).not.toContain("sena-private-bucket");
    expect(JSON.stringify(listedUploads)).not.toContain("objects.example.test");
  });

  it("delivers upload blobs through Vercel Blob without exposing token, store id, or object key values", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-vercel-blob-object-storage-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OBJECT_STORAGE_ADAPTER = "vercel-blob";
    process.env.SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN = "vercel-blob-secret-token";
    process.env.SENA_OBJECT_STORAGE_BLOB_STORE_ID = "store_secret_sena";
    process.env.SENA_OBJECT_STORAGE_PREFIX = "sena/uploads";
    const blobCalls: Array<{ pathname: string; body: Buffer; options: Record<string, unknown> }> = [];
    vi.doMock("@vercel/blob", () => ({
      put: vi.fn(async (pathname: string, body: Buffer, options: Record<string, unknown>) => {
        blobCalls.push({ pathname, body, options });
        return {
          url: "https://secret-store.public.blob.vercel-storage.com/secret-path",
          downloadUrl: "https://secret-store.public.blob.vercel-storage.com/secret-path?download=1",
          pathname,
          contentType: options.contentType,
          contentDisposition: "inline",
          etag: "vercel-blob-etag"
        };
      }),
      head: vi.fn(),
      del: vi.fn()
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Vercel Blob Owner",
      email: "vercel-blob@example.edu",
      password: "sena-secure-123",
      organization: "Blob Lab",
      plan: "lab"
    });
    const csv = Buffer.from("person_id,name\np1,Ada\n", "utf8");
    const uploads = enterprise.createEnterpriseUploads(registered.context, {
      teamId: registered.context.teams[0].id,
      files: [{
        name: "people.csv",
        contentType: "text/csv",
        bytes: csv
      }]
    });

    const delivery = await enterprise.deliverEnterpriseUploadBlobs(registered.context, {
      teamId: registered.context.teams[0].id,
      uploadId: uploads[0].id
    });
    const listedUploads = enterprise.listEnterpriseUploads(registered.context, registered.context.teams[0].id);
    const serialized = JSON.stringify({ delivery, listedUploads });

    expect(delivery.status).toBe("completed");
    expect(delivery.provider).toEqual(expect.objectContaining({
      mode: "native-vercel-blob",
      configured: true,
      nativeConfigured: true,
      region: "vercel",
      accessKeyConfigured: true,
      secretConfigured: true
    }));
    expect(delivery.uploads[0]).toEqual(expect.objectContaining({
      uploadId: uploads[0].id,
      deliveryStatus: "delivered",
      etagHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(listedUploads[0].objectStorageCustody).toEqual(expect.objectContaining({
      status: "delivered",
      providerMode: "native-vercel-blob",
      objectKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      bucketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      httpStatus: 200,
      deliveredAt: expect.any(String)
    }));
    expect(blobCalls).toHaveLength(1);
    expect(blobCalls[0].pathname).toContain(`uploads/${uploads[0].id}/`);
    expect(blobCalls[0].options).toEqual(expect.objectContaining({
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/csv",
      token: "vercel-blob-secret-token",
      storeId: "store_secret_sena"
    }));
    expect(Buffer.from(blobCalls[0].body).equals(csv)).toBe(true);
    expect(serialized).not.toContain("vercel-blob-secret-token");
    expect(serialized).not.toContain("store_secret_sena");
    expect(serialized).not.toContain("secret-store");
    expect(serialized).not.toContain(blobCalls[0].pathname);
  });

  it("keeps production object-storage readiness in review with pending upload custody evidence", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-native-object-storage-readiness-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    configureNativeObjectStorageEnv();

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Native Object Storage Readiness Owner",
      email: "native-object-storage-readiness@example.edu",
      password: "sena-secure-123",
      organization: "Object Storage Readiness Lab",
      plan: "lab"
    });
    enterprise.createEnterpriseUploads(registered.context, {
      teamId: registered.context.teams[0].id,
      files: [{
        name: "people.csv",
        contentType: "text/csv",
        bytes: Buffer.from("person_id,name\np1,Ada\n", "utf8")
      }]
    });

    const { getEnterpriseDeploymentReadiness } = await import("../enterprise/ops-deployment-readiness");
    const readiness = getEnterpriseDeploymentReadiness();
    const objectStorageItem = readiness.productionPerformancePath.items.find((item) => item.id === "production-object-storage");

    expect(objectStorageItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(objectStorageItem?.evidence).toEqual(expect.arrayContaining([
      "objectStorageContractRequired=true",
      "objectStorageContractConfirmed=false",
      "objectStorageContractArtifactSha256=missing-or-invalid",
      "uploadCustodyTotal=1",
      "uploadCustodyDelivered=0",
      "uploadCustodyPending=1",
      "uploadCustodyEligibleUndelivered=1"
    ]));
    expect(objectStorageItem?.nextAction).toContain("sena:object-storage:contract");
  });

  it("keeps production object-storage under review when the live probe is confirmed but the contract artifact is missing", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256 = "a".repeat(64);
    process.env.SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT = new Date().toISOString();
    process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION = "pass";
    configureNativeObjectStorageEnv();

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
    const objectStorageItem = performancePath.items.find((item) => item.id === "production-object-storage");

    expect(objectStorageItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(performancePath.summary.blockers).toContain("production-object-storage");
    expect(objectStorageItem?.evidence).toEqual(expect.arrayContaining([
      "objectStorageContractRequired=true",
      "objectStorageContractConfirmed=false",
      "objectStorageContractArtifactSha256=missing-or-invalid",
      "objectStorageLiveProbeRequired=true",
      "objectStorageLiveProbeConfirmed=true",
      "objectStorageProbeArtifactSha256=present",
      "objectStorageProbeVerifiedAt=valid",
      "uploadCustodySource=postgres-table",
      "uploadCustodyEligibleUndelivered=0"
    ]));
    expect(objectStorageItem?.nextAction).toContain("sena:object-storage:contract");
    const serialized = JSON.stringify(objectStorageItem);
    expect(serialized).not.toContain("sena-object-storage-secret");
    expect(serialized).not.toContain("sena-private-bucket");
    expect(serialized).not.toContain("objects.example.test");
  });

  it("uses indexed Postgres upload custody when building object-storage production readiness evidence", async () => {
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    configureNativeObjectStorageEnv();

    const postgresQueries: string[] = [];
    vi.doMock("pg", () => ({
      Pool: class {
        async query(sql: string) {
          postgresQueries.push(sql);
          if (/SELECT \*/i.test(sql) && /sena_enterprise_uploads/.test(sql)) {
            return {
              rows: [{
                id: "upload_pg_delivered",
                team_id: "team_pg",
                user_id: "user_pg",
                original_name: "people.csv",
                stored_name: "upload_pg_delivered-people.csv",
                content_type: "text/csv",
                size_bytes: 21,
                sha256: "a".repeat(64),
                import_profile: null,
                warning_count: 0,
                scan_status: "passed",
                scan_engine: "sena-local-upload-scan/v1",
                scan_findings: [],
                storage_path: "uploads/team_pg/upload_pg_delivered-people.csv",
                object_storage_custody: {
                  status: "delivered",
                  providerMode: "native-s3",
                  objectKeyHash: "b".repeat(64),
                  endpointHash: "c".repeat(64),
                  bucketHash: "d".repeat(64),
                  httpStatus: 200,
                  deliveredAt: "2026-06-30T10:00:00.000Z",
                  lastAttemptedAt: "2026-06-30T10:00:00.000Z"
                },
                created_at: "2026-06-30T09:59:00.000Z"
              }],
              rowCount: 1
            };
          }
          return { rows: [], rowCount: 0 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const { summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence } = await import("../enterprise/import-analysis");
    const summary = await summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence();
    expect(summary).toEqual(expect.objectContaining({
      source: "postgres-table",
      totalUploads: 1,
      delivered: 1,
      eligibleUndelivered: 0,
      ready: true
    }));
    expect(summary.evidence).toEqual(expect.arrayContaining([
      "uploadCustodySource=postgres-table",
      "uploadCustodyRead=pass",
      "uploadCustodyStore=postgres-table",
      "uploadCustodyTable=sena_enterprise_uploads"
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
          uploads: 1
        },
        deployment: {
          objectStorageNativeConfigured: true,
          objectStorageWebhookConfigured: false,
          opsTokenConfigured: true
        }
      } as never,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody: summary
    });
    const objectStorageItem = performancePath.items.find((item) => item.id === "production-object-storage");

    expect(objectStorageItem).toEqual(expect.objectContaining({
      status: "pass"
    }));
    expect(objectStorageItem?.evidence).toEqual(expect.arrayContaining([
      "uploadCustodySource=postgres-table",
      "uploadCustodyRead=pass",
      "uploadCustodyStore=postgres-table",
      "uploadCustodyDelivered=1",
      "uploadCustodyEligibleUndelivered=0"
    ]));
    expect(postgresQueries.some((query) => /FROM "public"\."sena_enterprise_uploads"/.test(query))).toBe(true);
    const serialized = JSON.stringify({ summary, objectStorageItem });
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("example.neon.tech");
    expect(serialized).not.toContain("sena-private-bucket");
    expect(serialized).not.toContain("objects.example.test");
    expect(serialized).not.toContain("sena-object-storage-secret");
  });

  it("requires a live object-storage probe artifact under production performance gates", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    configureNativeObjectStorageEnv();

    const { enterpriseObjectStorageProbeReadiness } = await import("../enterprise/object-storage-adapter");
    const readiness = enterpriseObjectStorageProbeReadiness();

    expect(readiness).toEqual(expect.objectContaining({
      required: true,
      confirmed: false
    }));
    expect(readiness.evidence).toEqual(expect.arrayContaining([
      "objectStorageProductionPerformancePathRequired=true",
      "objectStorageProbeArtifactSha256=missing-or-invalid",
      "objectStorageProbeVerifiedAt=missing-or-invalid"
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
    const objectStorageItem = performancePath.items.find((item) => item.id === "production-object-storage");

    expect(objectStorageItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(objectStorageItem?.evidence).toEqual(expect.arrayContaining([
      "objectStorageNative=configured",
      "objectStorageLiveProbeRequired=true",
      "objectStorageLiveProbeConfirmed=false",
      "objectStorageProductionPerformancePathRequired=true",
      "objectStorageProbeArtifactSha256=missing-or-invalid",
      "objectStorageProbeVerifiedAt=missing-or-invalid",
      "uploadCustodySource=postgres-table",
      "uploadCustodyTotal=0",
      "uploadCustodyEligibleUndelivered=0"
    ]));
    expect(JSON.stringify(objectStorageItem)).not.toContain("sena-object-storage-secret");
    expect(JSON.stringify(objectStorageItem)).not.toContain("sena-private-bucket");
    expect(JSON.stringify(objectStorageItem)).not.toContain("objects.example.test");
  });

  it("runs a redacted native object-storage PUT/HEAD/DELETE probe", async () => {
    configureNativeObjectStorageEnv();
    const requests: Array<{ url: string; method?: string; headers: Record<string, string>; body?: Uint8Array }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string>,
        body: init?.body as Uint8Array | undefined
      });
      if (init?.method === "PUT") {
        return new Response("", {
          status: 200,
          headers: {
            etag: "\"probe-etag\"",
            "x-amz-version-id": "probe-version"
          }
        });
      }
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: {
            etag: "\"probe-etag\""
          }
        });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected method ${init?.method}`);
    });

    const { verifyEnterpriseObjectStorageProbe } = await import("../enterprise/object-storage-adapter");
    const probe = await verifyEnterpriseObjectStorageProbe({
      fetchImpl,
      keySuffix: "probe-redaction",
      body: Buffer.from("sena probe\n", "utf8")
    });

    expect(probe.schemaVersion).toBe("sena-enterprise-object-storage-probe/v1");
    expect(probe.status).toBe("pass");
    expect(probe.contract).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-object-storage-contract/v1",
      status: "pass"
    }));
    expect(probe.contract.operations.map((operation) => operation.method)).toEqual(["PUT", "HEAD", "DELETE"]);
    expect(probe.provider).toEqual(expect.objectContaining({
      mode: "native-s3",
      configured: true,
      endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      bucketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      endpointValueExcluded: true,
      bucketValueExcluded: true
    }));
    expect(probe.probe.objectKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(probe.probe).toEqual(expect.objectContaining({
      cleanupStatus: "deleted",
      put: expect.objectContaining({
        attempted: true,
        status: "pass",
        httpStatus: 200,
        objectVersion: "probe-version",
        etagHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }),
      head: expect.objectContaining({
        attempted: true,
        status: "pass",
        httpStatus: 200
      }),
      delete: expect.objectContaining({
        attempted: true,
        status: "pass",
        httpStatus: 204
      })
    }));
    expect(requests.map((request) => request.method)).toEqual(["PUT", "HEAD", "DELETE"]);
    expect(requests.every((request) => request.url.includes("/sena-private-bucket/sena/uploads/sena-probes/object-storage-probe-probe-redaction.txt"))).toBe(true);
    expect(requests[0].headers.authorization).toContain("AWS4-HMAC-SHA256");
    expect(requests[0].headers["x-amz-content-sha256"]).toMatch(/^[a-f0-9]{64}$/);
    expect(Buffer.from(requests[0].body ?? new Uint8Array()).toString("utf8")).toBe("sena probe\n");
    const serialized = JSON.stringify(probe);
    expect(serialized).not.toContain("sena-object-storage-secret");
    expect(serialized).not.toContain("sena-access-key");
    expect(serialized).not.toContain("sena-private-bucket");
    expect(serialized).not.toContain("objects.example.test");
    expect(serialized).not.toContain("probe-redaction");
  });

  it("requires a valid object-storage probe artifact, timestamp, and validation before confirmation", async () => {
    process.env.SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED = "1";
    process.env.SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256 = "b".repeat(64);
    const { enterpriseObjectStorageProbeReadiness } = await import("../enterprise/object-storage-adapter");

    expect(enterpriseObjectStorageProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: true,
      verifiedAtConfigured: false
    }));

    const verifiedAt = new Date().toISOString();
    process.env.SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT = verifiedAt;
    process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION = "pass";
    expect(enterpriseObjectStorageProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "b".repeat(64),
      verifiedAt,
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
  });

  it("requires a valid object-storage contract artifact, timestamp, and validation before confirmation", async () => {
    process.env.SENA_OBJECT_STORAGE_CONTRACT_REQUIRED = "1";
    process.env.SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED = "1";
    process.env.SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256 = "c".repeat(64);
    const { enterpriseObjectStorageContractReadiness } = await import("../enterprise/object-storage-adapter");

    expect(enterpriseObjectStorageContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: true,
      verifiedAtConfigured: false
    }));

    const verifiedAt = new Date().toISOString();
    process.env.SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT = verifiedAt;
    process.env.SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION = "pass";
    expect(enterpriseObjectStorageContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "c".repeat(64),
      verifiedAt,
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
  });

  it("exposes the object-storage probe through the ops route with redacted headers", async () => {
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    configureNativeObjectStorageEnv();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response("", {
          status: 200,
          headers: {
            etag: "\"probe-etag\"",
            "x-amz-version-id": "probe-version"
          }
        });
      }
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200 });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected method ${init?.method}`);
    }));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    const route = await import("../../../app/api/sena/ops/object-storage/route");
    const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/object-storage", {
      headers: {
        authorization: "Bearer sena-test-ops-token"
      }
    }));
    const body = await response.json() as { schemaVersion?: string; status?: string };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("sena-enterprise-object-storage-probe/v1");
    expect(body.status).toBe("pass");
    expect(response.headers.get("x-sena-object-storage-probe")).toBe("pass");
    expect(response.headers.get("x-sena-object-storage-put")).toBe("pass");
    expect(response.headers.get("x-sena-object-storage-head")).toBe("pass");
    expect(response.headers.get("x-sena-object-storage-delete")).toBe("pass");
    expect(response.headers.get("x-sena-object-storage-cleanup")).toBe("deleted");
    expect(response.headers.get("x-sena-object-storage-url-values")).toBe("excluded");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-object-storage");
    expect(JSON.stringify(body)).not.toContain("sena-private-bucket");
    expect(JSON.stringify(body)).not.toContain("objects.example.test");
    expect(JSON.stringify(body)).not.toContain("sena-object-storage-secret");
  });
});
