import { createHash, randomUUID } from "node:crypto";
import { ChildProcess, spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright";
import { gotoHydratedSenaRegisterPage } from "./sena-auth-browser-hydration.mjs";
import {
  assertSenaVerifierEnvironmentFilesUnchanged,
  assertSenaVerifierEnvironmentIsLocal
} from "./sena-verifier-environment.mjs";

const defaultTimeout = 15000;
const requiredPublicationFormats = ["svg", "png", "html", "xlsx", "docx", "pdf"];
const expectedImportWarnings = [];
const scimIdentityProductionExtensionSchema = "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig";
const ephemeralReceiptKeyIdPattern = /^sena-pilot-smoke-[a-f0-9]{16}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const verifierControlledLoopbackHostnames = new Set(["127.0.0.1", "[::1]", "localhost"]);
const registeredVerifierServerCustodies = new WeakSet();

export function requireExpectedReceiptKeyId(options) {
  const expectedReceiptKeyId = options.expectedReceiptKeyId ??
    process.env.SENA_ENTERPRISE_API_BROWSER_SMOKE_EXPECTED_RECEIPT_KEY_ID;
  if (typeof expectedReceiptKeyId !== "string" || !ephemeralReceiptKeyIdPattern.test(expectedReceiptKeyId)) {
    throw new Error(
      "Enterprise API browser smoke requires the exact verifier-only ephemeral receipt key id before any browser or server mutation."
    );
  }
  return expectedReceiptKeyId;
}

function enterpriseSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_ENTERPRISE_API_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
}

export function requireVerifierControlledLoopbackOrigin(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      "Enterprise API browser smoke only supports a verifier-controlled loopback temporary server before any browser or network work."
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !verifierControlledLoopbackHostnames.has(parsed.hostname)
  ) {
    throw new Error(
      "Enterprise API browser smoke only supports a verifier-controlled loopback temporary server before any browser or network work."
    );
  }
  return parsed.origin;
}

export function requireVerifierOwnedLoopbackListener(serverProcess, origin) {
  const parsed = new URL(requireVerifierControlledLoopbackOrigin(origin));
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  if (
    parsed.hostname !== "127.0.0.1" ||
    !(serverProcess instanceof ChildProcess) ||
    !Number.isInteger(serverProcess.pid) ||
    serverProcess.pid <= 0 ||
    serverProcess.exitCode !== null ||
    serverProcess.signalCode !== null ||
    serverProcess.killed
  ) {
    throw new Error("Verifier-owned server is not a live IPv4 loopback process.");
  }
  const listeners = spawnSync("lsof", [
    "-n",
    "-P",
    "-a",
    "-p",
    String(serverProcess.pid),
    "-iTCP",
    "-sTCP:LISTEN",
    "-Fn"
  ], {
    encoding: "utf8",
    timeout: 5_000
  });
  const endpoints = (listeners.stdout ?? "")
    .split("\n")
    .filter((line) => line.startsWith("n"))
    .map((line) => line.slice(1));
  const expectedEndpoint = `127.0.0.1:${port}`;
  if (
    listeners.status !== 0 ||
    endpoints.length === 0 ||
    endpoints.some((endpoint) => endpoint !== expectedEndpoint)
  ) {
    throw new Error(
      "Verifier-owned server must be the observed PID listening only on the exact IPv4 loopback endpoint."
    );
  }
  return true;
}

function validateVerifierControlledServerCustody(
  options,
  origin,
  expectedReceiptKeyId,
  provisioningToken,
  requireRegistration
) {
  const custody = options.serverCustody;
  const serverProcess = custody?.serverProcess;
  const serverEnvironment = custody?.serverEnvironment;
  const enterpriseDbDir = custody?.enterpriseDbDir;
  const originUrl = new URL(origin);
  const port = originUrl.port || (originUrl.protocol === "https:" ? "443" : "80");
  const normalizedTmpDir = resolve(tmpdir());
  const normalizedEnterpriseDbDir = typeof enterpriseDbDir === "string" ? resolve(enterpriseDbDir) : "";
  const expectedDbPrefix = `${normalizedTmpDir}${sep}sena-pilot-enterprise-db-`;
  let enterpriseDbStats = null;
  try {
    enterpriseDbStats = normalizedEnterpriseDbDir.startsWith(expectedDbPrefix)
      ? lstatSync(normalizedEnterpriseDbDir)
      : null;
  } catch {
    enterpriseDbStats = null;
  }
  const spawnargs = Array.isArray(serverProcess?.spawnargs) ? serverProcess.spawnargs : [];
  const nextBin = spawnargs[1] ?? "";
  const signingSecret = serverEnvironment?.SENA_EXPERT_REVIEW_SIGNING_SECRET;
  let verifierEnvironmentIsLocal = false;
  try {
    assertSenaVerifierEnvironmentIsLocal(serverEnvironment, enterpriseDbDir);
    assertSenaVerifierEnvironmentFilesUnchanged(
      serverEnvironment,
      custody?.serverWorkingDirectory
    );
    verifierEnvironmentIsLocal = true;
  } catch {
    verifierEnvironmentIsLocal = false;
  }
  if (
    custody?.mode !== "verifier-controlled-loopback-temporary-server" ||
    custody?.serverReadyFromOwnedProcess !== true ||
    custody?.serverLoopbackListenerVerified !== true ||
    typeof custody?.serverWorkingDirectory !== "string" ||
    resolve(custody.serverWorkingDirectory) !== resolve(process.cwd()) ||
    !(serverProcess instanceof ChildProcess) ||
    !Number.isInteger(serverProcess.pid) ||
    serverProcess.pid <= 0 ||
    serverProcess.exitCode !== null ||
    serverProcess.signalCode !== null ||
    serverProcess.killed ||
    serverProcess.spawnfile !== process.execPath ||
    spawnargs.length !== 7 ||
    spawnargs[0] !== process.execPath ||
    !(nextBin === "node_modules/next/dist/bin/next" || nextBin.endsWith("/node_modules/next/dist/bin/next")) ||
    spawnargs[2] !== "start" ||
    spawnargs[3] !== "-H" ||
    spawnargs[4] !== "127.0.0.1" ||
    spawnargs[5] !== "-p" ||
    spawnargs[6] !== port ||
    !serverEnvironment ||
    !Object.isFrozen(serverEnvironment) ||
    !verifierEnvironmentIsLocal ||
    serverEnvironment.PORT !== port ||
    serverEnvironment.SENA_ENTERPRISE_DB_DIR !== enterpriseDbDir ||
    serverEnvironment.SENA_ALLOW_LOCAL_SSO_FALLBACK !== "1" ||
    serverEnvironment.SENA_PROVISIONING_TOKEN !== provisioningToken ||
    serverEnvironment.SENA_EXPERT_REVIEW_SIGNING_KEY_ID !== expectedReceiptKeyId ||
    typeof signingSecret !== "string" ||
    Buffer.byteLength(signingSecret, "utf8") < 32 ||
    !enterpriseDbStats?.isDirectory() ||
    enterpriseDbStats.isSymbolicLink() ||
    (requireRegistration && !registeredVerifierServerCustodies.has(custody))
  ) {
    throw new Error(
      "Enterprise API browser smoke requires live verifier-controlled temporary-server custody from verify-sena-pilot before any browser or server mutation."
    );
  }
  return custody;
}

export function registerVerifierControlledServerCustody(options, origin, expectedReceiptKeyId, provisioningToken) {
  const custody = validateVerifierControlledServerCustody(
    options,
    origin,
    expectedReceiptKeyId,
    provisioningToken,
    false
  );
  registeredVerifierServerCustodies.add(custody);
  return custody;
}

export function requireVerifierControlledServerCustody(options, origin, expectedReceiptKeyId, provisioningToken) {
  return validateVerifierControlledServerCustody(
    options,
    origin,
    expectedReceiptKeyId,
    provisioningToken,
    true
  );
}

function header(response, name) {
  return response.headers()[name.toLowerCase()] ?? "";
}

function requireHeaderValue(headers, name) {
  const value = headers[name.toLowerCase()] ?? "";
  if (!value) throw new Error(`Missing required response header ${name}.`);
  return value;
}

function assertArrayIncludes(array, expected, label) {
  if (!Array.isArray(array) || !array.includes(expected)) {
    throw new Error(`${label} missing ${expected}; received ${JSON.stringify(array)}.`);
  }
}

