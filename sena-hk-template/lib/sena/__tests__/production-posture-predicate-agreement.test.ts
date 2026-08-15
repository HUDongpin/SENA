import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENA_PRODUCTION_POSTURE_ENV_KEYS,
  senaProductionPosture
} from "../enterprise/auth-config";
import {
  enterpriseObservabilityLiveProbeRequired,
  enterpriseObservabilityProductionSampleStoreRequired
} from "../enterprise/ops-observability";
import { enterpriseObjectStorageLiveProbeRequired } from "../enterprise/object-storage-adapter";
import { enterpriseFileStateWritePolicy } from "../enterprise/state";

// f5d94fa fixed an account-takeover hole whose entire cause was two copies of
// "is this deployment production?" disagreeing: the password-reset interlock
// tested NODE_ENV alone while the rest of the codebase ORs the three SENA
// production-posture flags onto it. A SENA-classified production host with
// NODE_ENV unset therefore handed live reset tokens to anonymous callers.
//
// This suite is the standing guard on the remaining copies. It pins the
// AGREEMENT between senaProductionPosture() and each production hard-gate that
// shares the predicate — not each gate's individual behaviour — so any future
// divergence (a dropped flag, a changed truthiness rule, an extra NODE_ENV-only
// condition) fails here loudly instead of silently failing open in one gate.

// Each site is a production hard-gate that answers the shared posture predicate.
// A site may OR its own extra opt-in flag on top (pinned separately below), so
// the agreement matrix runs with every site-local flag cleared.
const postureSites = [
  {
    id: "ops-observability.ts enterpriseObservabilityProductionSampleStoreRequired",
    siteLocalEnvKeys: ["SENA_OBSERVABILITY_REQUIRED"],
    read: () => enterpriseObservabilityProductionSampleStoreRequired()
  },
  {
    id: "ops-observability.ts enterpriseObservabilityLiveProbeRequired",
    siteLocalEnvKeys: ["SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED"],
    read: () => enterpriseObservabilityLiveProbeRequired()
  },
  {
    id: "object-storage-adapter.ts enterpriseObjectStorageLiveProbeRequired",
    siteLocalEnvKeys: ["SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED"],
    read: () => enterpriseObjectStorageLiveProbeRequired()
  }
] as const;

const watchedEnvKeys = [
  "NODE_ENV",
  ...SENA_PRODUCTION_POSTURE_ENV_KEYS,
  ...postureSites.flatMap((site) => site.siteLocalEnvKeys)
];

const [performancePathKey, evidenceManifestKey, saasOperatingModelKey] = SENA_PRODUCTION_POSTURE_ENV_KEYS;

function setEnv(env: Record<string, string | undefined>) {
  for (const key of watchedEnvKeys) delete (process.env as Record<string, string | undefined>)[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) (process.env as Record<string, string | undefined>)[key] = value;
  }
}

type PostureCase = {
  label: string;
  env: Record<string, string | undefined>;
  posture: boolean;
};

const postureMatrix: PostureCase[] = [
  { label: "nothing set", env: {}, posture: false },
  { label: "NODE_ENV=production alone", env: { NODE_ENV: "production" }, posture: true },
  { label: "NODE_ENV=development alone", env: { NODE_ENV: "development" }, posture: false },
  { label: "NODE_ENV=test alone", env: { NODE_ENV: "test" }, posture: false },
  // The account-takeover shape: a SENA-classified production host that never
  // sets NODE_ENV. Each flag alone must read as production everywhere.
  ...SENA_PRODUCTION_POSTURE_ENV_KEYS.map((key) => ({
    label: `${key}=1 with NODE_ENV unset`,
    env: { [key]: "1" },
    posture: true
  })),
  ...SENA_PRODUCTION_POSTURE_ENV_KEYS.map((key) => ({
    label: `${key}=1 with NODE_ENV=development`,
    env: { NODE_ENV: "development", [key]: "1" },
    posture: true
  })),
  {
    label: "every posture flag set at once with NODE_ENV unset",
    env: Object.fromEntries(SENA_PRODUCTION_POSTURE_ENV_KEYS.map((key) => [key, "1"])),
    posture: true
  },
  // Shared truthiness parsing: booleanEnv trims, lowercases, and accepts
  // 1/true/yes/on. A site that parsed flags differently would diverge here.
  { label: "posture flag = \"true\"", env: { [performancePathKey]: "true" }, posture: true },
  { label: "posture flag = \"YES\" (uppercase)", env: { [evidenceManifestKey]: "YES" }, posture: true },
  { label: "posture flag = \"On\" (mixed case)", env: { [saasOperatingModelKey]: "On" }, posture: true },
  { label: "posture flag = \" 1 \" (padded)", env: { [performancePathKey]: " 1 " }, posture: true },
  { label: "posture flag = \"0\"", env: { [performancePathKey]: "0" }, posture: false },
  { label: "posture flag = \"false\"", env: { [evidenceManifestKey]: "false" }, posture: false },
  { label: "posture flag = \"\" (empty)", env: { [saasOperatingModelKey]: "" }, posture: false },
  { label: "posture flag = \"enabled\" (unrecognised)", env: { [performancePathKey]: "enabled" }, posture: false },
  { label: "NODE_ENV=\"Production\" (wrong case) alone", env: { NODE_ENV: "Production" }, posture: false }
];

