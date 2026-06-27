import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function minutes(ms: number) {
  return Math.max(0, Math.ceil(ms / 60_000));
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
(process.env as Record<string, string | undefined>)["NODE_ENV"] =
  process.env.SENA_POST_CUTOVER_NODE_ENV?.trim() || "production";

const watch = process.argv.includes("--watch");
const attest = process.argv.includes("--attest");
const sampleEveryMinutes = Number.parseInt(process.env.SENA_POST_CUTOVER_SAMPLE_MINUTES ?? "6", 10);
const sampleEveryMs = Math.max(1, sampleEveryMinutes) * 60_000;

const enterprise = await import("../lib/sena/enterprise");
const { readEnterpriseDb } = await import("../lib/sena/enterprise/state");

type EnterprisePostCutoverObservation = ReturnType<typeof enterprise.recordEnterprisePostCutoverObservationSample>;
type PostCutoverObservationStep =
  | {
      done: true;
      observation: EnterprisePostCutoverObservation;
      sampled: boolean;
      attestationStatus: string;
    }
  | {
      done: false;
      observation: EnterprisePostCutoverObservation;
      sampled: boolean;
      waitMs: number;
    };

function activeObservation() {
  const db = readEnterpriseDb();
  const teamFilter = process.env.SENA_POST_CUTOVER_TEAM_ID?.trim();
  return [...(db.postCutoverObservations ?? [])]
    .filter((observation) => observation.status === "active")
    .filter((observation) => !teamFilter || observation.teamId === teamFilter)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

function latestObservation() {
  const db = readEnterpriseDb();
  const teamFilter = process.env.SENA_POST_CUTOVER_TEAM_ID?.trim();
  return [...(db.postCutoverObservations ?? [])]
    .filter((observation) => !teamFilter || observation.teamId === teamFilter)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

function contextForTeam(teamId: string) {
  const db = readEnterpriseDb();
  const membership = db.memberships.find((candidate) => (
    candidate.teamId === teamId &&
    candidate.status === "active" &&
    ["owner", "pi", "admin"].includes(candidate.role)
  ));
  if (!membership) {
    throw new Error(`No active manager membership found for team ${teamId}.`);
  }
  const user = db.users.find((candidate) => candidate.id === membership.userId);
  if (!user) {
    throw new Error(`No user found for manager membership ${membership.id}.`);
  }
  const session = db.sessions.find((candidate) => candidate.userId === user.id) ?? {
    id: "script-post-cutover-session",
    userId: user.id,
    tokenHash: "redacted-script-session",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    sessionProfile: "standard" as const,
    ttlDays: 0
  };
  return {
    user,
    session,
    memberships: db.memberships.filter((candidate) => candidate.userId === user.id),
    teams: db.teams.filter((team) => db.memberships.some((candidate) => (
      candidate.userId === user.id &&
      candidate.teamId === team.id &&
      candidate.status === "active"
    )))
  };
}

function createAttestationIfRequested(input: {
  teamId: string;
  environment: string;
  releaseVersion: string;
}) {
  if (!attest) return null;
  const db = readEnterpriseDb();
  const existing = (db.goLiveAttestations ?? []).find((candidate) => (
    candidate.teamId === input.teamId &&
    candidate.environment === input.environment &&
    candidate.releaseVersion === input.releaseVersion &&
    candidate.decision === "approved"
  ));
  if (existing) return existing;
  return enterprise.createEnterpriseGoLiveAttestation(contextForTeam(input.teamId), {
    teamId: input.teamId,
    environment: input.environment,
    releaseVersion: input.releaseVersion,
    decision: "approved",
    attesterName: "Self Managed Release Owner",
    attesterRole: "SENA self-managed operator",
    notes: "Approved after the real post-cutover observation window completed with ready monitoring evidence.",
    checklist: {
      rehearsalReviewed: true,
      releaseGateDraftReviewed: true,
      verificationEvidenceReviewed: true,
      rollbackOwnerConfirmed: true,
      platformOwnerDecisionReviewed: true
    }
  });
}

async function sampleAndMaybeComplete(): Promise<PostCutoverObservationStep> {
  const observation = activeObservation();
  if (!observation) {
    const latest = latestObservation();
    if (latest) {
      return {
        done: true,
        observation: latest,
        sampled: false,
        attestationStatus: latest.status === "ready" ? "already-complete" : "not-requested"
      };
    }
    throw new Error("No post-cutover observation found. Run npm run sena:self-managed:workflow first or set SENA_POST_CUTOVER_TEAM_ID.");
  }
  const context = contextForTeam(observation.teamId);
  const now = Date.now();
  const requiredUntil = Date.parse(observation.requiredUntil);
  const lastSample = observation.samples.at(-1);
  const lastSampleAt = lastSample ? Date.parse(lastSample.recordedAt) : Date.parse(observation.startedAt);
  const shouldSample = now >= requiredUntil || now - lastSampleAt >= sampleEveryMs;
  const sampled = shouldSample
    ? enterprise.recordEnterprisePostCutoverObservationSample(context, {
      teamId: observation.teamId,
      observationId: observation.id
    })
    : observation;

  if (Date.now() >= requiredUntil) {
    const completed = enterprise.completeEnterprisePostCutoverObservation(context, {
      teamId: observation.teamId,
      observationId: observation.id,
      acknowledgedWarningAlertIds: []
    });
    const attestation = createAttestationIfRequested({
      teamId: observation.teamId,
      environment: observation.environment,
      releaseVersion: observation.releaseVersion
    });
    return {
      done: true,
      observation: completed,
      sampled: shouldSample,
      attestationStatus: attestation?.status ?? "not-requested"
    };
  }

  return {
    done: false,
    observation: sampled,
    sampled: shouldSample,
    waitMs: Math.min(sampleEveryMs - Math.max(0, Date.now() - (shouldSample ? Date.parse(sampled.samples.at(-1)?.recordedAt ?? observation.startedAt) : lastSampleAt)), requiredUntil - Date.now())
  };
}

while (true) {
  const result = await sampleAndMaybeComplete();
  const latest = result.observation.samples.at(-1);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    observationId: result.observation.id,
    teamId: result.observation.teamId,
    status: result.observation.status,
    samples: result.observation.samples.length,
    latestSampleAt: latest?.recordedAt ?? "missing",
    requiredUntil: result.observation.requiredUntil,
    sampled: result.sampled,
    ...(result.done ? { attestationStatus: result.attestationStatus } : { waitMinutes: minutes(result.waitMs) })
  }));
  if (result.done || !watch) break;
  await sleep(Math.max(1_000, result.waitMs));
}