function assertExactArray(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must exactly equal ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}.`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !sha256Pattern.test(value)) {
    throw new Error(`${label} must be a lowercase 64-hex SHA-256 value.`);
  }
  return value;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), "utf8"));
}

function assertCanonicalClaimRevisionEvidence(value) {
  const stateRevisionSha256 = requireSha256(
    value?.sourceSnapshotEvidence?.stateRevisionSha256,
    "Persisted claim state revision SHA-256"
  );
  const evidence = value?.evidenceSource?.evidence;
  if (!Array.isArray(evidence)) {
    throw new Error("Persisted claim package must expose atomic-read evidence entries.");
  }
  const prefix = "claimEvidenceStateRevisionSha256=";
  const revisionEvidenceIndexes = evidence.flatMap((entry, index) => (
    typeof entry === "string" && entry.startsWith(prefix) ? [index] : []
  ));
  const expectedEvidence = `${prefix}${stateRevisionSha256}`;
  if (revisionEvidenceIndexes.length !== 1 || evidence[revisionEvidenceIndexes[0]] !== expectedEvidence) {
    throw new Error("Persisted claim package must expose exactly one canonical state-revision evidence entry bound to its body revision.");
  }
  return revisionEvidenceIndexes[0];
}

function stablePersistedClaimPackage(value) {
  const stable = structuredClone(value);
  const revisionEvidenceIndex = assertCanonicalClaimRevisionEvidence(stable);
  delete stable.generatedAt;
  delete stable.sourceSnapshotEvidence.stateRevisionSha256;
  stable.evidenceSource.evidence[revisionEvidenceIndex] =
    "claimEvidenceStateRevisionSha256=<request-scoped>";
  return stable;
}

function isSelfManagedIdentityEvidence(identityProductionEvidence) {
  return Array.isArray(identityProductionEvidence?.evidence) &&
    identityProductionEvidence.evidence.includes("enterpriseDeploymentMode=self-managed") &&
    identityProductionEvidence.evidence.includes("institutionIdentityEvidence=not-applicable");
}

async function fillByTestId(page, testId, value) {
  await page.locator(`[data-testid="${testId}"]`).first().fill(value, { timeout: defaultTimeout });
}

async function checkByTestId(page, testId) {
  const locator = page.locator(`[data-testid="${testId}"]`).first();
  await locator.waitFor({ state: "visible", timeout: defaultTimeout });
  await locator.check({ timeout: defaultTimeout });
}

async function submitAndWaitForResponse(page, submitTestId, apiPath) {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => (
      new URL(candidate.url()).pathname === apiPath &&
      candidate.request().method() === "POST"
    ), { timeout: defaultTimeout }),
    page.locator(`[data-testid="${submitTestId}"]`).first().click({ timeout: defaultTimeout })
  ]);
  if (!response.ok()) {
    throw new Error(`${apiPath} returned HTTP ${response.status()}: ${await response.text()}`);
  }
  return response;
}

async function registerSmokeSession(page, origin) {
  const unique = randomUUID().slice(0, 8);
  const email = `enterprise-api-smoke-${unique}@example.edu`;
  const password = "sena-secure-123";

  await gotoHydratedSenaRegisterPage(page, origin, defaultTimeout);
  await fillByTestId(page, "register-full-name", "SENA Enterprise API Smoke");
  await fillByTestId(page, "register-email", email);
  await fillByTestId(page, "register-organization", "SENA Enterprise API Smoke Lab");
  await fillByTestId(page, "register-password", password);
  await fillByTestId(page, "register-confirm-password", password);
  await checkByTestId(page, "register-terms");
  const registerResponse = await submitAndWaitForResponse(page, "register-submit", "/api/auth/register");
  if (header(registerResponse, "x-sena-auth-flow") !== "password-register") {
    throw new Error(`Expected password-register flow, received ${header(registerResponse, "x-sena-auth-flow") || "<missing>"}.`);
  }
  if (header(registerResponse, "x-sena-auth-membership-role") !== "owner") {
    throw new Error(`Expected owner registration role, received ${header(registerResponse, "x-sena-auth-membership-role") || "<missing>"}.`);
  }
  const teamId = header(registerResponse, "x-sena-auth-team-id");
  if (!teamId) {
    throw new Error("Registration response did not include x-sena-auth-team-id for enterprise API smoke.");
  }
  await page.waitForURL("**/workspace/sena", { timeout: defaultTimeout });
  return { email, teamId };
}

async function fetchEnterpriseWorkflow(page, teamId, provisioningToken) {
  return await page.evaluate(async ({ requiredFormats, teamId: activeTeamId, provisioningToken: bearerToken }) => {
    function responseHeaders(response) {
      return Object.fromEntries(Array.from(response.headers.entries()));
    }

    function parseJsonResponse(response) {
      return response.json().catch(async () => ({
        parseError: await response.text()
      }));
    }

    const scimConfigResponse = await fetch("/api/sena/scim/v2/ServiceProviderConfig", {
      credentials: "include",
      headers: {
        authorization: `Bearer ${bearerToken}`
      }
    });
    const scimConfigBody = await parseJsonResponse(scimConfigResponse);
    const scimConfigHeaders = responseHeaders(scimConfigResponse);

    const csrfResponse = await fetch("/api/auth/csrf", { credentials: "include" });
    const csrfBody = await parseJsonResponse(csrfResponse);
    const csrfToken = csrfBody?.token;
    if (!csrfResponse.ok || !csrfToken) {
      return {
        scimConfig: { status: scimConfigResponse.status, headers: scimConfigHeaders, body: scimConfigBody },
        csrf: { status: csrfResponse.status, headers: responseHeaders(csrfResponse), body: csrfBody },
        platformDecision: null,
        importResult: null,
        analysisRefresh: null,
        publicationBlocked: null,
        reliability: null,
        reliabilityApproval: null,
        validation: null,
        validationApproval: null,
        expertReview: null,
        expertReviewApproval: null,
        claimPackage: null,
        projectBeforePublication: null,
        publication: null,
        projectAfterPublication: null,
        claimPackageAfterPublication: null
      };
    }

    const platformDecisionResponse = await fetch("/api/sena/ops/platform-decisions", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": csrfToken
      },
      body: JSON.stringify({
        teamId: activeTeamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution Identity Owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        notes: "Records identity request packet response smoke without attaching production evidence IDs yet."
      })
    });
    const platformDecisionBody = await parseJsonResponse(platformDecisionResponse);
    const platformDecisionHeaders = responseHeaders(platformDecisionResponse);

    const transcript = [
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "T1: We should ask a better question and gather evidence. #reflection",
      "",
      "2",
      "00:00:04,000 --> 00:00:06,000",
      "T2: The graph links evidence to an emerging explanation. #reflection",
      "",
      "3",
      "00:00:07,000 --> 00:00:09,000",
      "T1: Let's write an explanation and return to review. #reflection"
    ].join("\n");
    const contractResponse = await fetch("/sena-pilot/sample/lesson-study-sena-contract.json", {
      credentials: "include"
    });
    if (!contractResponse.ok) {
      throw new Error(`Pilot contract fixture returned HTTP ${contractResponse.status}.`);
    }
    const contractText = await contractResponse.text();
    const publicContract = JSON.parse(contractText);
    const retainedPersonIds = new Set(["T1", "T2"]);
    const retainedUtteranceIds = new Set(["u1", "u2", "u4", "u7", "u10"]);
    const retainedContractCodeIds = new Set(["question", "evidence", "explanation"]);
    const compactContract = {
      ...publicContract,
      people: publicContract.people.filter((person) => retainedPersonIds.has(person.id)),
      interactions: publicContract.interactions.filter((interaction) => (
        retainedPersonIds.has(interaction.source) && retainedPersonIds.has(interaction.target)
      )),
      utterances: publicContract.utterances.filter((utterance) => retainedUtteranceIds.has(utterance.id)),
      coded_segments: publicContract.coded_segments
        .filter((segment) => retainedUtteranceIds.has(segment.utteranceId))
        .map((segment) => ({
          ...segment,
          codes: segment.codes.filter((codeId) => retainedContractCodeIds.has(codeId))
        }))
        .filter((segment) => segment.codes.length > 0),
      codebook: publicContract.codebook.filter((code) => retainedContractCodeIds.has(code.id))
    };
    const codingReliability = {
      status: "documented",
      reviewer: "Enterprise API smoke fixture",
      reviewedAt: "2026-07-07T00:00:00.000Z",
      codingScheme: "Synthetic lesson-study smoke coding fixture v1",
      unitOfCoding: "utterance",
      coderCount: 2,
      agreementMetric: "fixture-consensus",
      agreementValue: "1.00",
      adjudicationNotes: "Synthetic smoke fixture uses deterministic consensus coding.",
      limitations: "Synthetic fixture only; not human-subjects research evidence."
    };
    const dataGovernance = {
      irbApprovalId: "SYNTHETIC-SMOKE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic browser-smoke fixture; no participant data.",
      retentionPolicy: "Retain only generated smoke artifacts for automated verification.",
      usageConstraints: ["Automated verification only", "Do not use for research claims"],
      dataSteward: "SENA enterprise smoke verifier",
      reviewedAt: "2026-07-07T00:00:00.000Z"
    };

    const form = new FormData();
    form.set("action", "create-project");
    form.set("title", "Enterprise API Smoke Project");
    form.set("includeRuntimeBundle", "true");
    form.set("codingReliability", JSON.stringify(codingReliability));
    form.set("dataGovernance", JSON.stringify(dataGovernance));
    form.append("files", new File([JSON.stringify(compactContract)], "lesson-study-sena-contract.json", {
      type: "application/json"
    }));
    form.append("files", new File([transcript], "enterprise-api-smoke-transcript.srt", {
      type: "application/x-subrip"
    }));

    const importResponse = await fetch("/api/sena/import", {
      method: "POST",
      credentials: "include",
      headers: {
        "x-sena-csrf-token": csrfToken
      },
      body: form
    });
    const importBody = await parseJsonResponse(importResponse);
    const importHeaders = responseHeaders(importResponse);
    const projectId = importBody?.persistedProject?.id;

    let analysisRefreshResponse = null;
    let analysisRefreshBody = null;
    let analysisRefreshHeaders = null;
    let publicationBlockedResponse = null;
    let publicationBlockedBody = null;
    let publicationBlockedHeaders = null;
    let reliabilityResponse = null;
    let reliabilityBody = null;
    let reliabilityHeaders = null;
    let reliabilityApprovalResponse = null;
    let reliabilityApprovalBody = null;
    let reliabilityApprovalHeaders = null;
    let validationResponse = null;
    let validationBody = null;
    let validationHeaders = null;
    let validationApprovalResponse = null;
    let validationApprovalBody = null;
    let validationApprovalHeaders = null;
    let expertReviewResponse = null;
    let expertReviewBody = null;
    let expertReviewHeaders = null;
    let expertReviewApprovalResponse = null;
    let expertReviewApprovalBody = null;
    let expertReviewApprovalHeaders = null;
    let claimPackageResponse = null;
    let claimPackageBody = null;
    let claimPackageHeaders = null;
    let projectBeforePublicationResponse = null;
    let projectBeforePublicationBody = null;
    let projectBeforePublicationHeaders = null;
    let publicationResponse = null;
    let publicationBody = null;
    let publicationHeaders = null;
    let projectAfterPublicationResponse = null;
    let projectAfterPublicationBody = null;
    let projectAfterPublicationHeaders = null;
    let claimPackageAfterPublicationResponse = null;
    let claimPackageAfterPublicationBody = null;
    let claimPackageAfterPublicationHeaders = null;
    if (projectId) {
      analysisRefreshResponse = await fetch("/api/sena/analyze", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          projectId,
          persist: true,
          updateProject: true,
          expectedVersion: importBody?.persistedProject?.currentVersion,
          includeRuntimeBundle: true,
          humanReview: {
            status: "human-reviewed",
            reviewer: "Enterprise API smoke domain reviewer",
            interpretation: "The synthetic lesson-study fixture links collaboration patterns to coded discourse for workflow verification.",
            limitations: "Synthetic fixture evidence cannot support empirical or causal claims.",
            nextActions: "Retain the limited-claim guardrails and verify every evidence binding."
          },
          codingReliability,
          dataGovernance
        })
      });
      analysisRefreshBody = await parseJsonResponse(analysisRefreshResponse);
      analysisRefreshHeaders = responseHeaders(analysisRefreshResponse);

      publicationBlockedResponse = await fetch("/api/sena/exports/publication", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          projectId,
          format: "package"
        })
      });
      publicationBlockedBody = await parseJsonResponse(publicationBlockedResponse);
      publicationBlockedHeaders = responseHeaders(publicationBlockedResponse);

      const snapshot = analysisRefreshBody?.persistedProject?.snapshot;
      const authoritativeDataset = snapshot?.source?.sourceDataset ?? snapshot?.dataset;
      const itemIds = authoritativeDataset?.utterances?.slice(0, 3).map((utterance) => utterance.id) ?? [];
      const codeIds = authoritativeDataset?.codebook?.slice(0, 3).map((code) => code.id) ?? [];
      const annotations = itemIds.flatMap((itemId, index) => ["enterprise-smoke-coder-a", "enterprise-smoke-coder-b"].map((coderId) => ({
        coder_id: coderId,
        item_id: itemId,
        code_id: codeIds[index],
        value: "1"
      })));
      reliabilityResponse = await fetch("/api/sena/reliability", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          schemaVersion: "sena-reliability-json-request/v1",
          teamId: activeTeamId,
          projectId,
          reviewer: "Enterprise API smoke reliability reviewer",
          sourceName: "enterprise-api-smoke-reliability.json",
          annotations
        })
      });
      reliabilityBody = await parseJsonResponse(reliabilityResponse);
      reliabilityHeaders = responseHeaders(reliabilityResponse);

      const reliabilityRunId = reliabilityBody?.reliabilityRun?.id;
      if (reliabilityRunId) {
        reliabilityApprovalResponse = await fetch("/api/sena/reliability", {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrfToken
          },
          body: JSON.stringify({
            runId: reliabilityRunId,
            status: "approved",
            notes: "Enterprise API smoke approval after complete zero-disagreement adjudication coverage."
          })
        });
        reliabilityApprovalBody = await parseJsonResponse(reliabilityApprovalResponse);
        reliabilityApprovalHeaders = responseHeaders(reliabilityApprovalResponse);
      }

      validationResponse = await fetch("/api/sena/validation/group-comparison", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          projectId,
          suite: true,
          comparisons: [
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" },
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" },
            { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "alignment" }
          ],
          iterations: 100,
          bootstrapIterations: 100,
          alpha: 0.05,
          preregistrationNote: "Enterprise API smoke preregistration note for the Holm suite.",
          methodNote: "Holm-corrected multi-metric validation suite for enterprise publication smoke.",
          parityEvidence: {
            walkthroughDatasetLabel: "enterprise API smoke lesson-study walkthrough",
            walkthroughDatasetHash: "enterprise-api-smoke-walkthrough-sha256",
            expertReviewRequired: true,
            studySpecificInferenceReference: "prereg:enterprise-api-smoke-holm-model-v1",
            runtimeParityIds: ["jena-rena-sample-parity", "jsna-r-sna-social-parity"]
          }
        })
      });
      validationBody = await parseJsonResponse(validationResponse);
      validationHeaders = responseHeaders(validationResponse);

      const validationRunId = validationHeaders["x-sena-validation-run-id"];
      if (validationRunId) {
        validationApprovalResponse = await fetch("/api/sena/validation/group-comparison", {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrfToken
          },
          body: JSON.stringify({
            runId: validationRunId,
            status: "approved",
            notes: "Approved Holm-corrected validation suite for limited enterprise smoke claims."
          })
        });
        validationApprovalBody = await parseJsonResponse(validationApprovalResponse);
        validationApprovalHeaders = responseHeaders(validationApprovalResponse);

        expertReviewResponse = await fetch("/api/sena/validation/expert-review", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "x-sena-csrf-token": csrfToken
          },
          body: JSON.stringify({
            projectId,
            target: {
              kind: "validation-run",
              id: validationRunId,
              label: "Holm-corrected enterprise API smoke validation suite"
            },
            reviewerName: "Dr. Enterprise API Smoke Reviewer",
            reviewerRole: "Lesson-study methodologist",
            expertiseArea: "Teacher collaboration and discourse analysis",
            status: "changes-requested",
            claimScope: "exploratory-only",
            ratings: {
              dataAdequacy: 4,
              methodFit: 4,
              interpretationValidity: 3
            },
            concerns: "Tighten claim wording before marking the synthetic fixture claim-ready."
          })
        });
        expertReviewBody = await parseJsonResponse(expertReviewResponse);
        expertReviewHeaders = responseHeaders(expertReviewResponse);

        const expertReviewId = expertReviewHeaders["x-sena-expert-review-id"];
        if (expertReviewId) {
          expertReviewApprovalResponse = await fetch("/api/sena/validation/expert-review", {
            method: "PATCH",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              "x-sena-csrf-token": csrfToken
            },
            body: JSON.stringify({
              reviewId: expertReviewId,
              status: "approved",
              claimScope: "claim-ready-with-limits",
              ratings: {
                interpretationValidity: 5
              },
              recommendations: "Approved for limited synthetic smoke use with explicit method and sample caveats."
            })
          });
          expertReviewApprovalBody = await parseJsonResponse(expertReviewApprovalResponse);
          expertReviewApprovalHeaders = responseHeaders(expertReviewApprovalResponse);
        }
      }

      claimPackageResponse = await fetch(`/api/sena/validation/claim-package?projectId=${encodeURIComponent(projectId)}`, {
        credentials: "include"
      });
      claimPackageBody = await parseJsonResponse(claimPackageResponse);
      claimPackageHeaders = responseHeaders(claimPackageResponse);

      projectBeforePublicationResponse = await fetch(`/api/sena/projects/${encodeURIComponent(projectId)}`, {
        credentials: "include"
      });
      projectBeforePublicationBody = await parseJsonResponse(projectBeforePublicationResponse);
      projectBeforePublicationHeaders = responseHeaders(projectBeforePublicationResponse);

      publicationResponse = await fetch("/api/sena/exports/publication", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrfToken
        },
        body: JSON.stringify({
          projectId,
          format: "package"
        })
      });
      publicationBody = await parseJsonResponse(publicationResponse);
      publicationHeaders = responseHeaders(publicationResponse);

      projectAfterPublicationResponse = await fetch(`/api/sena/projects/${encodeURIComponent(projectId)}`, {
        credentials: "include"
      });
      projectAfterPublicationBody = await parseJsonResponse(projectAfterPublicationResponse);
      projectAfterPublicationHeaders = responseHeaders(projectAfterPublicationResponse);

      claimPackageAfterPublicationResponse = await fetch(`/api/sena/validation/claim-package?projectId=${encodeURIComponent(projectId)}`, {
        credentials: "include"
      });
      claimPackageAfterPublicationBody = await parseJsonResponse(claimPackageAfterPublicationResponse);
      claimPackageAfterPublicationHeaders = responseHeaders(claimPackageAfterPublicationResponse);
    }

    return {
      scimConfig: {
        status: scimConfigResponse.status,
        headers: scimConfigHeaders,
        body: scimConfigBody
      },
      csrf: {
        status: csrfResponse.status,
        headers: responseHeaders(csrfResponse),
        body: csrfBody
      },
      platformDecision: {
        status: platformDecisionResponse.status,
        headers: platformDecisionHeaders,
        body: platformDecisionBody
      },
      importResult: {
        status: importResponse.status,
        headers: importHeaders,
        body: importBody
      },
      analysisRefresh: analysisRefreshResponse ? {
        status: analysisRefreshResponse.status,
        headers: analysisRefreshHeaders,
        body: analysisRefreshBody
      } : null,
      publicationBlocked: publicationBlockedResponse ? {
        status: publicationBlockedResponse.status,
        headers: publicationBlockedHeaders,
        body: publicationBlockedBody
      } : null,
      reliability: reliabilityResponse ? {
        status: reliabilityResponse.status,
        headers: reliabilityHeaders,
        body: reliabilityBody
      } : null,
      reliabilityApproval: reliabilityApprovalResponse ? {
        status: reliabilityApprovalResponse.status,
        headers: reliabilityApprovalHeaders,
        body: reliabilityApprovalBody
      } : null,
      validation: validationResponse ? {
        status: validationResponse.status,
        headers: validationHeaders,
        body: validationBody
      } : null,
      validationApproval: validationApprovalResponse ? {
        status: validationApprovalResponse.status,
        headers: validationApprovalHeaders,
        body: validationApprovalBody
      } : null,
      expertReview: expertReviewResponse ? {
        status: expertReviewResponse.status,
        headers: expertReviewHeaders,
        body: expertReviewBody
      } : null,
      expertReviewApproval: expertReviewApprovalResponse ? {
        status: expertReviewApprovalResponse.status,
        headers: expertReviewApprovalHeaders,
        body: expertReviewApprovalBody
      } : null,
      claimPackage: claimPackageResponse ? {
        status: claimPackageResponse.status,
        headers: claimPackageHeaders,
        body: claimPackageBody
      } : null,
      projectBeforePublication: projectBeforePublicationResponse ? {
        status: projectBeforePublicationResponse.status,
        headers: projectBeforePublicationHeaders,
        body: projectBeforePublicationBody
      } : null,
      publication: publicationResponse ? {
        status: publicationResponse.status,
        headers: publicationHeaders,
        body: publicationBody,
        requiredFormats
      } : null,
      projectAfterPublication: projectAfterPublicationResponse ? {
        status: projectAfterPublicationResponse.status,
        headers: projectAfterPublicationHeaders,
        body: projectAfterPublicationBody
      } : null,
      claimPackageAfterPublication: claimPackageAfterPublicationResponse ? {
        status: claimPackageAfterPublicationResponse.status,
        headers: claimPackageAfterPublicationHeaders,
        body: claimPackageAfterPublicationBody
      } : null
    };
  }, { requiredFormats: requiredPublicationFormats, teamId, provisioningToken });
}

function assertEnterpriseWorkflowEvidence(evidence, expectedReceiptKeyId) {
  const scimConfig = evidence.scimConfig;
  if (scimConfig?.status !== 200) {
    throw new Error(`SCIM ServiceProviderConfig returned HTTP ${scimConfig?.status ?? "<missing>"}: ${JSON.stringify(scimConfig?.body)}.`);
  }
  if (scimConfig.body?.schemaVersion !== "sena-scim-service-provider-config/v1") {
    throw new Error(`SCIM ServiceProviderConfig returned unexpected schema ${scimConfig.body?.schemaVersion ?? "<missing>"}.`);
  }
  assertArrayIncludes(scimConfig.body?.schemas, scimIdentityProductionExtensionSchema, "SCIM ServiceProviderConfig schemas");
  assertArrayIncludes(scimConfig.body?.supportedSchemas, scimIdentityProductionExtensionSchema, "SCIM ServiceProviderConfig supportedSchemas");
  const scimIdentityGate = scimConfig.body?.[scimIdentityProductionExtensionSchema];
  if (scimIdentityGate?.schemaVersion !== "sena-scim-identity-production-gate/v1") {
    throw new Error(`SCIM ServiceProviderConfig missing identity production extension: ${JSON.stringify(scimIdentityGate)}.`);
  }
  if (scimConfig.headers["x-sena-scim-production-owner-gate"] !== scimIdentityGate.status) {
    throw new Error(`SCIM production owner gate header/body mismatch: ${scimConfig.headers["x-sena-scim-production-owner-gate"]} vs ${scimIdentityGate.status}.`);
  }
  requireHeaderValue(scimConfig.headers, "x-sena-identity-institution-action-plan-digest");
  requireHeaderValue(scimConfig.headers, "x-sena-identity-owner-runbook-digest");
  requireHeaderValue(scimConfig.headers, "x-sena-identity-owner-runbook-blocking");
  requireHeaderValue(scimConfig.headers, "x-sena-identity-owner-runbook-preflight-checks");
  if (!/^[a-f0-9]{64}$/.test(String(scimIdentityGate.institutionActionPlan?.digest ?? ""))) {
    throw new Error(`SCIM identity production extension is missing action-plan digest: ${JSON.stringify(scimIdentityGate.institutionActionPlan)}.`);
  }
  if (scimIdentityGate.platformDecisionSubmission?.path !== "/api/sena/ops/platform-decisions") {
    throw new Error(`SCIM identity production extension is missing platform decision submission path: ${JSON.stringify(scimIdentityGate.platformDecisionSubmission)}.`);
  }
  if (scimIdentityGate.redaction?.secretValuesExcluded !== true ||
      scimIdentityGate.redaction?.evidenceUrlValuesExcluded !== true ||
      scimIdentityGate.redaction?.ownerNamesExcluded !== true) {
    throw new Error(`SCIM identity production redaction flags are incomplete: ${JSON.stringify(scimIdentityGate.redaction)}.`);
  }

  if (evidence.csrf.status !== 200 || evidence.csrf.body?.schemaVersion !== "sena-enterprise-csrf-token/v1") {
    throw new Error(`CSRF preflight failed: ${JSON.stringify(evidence.csrf)}.`);
  }

  const platformDecision = evidence.platformDecision;
  if (platformDecision?.status !== 201) {
    throw new Error(`Platform decision POST returned HTTP ${platformDecision?.status ?? "<missing>"}: ${JSON.stringify(platformDecision?.body)}.`);
  }
  if (platformDecision.body?.acceptance?.decisionId !== "institution-idp-approval") {
    throw new Error(`Platform decision response did not record institution-idp-approval: ${JSON.stringify(platformDecision.body?.acceptance)}.`);
  }
  if (platformDecision.body?.identityProductionEvidence?.schemaVersion !== "sena-enterprise-identity-production-evidence/v1") {
    throw new Error(`Platform decision response did not include refreshed identityProductionEvidence: ${JSON.stringify(platformDecision.body?.identityProductionEvidence)}.`);
  }
  const identityProductionEvidence = platformDecision.body.identityProductionEvidence;
  if (!Number.isFinite(identityProductionEvidence?.platformRequestPacket?.summary?.blockingRequests)) {
    throw new Error(`Identity production evidence is missing platformRequestPacket.summary.blockingRequests: ${JSON.stringify(platformDecision.body?.identityProductionEvidence)}.`);
  }
  if (!Number.isFinite(identityProductionEvidence?.submissionVerifier?.summary?.incompleteDecisions)) {
    throw new Error(`Identity production evidence is missing submissionVerifier.summary.incompleteDecisions: ${JSON.stringify(platformDecision.body?.identityProductionEvidence)}.`);
  }
  const cutoverChecklist = identityProductionEvidence.cutoverChecklist;
  if (cutoverChecklist?.schemaVersion !== "sena-enterprise-identity-cutover-checklist/v1") {
    throw new Error(`Identity production evidence is missing sena-enterprise-identity-cutover-checklist/v1: ${JSON.stringify(identityProductionEvidence)}.`);
  }
  if (!Number.isFinite(cutoverChecklist.summary.blockingItems)) {
    throw new Error(`Identity production evidence is missing cutoverChecklist.summary.blockingItems: ${JSON.stringify(cutoverChecklist)}.`);
  }
  ["idp-tenant-approval", "sso-secret-custody", "scim-idp-ownership", "identity-secret-rotation"].forEach((cutoverItemId) => {
    if (!cutoverChecklist.items?.some((item) => item.id === cutoverItemId)) {
      throw new Error(`Identity cutover checklist missing ${cutoverItemId}: ${JSON.stringify(cutoverChecklist)}.`);
    }
  });
  const submissionMatrix = identityProductionEvidence.institutionActionPlan?.submissionMatrix;
  if (submissionMatrix?.schemaVersion !== "sena-enterprise-identity-submission-matrix/v1") {
    throw new Error(`Identity production evidence is missing sena-enterprise-identity-submission-matrix/v1: ${JSON.stringify(identityProductionEvidence.institutionActionPlan)}.`);
  }
  const selfManagedIdentityEvidence = isSelfManagedIdentityEvidence(identityProductionEvidence);
  if (selfManagedIdentityEvidence) {
    if (identityProductionEvidence.status !== "ready" || identityProductionEvidence.releaseGate?.approvalBlocked !== false) {
      throw new Error(`Self-managed identity evidence should be ready and not release-blocking: ${JSON.stringify({
        status: identityProductionEvidence.status,
        releaseGate: identityProductionEvidence.releaseGate
      })}.`);
    }
    if (submissionMatrix.summary?.rows !== 0 || submissionMatrix.summary?.blockingRows !== 0) {
      throw new Error(`Self-managed identity submission matrix should have no institution-submission rows: ${JSON.stringify(submissionMatrix.summary)}.`);
    }
  } else {
    if (!Number.isFinite(submissionMatrix.summary?.rows) || submissionMatrix.summary.rows < 4) {
      throw new Error(`Identity submission matrix has invalid submissionMatrix.rows: ${JSON.stringify(submissionMatrix.summary)}.`);
    }
    [
      ["institution-idp-owner", "institution-idp-approval", "idp-tenant-approval", "platform-acceptance"],
      ["institution-idp-owner", "institution-idp-approval", "sso-secret-rotation", "platform-acceptance"],
      ["institution-provisioning-owner", "institution-provisioning-owner", "scim-or-idp-ownership", "platform-acceptance"],
      ["institution-provisioning-owner", "institution-provisioning-owner", "identity-lifecycle-owner-mode", "technical-readiness"]
    ].forEach(([laneId, decisionId, evidenceId, evidenceSource]) => {
      const row = submissionMatrix.rows?.find((candidate) =>
        candidate.laneId === laneId &&
        candidate.decisionId === decisionId &&
        candidate.evidenceId === evidenceId &&
        candidate.evidenceSource === evidenceSource
      );
      if (!row) {
        throw new Error(`Identity submission matrix missing ${laneId}/${decisionId}/${evidenceId}/${evidenceSource}: ${JSON.stringify(submissionMatrix.rows)}.`);
      }
      if (!Array.isArray(row.responseAuditHeaders) || !row.responseAuditHeaders.includes("x-sena-identity-production-status")) {
        throw new Error(`Identity submission matrix row is missing response audit headers: ${JSON.stringify(row)}.`);
      }
      if (!Array.isArray(row.receiptArchiveBodyPaths) || !row.receiptArchiveBodyPaths.includes("identityProductionEvidence.institutionActionPlan")) {
        throw new Error(`Identity submission matrix row is missing receipt archive body paths: ${JSON.stringify(row)}.`);
      }
    });
  }
  const ownerRunbooks = identityProductionEvidence.institutionActionPlan?.ownerRunbooks;
  if (ownerRunbooks?.schemaVersion !== "sena-enterprise-identity-owner-runbook/v1") {
    throw new Error(`Identity production evidence is missing sena-enterprise-identity-owner-runbook/v1: ${JSON.stringify(identityProductionEvidence.institutionActionPlan)}.`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(ownerRunbooks.digest ?? ""))) {
    throw new Error(`Identity owner runbook is missing ownerRunbooks.digest: ${JSON.stringify(ownerRunbooks)}.`);
  }
  if (requireHeaderValue(platformDecision.headers, "x-sena-identity-owner-runbook-digest") !== ownerRunbooks.digest) {
    throw new Error(`Identity owner runbook digest header/body mismatch: ${platformDecision.headers["x-sena-identity-owner-runbook-digest"]} vs ${ownerRunbooks.digest}.`);
  }
  [
    ["x-sena-identity-owner-runbook-blocking", ownerRunbooks.summary.blockingRunbooks],
    ["x-sena-identity-owner-runbook-preflight-checks", ownerRunbooks.summary.preflightChecks],
    ["x-sena-identity-owner-runbook-submission-steps", ownerRunbooks.summary.submissionSteps],
    ["x-sena-identity-owner-runbook-receipt-archive-steps", ownerRunbooks.summary.receiptArchiveSteps]
  ].forEach(([headerName, expected]) => {
    const headerValue = requireHeaderValue(platformDecision.headers, headerName);
    if (headerValue !== String(expected)) {
      throw new Error(`Identity owner runbook ${headerName} header/body mismatch: ${headerValue} vs ${expected}.`);
    }
  });
  if (!Number.isFinite(ownerRunbooks.summary?.lanes) || ownerRunbooks.summary.lanes < 2) {
    throw new Error(`Identity owner runbook has invalid ownerRunbooks.runbooks summary: ${JSON.stringify(ownerRunbooks.summary)}.`);
  }
  [
    ["institution-idp-owner", "Institution IdP owner", "idp-tenant-technical-binding", "SENA_SSO_INSTITUTION_TENANT_ID", "institution-idp-approval"],
    ["institution-provisioning-owner", "Institution provisioning owner", "scim-lifecycle-owner-mode", "SENA_IDENTITY_LIFECYCLE_OWNER_MODE", "institution-provisioning-owner"]
  ].forEach(([laneId, ownerRole, preflightId, envVar, decisionId]) => {
    const runbook = ownerRunbooks.runbooks?.find((candidate) => candidate.laneId === laneId);
    if (!runbook) {
      throw new Error(`Identity ownerRunbooks.runbooks missing ${laneId}: ${JSON.stringify(ownerRunbooks.runbooks)}.`);
    }
    if (runbook.ownerRole !== ownerRole) {
      throw new Error(`Identity owner runbook has unexpected ownerRole for ${laneId}: ${JSON.stringify(runbook)}.`);
    }
    const preflight = runbook.preflightChecks?.find((candidate) => candidate.id === preflightId);
    if (!preflight || !preflight.envVars?.includes(envVar)) {
      throw new Error(`Identity owner runbook missing ${preflightId}/${envVar}: ${JSON.stringify(runbook.preflightChecks)}.`);
    }
    const submissionStep = runbook.submissionSteps?.find((candidate) => candidate.decisionId === decisionId);
    if (!submissionStep || submissionStep.path !== "/api/sena/ops/platform-decisions" || !submissionStep.responseAuditHeaders?.includes("x-sena-identity-production-status")) {
      throw new Error(`Identity owner runbook missing submission step for ${decisionId}: ${JSON.stringify(runbook.submissionSteps)}.`);
    }
    const archiveStep = runbook.receiptArchiveSteps?.find((candidate) => candidate.decisionId === decisionId);
    if (!archiveStep || !archiveStep.requiredBodyPaths?.includes("identityProductionEvidence.institutionActionPlan")) {
      throw new Error(`Identity owner runbook missing receipt archive step for ${decisionId}: ${JSON.stringify(runbook.receiptArchiveSteps)}.`);
    }
  });

  const importResult = evidence.importResult;
  if (importResult?.status !== 201) {
    throw new Error(`Enterprise import returned HTTP ${importResult?.status ?? "<missing>"}: ${JSON.stringify(importResult?.body)}.`);
  }
  if (importResult.body?.schemaVersion !== "sena-enterprise-import/v1") {
    throw new Error(`Enterprise import returned unexpected schema ${importResult.body?.schemaVersion ?? "<missing>"}.`);
  }
  const importRun = importResult.body?.importRun;
  const cleaningSummary = importResult.body?.cleaningManifest?.summary;
  if (
    importRun?.status !== "completed" ||
    importRun?.warningCount !== expectedImportWarnings.length ||
    JSON.stringify(importRun?.warningsPreview) !== JSON.stringify(expectedImportWarnings) ||
    cleaningSummary?.warningCount !== expectedImportWarnings.length ||
    cleaningSummary?.duplicateRowCount !== 0 ||
    cleaningSummary?.derivedPlaceholderCount !== 0 ||
    cleaningSummary?.skippedRowCount !== 0 ||
    cleaningSummary?.missingTableWarningCount !== 0
  ) {
    throw new Error(`Enterprise import did not complete without unexpected cleaning warnings: ${JSON.stringify({ importRun, cleaningSummary })}.`);
  }
  assertArrayIncludes(importResult.body?.cleaningManifest?.summary?.adapterProfiles, "sena-contract", "import cleaning adapter profiles");
  assertArrayIncludes(importResult.body?.cleaningManifest?.summary?.adapterProfiles, "cleaned-transcript", "import cleaning adapter profiles");
  const importRunId = requireHeaderValue(importResult.headers, "x-sena-import-run-id");
  const projectId = requireHeaderValue(importResult.headers, "x-sena-project-id");
  const analysisRunId = requireHeaderValue(importResult.headers, "x-sena-analysis-run-id");
  const importProfiles = requireHeaderValue(importResult.headers, "x-sena-import-profiles");
  if (!importProfiles.includes("sena-contract") || !importProfiles.includes("cleaned-transcript")) {
    throw new Error(`Expected x-sena-import-profiles to include sena-contract and cleaned-transcript, received ${importProfiles}.`);
  }
  if (importResult.body?.importRun?.id !== importRunId) {
    throw new Error(`Import run id header/body mismatch: ${importRunId} vs ${importResult.body?.importRun?.id}.`);
  }
  if (importResult.body?.persistedProject?.id !== projectId) {
    throw new Error(`Project id header/body mismatch: ${projectId} vs ${importResult.body?.persistedProject?.id}.`);
  }
  if (importResult.body?.enterpriseAnalysisRun?.id !== analysisRunId) {
    throw new Error(`Analysis run id header/body mismatch: ${analysisRunId} vs ${importResult.body?.enterpriseAnalysisRun?.id}.`);
  }
  const importedDatasetCounts = {
    people: importResult.body?.dataset?.people?.length,
    interactions: importResult.body?.dataset?.interactions?.length,
    utterances: importResult.body?.dataset?.utterances?.length,
    codedSegments: importResult.body?.dataset?.coded_segments?.length,
    codes: importResult.body?.dataset?.codebook?.length
  };
  if (JSON.stringify(importedDatasetCounts) !== JSON.stringify({
    people: 4,
    interactions: 3,
    utterances: 8,
    codedSegments: 8,
    codes: 4
  })) {
    throw new Error(`Enterprise smoke fixture no longer matches its resource-bounded dataset contract: ${JSON.stringify(importedDatasetCounts)}.`);
  }

  const importedProjectVersion = importResult.body?.persistedProject?.currentVersion;
  if (!Number.isInteger(importedProjectVersion)) {
    throw new Error(`Enterprise import did not expose an integer project version: ${JSON.stringify(importResult.body?.persistedProject)}.`);
  }
  const analysisRefresh = evidence.analysisRefresh;
  if (analysisRefresh?.status !== 200 || analysisRefresh.body?.schemaVersion !== "sena-analysis-run/v1") {
    throw new Error(`Enterprise analysis refresh did not produce a current analysis run: ${JSON.stringify(analysisRefresh)}.`);
  }
  const authoritativeProjectVersion = analysisRefresh.body?.persistedProject?.currentVersion;
  if (
    analysisRefresh.body?.persistedProject?.id !== projectId ||
    authoritativeProjectVersion !== importedProjectVersion + 1 ||
    analysisRefresh.body?.projectSnapshot?.report?.humanReview?.status !== "human-reviewed" ||
    analysisRefresh.body?.persistedProject?.snapshot?.report?.humanReview?.status !== "human-reviewed" ||
    analysisRefresh.body?.persistedProject?.snapshot?.report?.dataGovernance?.status !== "complete"
  ) {
    throw new Error(`Enterprise analysis refresh did not atomically persist the reviewed project revision: ${JSON.stringify(analysisRefresh.body?.persistedProject)}.`);
  }
  const refreshedAnalysisRunId = requireHeaderValue(analysisRefresh.headers, "x-sena-analysis-run-id");
  if (
    analysisRefresh.body?.enterpriseAnalysisRun?.id !== refreshedAnalysisRunId ||
    requireHeaderValue(analysisRefresh.headers, "x-sena-project-id") !== projectId ||
    requireHeaderValue(analysisRefresh.headers, "x-sena-project-version") !== String(authoritativeProjectVersion)
  ) {
    throw new Error(`Enterprise analysis refresh headers are not bound to the persisted project revision: ${JSON.stringify(analysisRefresh.headers)}.`);
  }

  const publicationBlocked = evidence.publicationBlocked;
  if (publicationBlocked?.status !== 409 || publicationBlocked.body?.code !== "publication_claim_evidence_not_ready") {
    throw new Error(`Publication export without claim-ready evidence should return 409: ${JSON.stringify(publicationBlocked)}.`);
  }
  if (publicationBlocked.headers?.["x-sena-observed-status-class"] !== "4xx") {
    throw new Error(`Blocked publication export did not expose observed 4xx evidence: ${JSON.stringify(publicationBlocked.headers)}.`);
  }

  const reliability = evidence.reliability;
  if (reliability?.status !== 200 || reliability.body?.schemaVersion !== "sena-reliability-response/v1") {
    throw new Error(`Enterprise reliability run returned invalid current-v2 evidence: ${JSON.stringify(reliability)}.`);
  }
  if (reliability.body?.dashboard?.schemaVersion !== "sena-coding-reliability-dashboard/v2" ||
    reliability.body?.dashboard?.claimEligibility?.eligible !== true) {
    throw new Error(`Enterprise reliability dashboard is not current-v2 claim-eligible evidence: ${JSON.stringify(reliability.body?.dashboard)}.`);
  }
  const reliabilityRunId = requireHeaderValue(reliability.headers, "x-sena-reliability-run-id");
  if (reliability.body?.reliabilityRun?.id !== reliabilityRunId ||
    reliability.body?.reliabilityRun?.projectId !== projectId ||
    reliability.body?.reliabilityRun?.projectBinding?.projectId !== projectId ||
    reliability.body?.reliabilityRun?.projectBinding?.projectVersion !== authoritativeProjectVersion) {
    throw new Error(`Enterprise reliability evidence is not bound to the reviewed current project revision: ${JSON.stringify(reliability.body?.reliabilityRun)}.`);
  }

  const reliabilityApproval = evidence.reliabilityApproval;
  if (
    reliabilityApproval?.status !== 200 ||
    reliabilityApproval.body?.schemaVersion !== "sena-reliability-run-review/v1" ||
    reliabilityApproval.body?.reliabilityRun?.id !== reliabilityRunId ||
    reliabilityApproval.body?.reliabilityRun?.status !== "approved"
  ) {
    throw new Error(`Enterprise reliability run was not explicitly approved before publication: ${JSON.stringify(reliabilityApproval)}.`);
  }
  if (
    requireHeaderValue(reliabilityApproval.headers, "x-sena-reliability-status") !== "approved" ||
    requireHeaderValue(reliabilityApproval.headers, "x-sena-unresolved-disagreements") !== "0" ||
    requireHeaderValue(reliabilityApproval.headers, "x-sena-reliability-coverage-rate") !== "1"
  ) {
    throw new Error(`Enterprise reliability approval is missing complete adjudication coverage: ${JSON.stringify(reliabilityApproval.headers)}.`);
  }

  const validation = evidence.validation;
  if (
    validation?.status !== 200 ||
    validation.body?.schemaVersion !== "sena-group-comparison-suite/v2" ||
    validation.body?.comparisonCount !== 3 ||
    validation.body?.correction !== "holm"
  ) {
    throw new Error(`Enterprise validation suite did not produce Holm-corrected evidence: ${JSON.stringify(validation)}.`);
  }
  const validationRunId = requireHeaderValue(validation.headers, "x-sena-validation-run-id");
  if (
    requireHeaderValue(validation.headers, "x-sena-project-id") !== projectId ||
    requireHeaderValue(validation.headers, "x-sena-validation-status") !== "pending-review" ||
    requireHeaderValue(validation.headers, "x-sena-validation-parity-status") !== "ready-for-review" ||
    requireHeaderValue(validation.headers, "x-sena-formal-inference-status") !== "model-referenced"
  ) {
    throw new Error(`Enterprise validation suite is missing project, parity, or formal-model bindings: ${JSON.stringify(validation.headers)}.`);
  }
  requireHeaderValue(validation.headers, "x-sena-validation-preregistration-sha256");

  const validationApproval = evidence.validationApproval;
  if (
    validationApproval?.status !== 200 ||
    validationApproval.body?.schemaVersion !== "sena-validation-run-review/v1" ||
    requireHeaderValue(validationApproval.headers, "x-sena-validation-status") !== "approved"
  ) {
    throw new Error(`Enterprise validation suite was not explicitly approved: ${JSON.stringify(validationApproval)}.`);
  }

  const expertReview = evidence.expertReview;
  if (expertReview?.status !== 200 || expertReview.body?.schemaVersion !== "sena-expert-review-response/v1") {
    throw new Error(`Enterprise expert review creation failed: ${JSON.stringify(expertReview)}.`);
  }
  const expertReviewId = requireHeaderValue(expertReview.headers, "x-sena-expert-review-id");
  if (
    requireHeaderValue(expertReview.headers, "x-sena-expert-review-target-id") !== validationRunId ||
    requireHeaderValue(expertReview.headers, "x-sena-expert-review-claim-scope") !== "exploratory-only"
  ) {
    throw new Error(`Enterprise expert review is not bound to the validation run: ${JSON.stringify(expertReview.headers)}.`);
  }

  const expertReviewApproval = evidence.expertReviewApproval;
  if (
    expertReviewApproval?.status !== 200 ||
    expertReviewApproval.body?.schemaVersion !== "sena-expert-review-response/v1" ||
    requireHeaderValue(expertReviewApproval.headers, "x-sena-expert-review-status") !== "approved" ||
    requireHeaderValue(expertReviewApproval.headers, "x-sena-expert-review-claim-scope") !== "claim-ready-with-limits" ||
    requireHeaderValue(expertReviewApproval.headers, "x-sena-expert-review-receipt-present") !== "true"
  ) {
    throw new Error(`Enterprise expert review is not approved with receipt-authenticated limited scope: ${JSON.stringify(expertReviewApproval)}.`);
  }
  if (
    requireHeaderValue(expertReviewApproval.headers, "x-sena-expert-review-receipt-key-id") !== expectedReceiptKeyId ||
    expertReviewApproval.body?.expertReview?.evidenceReceipt?.keyId !== expectedReceiptKeyId
  ) {
    throw new Error("Enterprise expert approval receipt was not signed by this verifier run's exact ephemeral key id.");
  }
  requireHeaderValue(expertReviewApproval.headers, "x-sena-expert-review-receipt-sha256");

  const claimPackage = evidence.claimPackage;
  if (
    claimPackage?.status !== 200 ||
    claimPackage.body?.schemaVersion !== "sena-enterprise-claim-evidence-package/v2" ||
    claimPackage.body?.status !== "exploratory-only" ||
    claimPackage.body?.summary?.blockers !== 1 ||
    JSON.stringify(claimPackage.body?.blockers) !== JSON.stringify(["project-claim-readiness-required"]) ||
    claimPackage.body?.claimReadinessEvidence?.kind !== "persisted-project-snapshot" ||
    requireHeaderValue(claimPackage.headers, "x-sena-claim-package-status") !== "exploratory-only" ||
    requireHeaderValue(claimPackage.headers, "x-sena-project-id") !== projectId
  ) {
    throw new Error(`Persisted enterprise claim package did not preserve its single derivable readiness blocker: ${JSON.stringify(claimPackage)}.`);
  }
  const readProjectionSnapshotSha256 = requireSha256(
    claimPackage.body?.sourceSnapshotEvidence?.readProjectionSnapshotSha256,
    "Persisted claim package read-projection snapshot SHA-256"
  );
  const persistedSnapshotSha256 = requireSha256(
    claimPackage.body?.sourceSnapshotEvidence?.persistedSnapshotSha256,
    "Persisted claim package raw persisted snapshot SHA-256"
  );
  const claimStateRevisionSha256 = requireSha256(
    claimPackage.body?.sourceSnapshotEvidence?.stateRevisionSha256,
    "Persisted claim package state revision SHA-256"
  );
  const claimReportSha256 = requireSha256(
    claimPackage.body?.sourceSnapshotEvidence?.reportSha256,
    "Persisted claim package report SHA-256"
  );
  if (
    claimPackage.body?.sourceSnapshotEvidence?.snapshotSha256 !== readProjectionSnapshotSha256 ||
    requireHeaderValue(claimPackage.headers, "x-sena-source-snapshot-sha256") !== readProjectionSnapshotSha256
  ) {
    throw new Error("Persisted claim package did not identify its source snapshot as the read projection.");
  }
  if (
    claimPackage.body?.evidence?.reliability?.runId !== reliabilityRunId ||
    claimPackage.body?.evidence?.validation?.runId !== validationRunId ||
    claimPackage.body?.evidence?.validation?.suiteCorrection !== "holm" ||
    claimPackage.body?.evidence?.expertReview?.reviewId !== expertReviewId ||
    claimPackage.body?.evidence?.expertReview?.claimScope !== "claim-ready-with-limits" ||
    claimPackage.body?.evidence?.expertReview?.evidenceReceipt?.keyId !== expectedReceiptKeyId
  ) {
    throw new Error(`Enterprise claim package does not bind the approved evidence set: ${JSON.stringify(claimPackage.body?.evidence)}.`);
  }
  if (
    requireHeaderValue(claimPackage.headers, "x-sena-project-version") !== String(authoritativeProjectVersion) ||
    requireHeaderValue(claimPackage.headers, "x-sena-persisted-source-snapshot-sha256") !== persistedSnapshotSha256 ||
    requireHeaderValue(claimPackage.headers, "x-sena-claim-state-revision-sha256") !== claimStateRevisionSha256 ||
    requireHeaderValue(claimPackage.headers, "x-sena-report-sha256") !== claimReportSha256
  ) {
    throw new Error(`Persisted claim package headers are not atomically bound to its current project revision: ${JSON.stringify(claimPackage.headers)}.`);
  }
  const claimArtifactIds = claimPackage.body?.artifacts?.map((artifact) => artifact.id) ?? [];
  for (const expectedArtifact of [
    "reliability-dashboard",
    "validation-preregistration-plan",
    "validation-parity-evidence",
    "formal-inference-readiness",
    "domain-expert-review"
  ]) {
    assertArrayIncludes(claimArtifactIds, expectedArtifact, "claim package artifact ids");
  }

  const projectBeforePublication = evidence.projectBeforePublication;
  if (
    projectBeforePublication?.status !== 200 ||
    projectBeforePublication.body?.schemaVersion !== "sena-project/v1" ||
    projectBeforePublication.body?.project?.id !== projectId ||
    projectBeforePublication.body?.project?.currentVersion !== authoritativeProjectVersion ||
    JSON.stringify(projectBeforePublication.body?.project?.snapshot) !== JSON.stringify(analysisRefresh.body?.persistedProject?.snapshot) ||
    requireHeaderValue(projectBeforePublication.headers, "x-sena-project-id") !== projectId ||
    requireHeaderValue(projectBeforePublication.headers, "x-sena-project-version") !== String(authoritativeProjectVersion)
  ) {
    throw new Error(`Pre-publication project round trip is not bound to the authoritative persisted revision: ${JSON.stringify(projectBeforePublication)}.`);
  }
  const readProjectionProjectSnapshotSha256 = requireSha256(
    requireHeaderValue(projectBeforePublication.headers, "x-sena-project-snapshot-sha256"),
    "Pre-publication project read-projection snapshot SHA-256"
  );
  if (
    readProjectionProjectSnapshotSha256 !== readProjectionSnapshotSha256 ||
    sha256Json(projectBeforePublication.body.project.snapshot) !== readProjectionProjectSnapshotSha256
  ) {
    throw new Error("The project round-trip snapshot hash is not bound to the claim package read projection.");
  }

  const publication = evidence.publication;
  if (publication?.status !== 200) {
    throw new Error(`Publication package export returned HTTP ${publication?.status ?? "<missing>"}: ${JSON.stringify(publication?.body)}.`);
  }
  if (publication.body?.schemaVersion !== "sena-publication-package/v1") {
    throw new Error(`Publication package returned unexpected schema ${publication.body?.schemaVersion ?? "<missing>"}.`);
  }
  if (publication.body?.enterpriseProjectEvidence?.projectId !== projectId) {
    throw new Error(`Publication package did not use the imported persisted project ${projectId}.`);
  }
  if (publication.body?.enterpriseProjectEvidence?.claimPackage?.status !== "claim-ready-with-limits") {
    throw new Error(`Publication package is missing claim-ready enterprise evidence: ${JSON.stringify(publication.body?.enterpriseProjectEvidence?.claimPackage)}.`);
  }
  if (
    publication.body?.enterpriseProjectEvidence?.claimPackage?.payload?.claimReadinessEvidence?.kind !== "current-project-reliability-run" ||
    publication.body?.enterpriseProjectEvidence?.claimPackage?.payload?.summary?.blockers !== 0 ||
    publication.body?.enterpriseProjectEvidence?.claimPackage?.payload?.blockers?.length !== 0
  ) {
    throw new Error(`Publication package did not use a blocker-free non-persisted current-v2 claim projection: ${JSON.stringify(publication.body?.enterpriseProjectEvidence?.claimPackage?.payload?.claimReadinessEvidence)}.`);
  }
  if (publication.body?.sourceSnapshotEvidence?.snapshotSchemaVersion !== "sena-project-snapshot/v1") {
    throw new Error(`Publication package is missing project snapshot evidence: ${JSON.stringify(publication.body?.sourceSnapshotEvidence)}.`);
  }
  const derivation = publication.body?.enterpriseProjectEvidence?.publicationDerivation;
  if (derivation?.kind !== "current-project-reliability-run" ||
    derivation?.reliabilityRunId !== reliabilityRunId ||
    derivation?.reliabilityDashboardSchemaVersion !== "sena-coding-reliability-dashboard/v2" ||
    derivation?.projectVersion !== authoritativeProjectVersion) {
    throw new Error(`Publication package is missing its current-v2 reliability derivation: ${JSON.stringify(derivation)}.`);
  }
  if (publication.body?.claimEvidence?.codingReliability !== "ready") {
    throw new Error(`Publication package coding reliability gate is not ready: ${JSON.stringify(publication.body?.claimEvidence)}.`);
  }
  const enterpriseProjectEvidence = publication.body?.enterpriseProjectEvidence;
  const stateBinding = enterpriseProjectEvidence?.stateBinding;
  const derivationManifest = publication.body?.derivationManifest;
  const derivedPublicationSnapshotSha256 = requireSha256(
    publication.body?.sourceSnapshotEvidence?.snapshotSha256,
    "Derived publication snapshot SHA-256"
  );
  const derivedPublicationReportSha256 = requireSha256(
    publication.body?.sourceSnapshotEvidence?.reportSha256,
    "Derived publication report SHA-256"
  );
  if (
    stateBinding?.schemaVersion !== "sena-publication-state-binding/v2" ||
    derivationManifest?.schemaVersion !== "sena-publication-derivation-manifest/v3" ||
    enterpriseProjectEvidence?.sourceSnapshotSha256 !== derivedPublicationSnapshotSha256 ||
    derivation?.persistedSourceSnapshotSha256 !== persistedSnapshotSha256 ||
    derivation?.readProjectionSourceSnapshotSha256 !== readProjectionSnapshotSha256 ||
    derivation?.derivedPublicationSnapshotSha256 !== derivedPublicationSnapshotSha256 ||
    stateBinding?.project?.persistedSnapshotSha256 !== persistedSnapshotSha256 ||
    stateBinding?.project?.readProjectionSnapshotSha256 !== readProjectionSnapshotSha256 ||
    stateBinding?.claimPackage?.persistedSnapshotSha256 !== persistedSnapshotSha256 ||
    stateBinding?.claimPackage?.sourceSnapshotSha256 !== readProjectionSnapshotSha256 ||
    enterpriseProjectEvidence?.claimPackage?.persistedSourceSnapshotSha256 !== persistedSnapshotSha256 ||
    enterpriseProjectEvidence?.claimPackage?.sourceSnapshotSha256 !== readProjectionSnapshotSha256 ||
    derivationManifest?.hashBoundaries?.persistedSnapshotSha256 !== persistedSnapshotSha256 ||
    derivationManifest?.hashBoundaries?.readProjectionSnapshotSha256 !== readProjectionSnapshotSha256 ||
    derivationManifest?.hashBoundaries?.publicationSnapshotSha256 !== derivedPublicationSnapshotSha256 ||
    derivedPublicationSnapshotSha256 === persistedSnapshotSha256 ||
    derivedPublicationSnapshotSha256 === readProjectionSnapshotSha256
  ) {
    throw new Error(`Persisted, read-projection, and derived publication snapshot hashes are not independently bound: ${JSON.stringify({
      derivation,
      stateBinding,
      hashBoundaries: derivationManifest?.hashBoundaries
    })}.`);
  }
  // Request-scoped auth/rate-limit/audit metadata may advance the primary state
  // revision between separate GET and publication requests. Bind the publication
  // revision atomically inside its own body/header/manifest instead; the explicit
  // project and claim-package round trips below prove domain state did not change.
  const derivationManifestSha256 = requireSha256(
    derivationManifest.manifestSha256,
    "Publication derivation manifest SHA-256"
  );
  const publicationStateRevisionSha256 = requireSha256(
    stateBinding.stateRevisionSha256,
    "Publication state revision SHA-256"
  );
  const publicationStateBindingSha256 = requireSha256(
    stateBinding.bindingSha256,
    "Publication state binding SHA-256"
  );
  const expectedStateRevisionKind = stateBinding.activePrimary === "postgres"
    ? "postgres-row-revision"
    : "file-content-sha256";
  const publicationClaimPackageSha256 = requireSha256(
    enterpriseProjectEvidence.claimPackage.sha256,
    "Publication claim package SHA-256"
  );
  const validationEvidenceSha256 = requireSha256(
    stateBinding.validationRun?.validationRunEvidenceHash,
    "Publication validation evidence SHA-256"
  );
  const expertReceiptSha256 = requireSha256(
    stateBinding.expertReview?.receiptSha256,
    "Publication expert receipt SHA-256"
  );
  const derivationManifestCore = structuredClone(derivationManifest);
  delete derivationManifestCore.manifestSha256;
  const stateBindingCore = structuredClone(stateBinding);
  delete stateBindingCore.bindingSha256;
  if (
    sha256Json(derivationManifestCore) !== derivationManifestSha256 ||
    sha256Json(stateBindingCore) !== publicationStateBindingSha256 ||
    stateBinding.stateRevisionKind !== expectedStateRevisionKind ||
    sha256Json({
      activePrimary: stateBinding.activePrimary,
      stateRevision: stateBinding.stateRevision
    }) !== publicationStateRevisionSha256 ||
    enterpriseProjectEvidence.claimPackage.payload?.sourceSnapshotEvidence?.stateRevisionSha256 !==
      publicationStateRevisionSha256 ||
    sha256Json(enterpriseProjectEvidence.claimPackage.payload) !== publicationClaimPackageSha256 ||
    sha256Json(stateBinding.expertReview.receipt) !== expertReceiptSha256
  ) {
    throw new Error("Publication manifest, state binding, claim package, or expert receipt failed independent SHA-256 recomputation.");
  }
  const atomicBindingMismatches = [
    derivationManifestSha256 !== requireHeaderValue(publication.headers, "x-sena-publication-derivation-manifest-sha256")
      ? "derivation-manifest-header" : null,
    persistedSnapshotSha256 !== requireHeaderValue(publication.headers, "x-sena-persisted-source-snapshot-sha256")
      ? "persisted-snapshot-header" : null,
    readProjectionSnapshotSha256 !== requireHeaderValue(publication.headers, "x-sena-read-projection-source-snapshot-sha256")
      ? "read-projection-header" : null,
    derivedPublicationSnapshotSha256 !== requireHeaderValue(publication.headers, "x-sena-source-snapshot-sha256")
      ? "derived-snapshot-header" : null,
    publicationStateRevisionSha256 !== requireHeaderValue(publication.headers, "x-sena-publication-state-revision-sha256")
      ? "state-revision-header" : null,
    publicationStateBindingSha256 !== requireHeaderValue(publication.headers, "x-sena-publication-state-binding-sha256")
      ? "state-binding-header" : null,
    !isDeepStrictEqual(stateBinding, derivationManifest?.enterpriseProjectEvidence?.stateBinding)
      ? "manifest-state-binding" : null,
    requireHeaderValue(publication.headers, "x-sena-publication-reliability-run-id") !== reliabilityRunId
      ? "reliability-run-header" : null
  ].filter(Boolean);
  if (atomicBindingMismatches.length > 0) {
    throw new Error(`Publication response headers do not bind the derivation manifest and atomic state evidence; mismatches=${atomicBindingMismatches.join(",")}.`);
  }
  if (
    requireHeaderValue(publication.headers, "x-sena-claim-package-status") !== "claim-ready-with-limits" ||
    requireHeaderValue(publication.headers, "x-sena-validation-run-id") !== validationRunId ||
    requireHeaderValue(publication.headers, "x-sena-validation-evidence-sha256") !== validationEvidenceSha256 ||
    requireHeaderValue(publication.headers, "x-sena-expert-review-id") !== expertReviewId ||
    requireHeaderValue(publication.headers, "x-sena-expert-receipt-sha256") !== expertReceiptSha256 ||
    requireHeaderValue(publication.headers, "x-sena-expert-receipt-key-id") !== expectedReceiptKeyId ||
    stateBinding?.expertReview?.receipt?.keyId !== expectedReceiptKeyId ||
    enterpriseProjectEvidence?.claimPackage?.payload?.evidence?.expertReview?.evidenceReceipt?.keyId !== expectedReceiptKeyId
  ) {
    throw new Error(`Publication response headers do not bind the claim-ready validation and expert evidence: ${JSON.stringify(publication.headers)}.`);
  }
  if (
    requireHeaderValue(publication.headers, "x-sena-claim-package-sha256") !== publicationClaimPackageSha256 ||
    stateBinding?.claimPackage?.sha256 !== publicationClaimPackageSha256
  ) {
    throw new Error("Publication claim package SHA-256 does not match its atomic state binding.");
  }
  const artifactManifest = publication.body?.artifactManifest;
  const artifacts = publication.body?.artifacts;
  if (!Array.isArray(artifactManifest) || !Array.isArray(artifacts)) {
    throw new Error("Publication package must expose both artifactManifest and artifacts arrays.");
  }
  const publicationFormatsHeader = requireHeaderValue(publication.headers, "x-sena-publication-formats");
  const publicationArtifactCountHeader = requireHeaderValue(publication.headers, "x-sena-publication-artifact-count");
  assertExactArray(publication.body?.manifest?.formats, requiredPublicationFormats, "publication package manifest formats");
  assertExactArray(publicationFormatsHeader.split(","), requiredPublicationFormats, "x-sena-publication-formats");
  assertExactArray(artifactManifest.map((artifact) => artifact.format), requiredPublicationFormats, "publication artifact manifest formats");
  assertExactArray(artifacts.map((artifact) => artifact.format), requiredPublicationFormats, "publication artifact formats");
  if (
    new Set(publication.body.manifest.formats).size !== requiredPublicationFormats.length ||
    new Set(artifactManifest.map((artifact) => artifact.format)).size !== requiredPublicationFormats.length ||
    new Set(artifacts.map((artifact) => artifact.format)).size !== requiredPublicationFormats.length ||
    publication.body.manifest.artifactCount !== requiredPublicationFormats.length ||
    artifactManifest.length !== requiredPublicationFormats.length ||
    artifacts.length !== requiredPublicationFormats.length ||
    publicationArtifactCountHeader !== String(requiredPublicationFormats.length)
  ) {
    throw new Error("Publication package formats and artifact counts must be unique, canonical, and exactly six.");
  }
  const publicationPackageSha256 = requireSha256(
    publication.body?.manifest?.packageSha256,
    "Publication package SHA-256"
  );
  if (
    publication.body?.manifest?.hashAlgorithm !== "sha256" ||
    publication.body?.manifest?.sourceSnapshotSha256 !== derivedPublicationSnapshotSha256 ||
    publication.body?.sourceSnapshotEvidence?.snapshotSha256 !== derivedPublicationSnapshotSha256 ||
    publication.body?.verificationCertificate?.sourceSnapshotSha256 !== derivedPublicationSnapshotSha256 ||
    enterpriseProjectEvidence?.sourceSnapshotSha256 !== derivedPublicationSnapshotSha256 ||
    derivationManifest?.publicationSnapshot?.sha256 !== derivedPublicationSnapshotSha256 ||
    derivationManifest?.hashBoundaries?.publicationSnapshotSha256 !== derivedPublicationSnapshotSha256 ||
    requireHeaderValue(publication.headers, "x-sena-source-snapshot-sha256") !== derivedPublicationSnapshotSha256 ||
    publication.body?.manifest?.reportSha256 !== derivedPublicationReportSha256 ||
    publication.body?.sourceSnapshotEvidence?.reportSha256 !== derivedPublicationReportSha256 ||
    publication.body?.verificationCertificate?.reportSha256 !== derivedPublicationReportSha256 ||
    enterpriseProjectEvidence?.reportSha256 !== derivedPublicationReportSha256 ||
    enterpriseProjectEvidence?.claimPackage?.payload?.claimReadinessEvidence?.reportSha256 !== derivedPublicationReportSha256 ||
    derivationManifest?.publicationSnapshot?.reportSha256 !== derivedPublicationReportSha256 ||
    derivationManifest?.hashBoundaries?.reportSha256 !== derivedPublicationReportSha256 ||
    requireHeaderValue(publication.headers, "x-sena-report-sha256") !== derivedPublicationReportSha256
  ) {
    throw new Error("Publication package source-snapshot and report evidence are not internally self-consistent.");
  }
  if (
    requireHeaderValue(publication.headers, "x-sena-publication-package-sha256") !== publicationPackageSha256 ||
    publication.body?.manifest?.derivationManifestSha256 !== derivationManifestSha256 ||
    publication.body?.verificationCertificate?.derivationManifestSha256 !== derivationManifestSha256
  ) {
    throw new Error("Publication package headers, manifest, and verification certificate do not share one derivation/package hash boundary.");
  }
  const packageEvidence = {
    artifactManifest,
    sourceSnapshotEvidence: publication.body.sourceSnapshotEvidence,
    claimEvidence: publication.body.claimEvidence,
    figureEvidence: publication.body.figureEvidence,
    verificationCertificate: publication.body.verificationCertificate,
    enterpriseProjectEvidence,
    derivationManifest
  };
  if (sha256Json(packageEvidence) !== publicationPackageSha256) {
    throw new Error("Publication package SHA-256 failed independent recomputation over the production package-evidence scope.");
  }
  requireHeaderValue(publication.headers, "x-sena-publication-verification-status");
  if (publication.headers["x-sena-publication-verification-status"] !== "verified") {
    throw new Error(`Publication package verification status should be verified, received ${publication.headers["x-sena-publication-verification-status"]}.`);
  }
  if (publication.body?.verificationCertificate?.status !== "verified") {
    throw new Error(`Publication verification certificate should be verified: ${JSON.stringify(publication.body?.verificationCertificate)}.`);
  }
  const verificationCertificateArtifactChecks = artifactManifest.map((artifact) => ({
    filename: artifact.filename,
    format: artifact.format,
    contentType: artifact.contentType,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    status: "verified"
  }));
  assertExactArray(
    publication.body?.verificationCertificate?.artifactChecks,
    verificationCertificateArtifactChecks,
    "publication verification certificate artifact checks"
  );
  for (let index = 0; index < requiredPublicationFormats.length; index += 1) {
    const format = requiredPublicationFormats[index];
    const artifact = artifacts[index];
    const manifestArtifact = artifactManifest[index];
    const artifactSha256 = requireSha256(artifact?.sha256, `Publication ${format} artifact SHA-256`);
    const artifactBodyBase64 = artifact?.bodyBase64;
    const artifactBytes = typeof artifactBodyBase64 === "string"
      ? Buffer.from(artifactBodyBase64, "base64")
      : Buffer.alloc(0);
    const artifactEvidence = {
      format: artifact?.format,
      filename: artifact?.filename,
      contentType: artifact?.contentType,
      bytes: artifact?.bytes,
      sha256: artifact?.sha256,
      derivationManifestSha256: artifact?.derivationManifestSha256
    };
    if (
      !artifact ||
      artifact.bytes <= 0 ||
      artifact.derivationManifestSha256 !== derivationManifestSha256 ||
      typeof artifactBodyBase64 !== "string" ||
      artifactBytes.toString("base64") !== artifactBodyBase64 ||
      artifactBytes.byteLength !== artifact.bytes ||
      sha256Bytes(artifactBytes) !== artifactSha256 ||
      JSON.stringify(artifactEvidence) !== JSON.stringify(manifestArtifact)
    ) {
      throw new Error(`Publication package has invalid ${format} artifact custody evidence.`);
    }
  }

  const projectAfterPublication = evidence.projectAfterPublication;
  if (
    projectAfterPublication?.status !== 200 ||
    projectAfterPublication.body?.schemaVersion !== "sena-project/v1" ||
    requireHeaderValue(projectAfterPublication.headers, "x-sena-project-id") !== projectId ||
    requireHeaderValue(projectAfterPublication.headers, "x-sena-project-version") !== String(authoritativeProjectVersion) ||
    requireHeaderValue(projectAfterPublication.headers, "x-sena-project-snapshot-sha256") !== readProjectionProjectSnapshotSha256 ||
    JSON.stringify(projectAfterPublication.body?.project) !== JSON.stringify(projectBeforePublication.body?.project)
  ) {
    throw new Error(`Publication changed the persisted project, version, revision history, or snapshot: ${JSON.stringify({
      before: projectBeforePublication,
      after: projectAfterPublication
    })}.`);
  }

  const claimPackageAfterPublication = evidence.claimPackageAfterPublication;
  const postpublicationStateRevisionSha256 = requireSha256(
    claimPackageAfterPublication?.body?.sourceSnapshotEvidence?.stateRevisionSha256,
    "Post-publication claim state revision SHA-256"
  );
  if (
    claimPackageAfterPublication?.status !== 200 ||
    claimPackageAfterPublication.body?.schemaVersion !== "sena-enterprise-claim-evidence-package/v2" ||
    claimPackageAfterPublication.body?.status !== "exploratory-only" ||
    claimPackageAfterPublication.body?.project?.currentVersion !== authoritativeProjectVersion ||
    claimPackageAfterPublication.body?.claimReadinessEvidence?.kind !== "persisted-project-snapshot" ||
    JSON.stringify(claimPackageAfterPublication.body?.blockers) !== JSON.stringify(["project-claim-readiness-required"]) ||
    claimPackageAfterPublication.body?.summary?.blockers !== 1 ||
    claimPackageAfterPublication.body?.evidence?.expertReview?.evidenceReceipt?.keyId !== expectedReceiptKeyId ||
    JSON.stringify(stablePersistedClaimPackage(claimPackageAfterPublication.body)) !==
      JSON.stringify(stablePersistedClaimPackage(claimPackage.body))
  ) {
    throw new Error(`Publication persisted or replaced the derived current-v2 claim projection: ${JSON.stringify({
      before: claimPackage.body,
      after: claimPackageAfterPublication?.body
    })}.`);
  }
  if (
    requireHeaderValue(claimPackageAfterPublication.headers, "x-sena-claim-package-status") !== "exploratory-only" ||
    requireHeaderValue(claimPackageAfterPublication.headers, "x-sena-project-id") !== projectId ||
    requireHeaderValue(claimPackageAfterPublication.headers, "x-sena-project-version") !== String(authoritativeProjectVersion) ||
    requireHeaderValue(claimPackageAfterPublication.headers, "x-sena-source-snapshot-sha256") !== readProjectionSnapshotSha256 ||
    requireHeaderValue(claimPackageAfterPublication.headers, "x-sena-persisted-source-snapshot-sha256") !== persistedSnapshotSha256 ||
    requireHeaderValue(claimPackageAfterPublication.headers, "x-sena-claim-state-revision-sha256") !== postpublicationStateRevisionSha256 ||
    requireHeaderValue(claimPackageAfterPublication.headers, "x-sena-report-sha256") !== claimReportSha256
  ) {
    throw new Error(`Post-publication claim package headers are not bound to the unchanged persisted projection: ${JSON.stringify(claimPackageAfterPublication?.headers)}.`);
  }
}

export async function verifySenaEnterpriseApiBrowserSmoke(baseUrl = enterpriseSmokeOriginFromCli(), options = {}) {
  const expectedReceiptKeyId = requireExpectedReceiptKeyId(options);
  const origin = requireVerifierControlledLoopbackOrigin(baseUrl);
  const provisioningToken = options.provisioningToken ??
    process.env.SENA_ENTERPRISE_API_BROWSER_SMOKE_PROVISIONING_TOKEN ??
    process.env.SENA_PROVISIONING_TOKEN ??
    "sena-pilot-provisioning-token";
  requireVerifierControlledServerCustody(options, origin, expectedReceiptKeyId, provisioningToken);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const session = await registerSmokeSession(page, origin);
    const evidence = await fetchEnterpriseWorkflow(page, session.teamId, provisioningToken);
    assertEnterpriseWorkflowEvidence(evidence, expectedReceiptKeyId);
    console.log(`Enterprise API browser smoke passed for identity platform decision, import, missing-evidence 409, current-v2 reliability approval, sealed validation, exact-key expert receipt, persisted claim round trip, and non-persisted publication package 200 on ${origin}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaEnterpriseApiBrowserSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : "Enterprise API browser smoke failed.");
    process.exit(1);
  });
}