describe("SENA production posture predicate agreement", () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of watchedEnvKeys) originalEnv.set(key, process.env[key]);
  });

  afterAll(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
      else (process.env as Record<string, string | undefined>)[key] = value;
    }
  });

  beforeEach(() => {
    setEnv({});
  });

  it.each(postureMatrix)("canonical posture reads $label", ({ env, posture }) => {
    setEnv(env);
    expect(senaProductionPosture()).toBe(posture);
  });

  it.each(postureMatrix)("every production hard-gate agrees with senaProductionPosture() for $label", ({ env }) => {
    setEnv(env);
    const posture = senaProductionPosture();
    for (const site of postureSites) {
      expect(
        site.read(),
        `${site.id} disagreed with senaProductionPosture() — re-derived production posture has drifted from lib/sena/enterprise/auth-config.ts`
      ).toBe(posture);
    }
  });

  // Each site keeps its own opt-in flag on top of the shared predicate. These
  // are deliberate extra terms, not drift: a "simplification" that replaced a
  // site body with a bare senaProductionPosture() would drop them.
  it.each(postureSites)("$id keeps its site-local opt-in flag on top of the shared predicate", (site) => {
    for (const key of site.siteLocalEnvKeys) {
      setEnv({ [key]: "1" });
      expect(senaProductionPosture()).toBe(false);
      expect(site.read(), `${site.id} ignored its site-local flag ${key}`).toBe(true);
    }
  });
});

describe("SENA enterprise file state write policy posture divergence", () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of watchedEnvKeys) originalEnv.set(key, process.env[key]);
  });

  afterAll(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
      else (process.env as Record<string, string | undefined>)[key] = value;
    }
  });

  beforeEach(() => {
    setEnv({});
  });

  // state.ts enterpriseFileStateWritePolicy is deliberately NOT the shared
  // posture predicate: SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH blocks
  // file-backed writes only in combination with NODE_ENV=production, which is
  // why its blocking reason is the compound label
  // "NODE_ENV=production+SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH". It was
  // written that way in 9bac69d and is pinned by
  // enterprise-state-production-policy.test.ts. It is therefore excluded from
  // the agreement matrix above. These cases pin the divergence so that aligning
  // it with senaProductionPosture() reads as the deliberate behaviour change it
  // would be, instead of passing as a silent refactor.
  const divergentCases: PostureCase[] = [
    { label: "NODE_ENV=production alone", env: { NODE_ENV: "production" }, posture: true },
    { label: `${performancePathKey}=1 with NODE_ENV unset`, env: { [performancePathKey]: "1" }, posture: true }
  ];

  const agreeingCases: PostureCase[] = [
    { label: "nothing set", env: {}, posture: false },
    { label: `${evidenceManifestKey}=1 with NODE_ENV unset`, env: { [evidenceManifestKey]: "1" }, posture: true },
    { label: `${saasOperatingModelKey}=1 with NODE_ENV unset`, env: { [saasOperatingModelKey]: "1" }, posture: true },
    {
      label: `NODE_ENV=production with ${performancePathKey}=1`,
      env: { NODE_ENV: "production", [performancePathKey]: "1" },
      posture: true
    }
  ];

  it.each(divergentCases)("does not block file writes for $label even though posture is production", ({ env, posture }) => {
    setEnv(env);
    expect(senaProductionPosture()).toBe(posture);
    expect(enterpriseFileStateWritePolicy().blocked).toBe(false);
  });

  it.each(agreeingCases)("tracks posture for $label", ({ env, posture }) => {
    setEnv(env);
    expect(senaProductionPosture()).toBe(posture);
    expect(enterpriseFileStateWritePolicy().blocked).toBe(posture);
  });
});
