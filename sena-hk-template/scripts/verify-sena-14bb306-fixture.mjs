import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPROVED_TEMP_ROOT = path.join(PACKAGE_ROOT, ".tmp/codex-pr-a-round5");
const DEFAULT_FIXTURE_PATH = path.join(
  PACKAGE_ROOT,
  "lib/sena/__tests__/fixtures/sena-review-packet-14bb306.json.br.b64"
);
const DEFAULT_PROVENANCE_PATH = path.join(
  PACKAGE_ROOT,
  "lib/sena/__tests__/fixtures/sena-review-packet-14bb306.provenance.json"
);

const TRUSTED_BASE_COMMIT = "14bb3067adc7df6c985785d57d62a54761839555";
const TRUSTED_PAYLOAD_SHA256 = "e43c07b81f7d6bd409d9d1c4fcc1ce26dfd6d3cb84be4b5c5ff61c87fddae6c9";
const TRUSTED_PAYLOAD_UTF8_BYTES = 2_450_487;
const TRUSTED_PAYLOAD_JSON_CHARACTERS = 2_431_543;
const TRUSTED_DATASET_SHA256 = "ca12ef432ced9635f1d415cc7488e699ca437f7a32dc55d11663ba0c901ce8c9";
const TRUSTED_OPTIONS_SHA256 = "47376030ccb3a495df69c370aec11f67266179958b4a5202733cb851e316479b";
const TRUSTED_PACKAGE_LOCK_SHA256 = "832a49ed5e719d5a9b55b5e7567d81d56203f96bac4ffee6739b1ee7bdb68666";
const FIXED_TIME = "2026-08-21T00:00:00.000Z";
const BUILD_OPTIONS = {
  alpha: 1,
  beta: 1,
  gamma: 1,
  normalization: "max",
  bridgeWeightRule: "count",
  direction: "directed",
  deg_convention: "row-sum",
  delta: "shortest_path_reciprocal_weight",
  Phi: "classical_mds",
  d: 2,
  seed: 0,
  undirectedSocial: false,
  temporal: {
    mode: "stage",
    movingWindowSize: 3,
    movingWindowStep: 1,
    turnWindowRadius: 1
  }
};

const TRUSTED_PROVENANCE = {
  schemaVersion: "sena-historical-fixture-provenance/v1",
  fixture: {
    path: "lib/sena/__tests__/fixtures/sena-review-packet-14bb306.json.br.b64",
    encoding: "brotli+base64",
    payloadSha256: TRUSTED_PAYLOAD_SHA256,
    utf8Bytes: TRUSTED_PAYLOAD_UTF8_BYTES,
    jsonCharacters: TRUSTED_PAYLOAD_JSON_CHARACTERS
  },
  source: {
    baseCommit: TRUSTED_BASE_COMMIT,
    repositorySubdirectory: "sena-hk-template",
    dataset: {
      modulePath: "lib/sena/pilot-assets.ts",
      exportName: "lessonStudySenaContract",
      canonicalSerialization: "JSON.stringify",
      sha256: TRUSTED_DATASET_SHA256,
      utf8Bytes: 8_989,
      recordCounts: {
        people: 4,
        interactions: 8,
        utterances: 10,
        coded_segments: 10,
        codebook: 7
      }
    },
    buildOptions: {
      canonicalSerialization: "JSON.stringify",
      sha256: TRUSTED_OPTIONS_SHA256,
      utf8Bytes: 324,
      value: BUILD_OPTIONS
    }
  },
  generation: {
    generatedAt: FIXED_TIME,
    command: "npm run sena:fixture:verify",
    nodeVersion: "v24.15.0",
    v8Version: "13.6.233.17-node.48",
    brotliVersion: "1.2.0",
    platform: "darwin",
    architecture: "arm64",
    packageLock: {
      path: "package-lock.json",
      sha256: TRUSTED_PACKAGE_LOCK_SHA256,
      utf8Bytes: 336_460
    },
    packages: {
      "jena-js": "0.6.2",
      "sna.js": "0.4.0",
      vite: "8.1.4",
      vitest: "4.1.10",
      typescript: "5.9.3"
    }
  }
};

const TRUSTED_HEADER =
  `# SENA historical fixture; baseCommit=${TRUSTED_BASE_COMMIT}; generatedAt=${FIXED_TIME}; ` +
  `payloadSha256=${TRUSTED_PAYLOAD_SHA256}; utf8Bytes=${TRUSTED_PAYLOAD_UTF8_BYTES}; ` +
  `jsonCharacters=${TRUSTED_PAYLOAD_JSON_CHARACTERS}`;

function fail(message) {
  throw new Error(`Historical fixture provenance verification failed: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(argv) {
  const options = {
    fixturePath: DEFAULT_FIXTURE_PATH,
    provenancePath: DEFAULT_PROVENANCE_PATH,
    skipRebuild: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--skip-rebuild") {
      options.skipRebuild = true;
      continue;
    }
    if (argument === "--fixture" || argument === "--provenance") {
      const value = argv[index + 1];
      if (!value) fail(`${argument} requires a path.`);
      if (argument === "--fixture") options.fixturePath = path.resolve(PACKAGE_ROOT, value);
      else options.provenancePath = path.resolve(PACKAGE_ROOT, value);
      index += 1;
      continue;
    }
    fail(`unknown argument ${argument}.`);
  }
  return options;
}

function canonicalJson(value) {
  return JSON.stringify(value);
}

function verifyTrustedProvenance(provenance) {
  if (canonicalJson(provenance) !== canonicalJson(TRUSTED_PROVENANCE)) {
    fail(`manifest does not match the independent trusted provenance anchor ${TRUSTED_PAYLOAD_SHA256}.`);
  }
}

function readAndVerifyCommittedArtifact(fixturePath, provenancePath) {
  if (!existsSync(fixturePath)) fail(`fixture not found at ${fixturePath}.`);
  if (!existsSync(provenancePath)) fail(`manifest not found at ${provenancePath}.`);

  let provenance;
  try {
    provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
  } catch (error) {
    fail(`manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  verifyTrustedProvenance(provenance);

  const [metadata, ...payloadLines] = readFileSync(fixturePath, "utf8").trim().split(/\r?\n/);
  if (metadata !== TRUSTED_HEADER) fail("fixture metadata does not match trusted provenance.");
  let json;
  try {
    json = brotliDecompressSync(Buffer.from(payloadLines.join(""), "base64")).toString("utf8");
    JSON.parse(json);
  } catch (error) {
    fail(`fixture payload is not valid Brotli-compressed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const digest = sha256(json);
  if (digest !== TRUSTED_PAYLOAD_SHA256) {
    fail(`fixture payload digest ${digest} does not equal trusted ${TRUSTED_PAYLOAD_SHA256}.`);
  }
  if (Buffer.byteLength(json, "utf8") !== TRUSTED_PAYLOAD_UTF8_BYTES) {
    fail(`fixture UTF-8 byte count does not equal ${TRUSTED_PAYLOAD_UTF8_BYTES}.`);
  }
  if (json.length !== TRUSTED_PAYLOAD_JSON_CHARACTERS) {
    fail(`fixture JSON character count does not equal ${TRUSTED_PAYLOAD_JSON_CHARACTERS}.`);
  }
  return { json, provenance };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PACKAGE_ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function assertDigest(label, value, expectedDigest, expectedBytes) {
  const digest = sha256(value);
  if (digest !== expectedDigest) fail(`${label} digest ${digest} does not equal trusted ${expectedDigest}.`);
  const byteCount = Buffer.byteLength(value, "utf8");
  if (byteCount !== expectedBytes) fail(`${label} UTF-8 byte count ${byteCount} does not equal ${expectedBytes}.`);
}

function reconstructFromExactBase(committedJson, provenance) {
  mkdirSync(APPROVED_TEMP_ROOT, { recursive: true });
  const runDirectory = mkdtempSync(path.join(APPROVED_TEMP_ROOT, "fixture-verifier-"));
  const runtimeTemp = path.join(runDirectory, "runtime-tmp");
  const archivePath = path.join(runDirectory, "base.tar");
  const checkoutPath = path.join(runDirectory, "checkout");
  const generatedPath = path.join(runDirectory, "generated.json");
  const datasetPath = path.join(runDirectory, "dataset.json");
  const entryPath = path.join(checkoutPath, "generate-historical-fixture.mts");
  mkdirSync(runtimeTemp, { recursive: true });
  mkdirSync(checkoutPath, { recursive: true });

  try {
    const repositoryRoot = run("git", ["rev-parse", "--show-toplevel"]);
    const repositorySubdirectory = path.relative(repositoryRoot, PACKAGE_ROOT).split(path.sep).join("/");
    if (repositorySubdirectory !== provenance.source.repositorySubdirectory) {
      fail(`package path ${repositorySubdirectory} does not match recorded source path.`);
    }
    const resolvedBase = run("git", ["rev-parse", `${TRUSTED_BASE_COMMIT}^{commit}`], {
      cwd: repositoryRoot
    });
    if (resolvedBase !== TRUSTED_BASE_COMMIT) fail(`Git resolved the historical base as ${resolvedBase}.`);
    run("git", [
      "archive",
      "--format=tar",
      `--output=${archivePath}`,
      TRUSTED_BASE_COMMIT,
      "--",
      repositorySubdirectory
    ], { cwd: repositoryRoot });
    run("tar", ["-xf", archivePath, "-C", checkoutPath, "--strip-components=1"]);

    const basePackageLock = readFileSync(path.join(checkoutPath, "package-lock.json"), "utf8");
    assertDigest(
      "exact-base package-lock",
      basePackageLock,
      TRUSTED_PACKAGE_LOCK_SHA256,
      provenance.generation.packageLock.utf8Bytes
    );
    const lock = JSON.parse(basePackageLock);
    const installedVersions = {
      "jena-js": lock.packages?.["node_modules/jena-js"]?.version,
      "sna.js": lock.packages?.["node_modules/sna.js"]?.version,
      vite: lock.packages?.["node_modules/vite"]?.version,
      vitest: lock.packages?.["node_modules/vitest"]?.version,
      typescript: lock.packages?.["node_modules/typescript"]?.version
    };
    if (canonicalJson(installedVersions) !== canonicalJson(provenance.generation.packages)) {
      fail("exact-base package versions do not match recorded runtime package versions.");
    }

    const nodeModulesPath = path.join(PACKAGE_ROOT, "node_modules");
    if (!existsSync(nodeModulesPath)) fail("current node_modules is required for read-only exact-base reconstruction.");
    symlinkSync(nodeModulesPath, path.join(checkoutPath, "node_modules"), "dir");
    const generatorSource = [
      'import { writeFileSync } from "node:fs";',
      'import { buildSenaModel } from "./lib/sena/model.ts";',
      'import { lessonStudySenaContract } from "./lib/sena/pilot-assets.ts";',
      'import { buildSenaReviewPacket } from "./lib/sena/review-packet.ts";',
      `const buildOptions = ${canonicalJson(BUILD_OPTIONS)};`,
      `const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract, buildOptions), { generatedAt: ${JSON.stringify(FIXED_TIME)} });`,
      'writeFileSync(process.env.SENA_FIXTURE_OUTPUT, JSON.stringify(packet), "utf8");',
      'writeFileSync(process.env.SENA_DATASET_OUTPUT, JSON.stringify(lessonStudySenaContract), "utf8");'
    ].join("\n");
    writeFileSync(entryPath, `${generatorSource}\n`, "utf8");
    const childEnvironment = {
      ...process.env,
      TMPDIR: runtimeTemp,
      TMP: runtimeTemp,
      TEMP: runtimeTemp,
      SENA_FIXTURE_OUTPUT: generatedPath,
      SENA_DATASET_OUTPUT: datasetPath
    };
    run(path.join(PACKAGE_ROOT, "node_modules/.bin/vite-node"), [entryPath], {
      cwd: checkoutPath,
      env: childEnvironment
    });

    const datasetJson = readFileSync(datasetPath, "utf8");
    assertDigest("exact-base input dataset", datasetJson, TRUSTED_DATASET_SHA256, 8_989);
    const dataset = JSON.parse(datasetJson);
    const recordCounts = {
      people: dataset.people?.length,
      interactions: dataset.interactions?.length,
      utterances: dataset.utterances?.length,
      coded_segments: dataset.coded_segments?.length,
      codebook: dataset.codebook?.length
    };
    if (canonicalJson(recordCounts) !== canonicalJson(provenance.source.dataset.recordCounts)) {
      fail("exact-base input dataset record counts do not match provenance.");
    }
    const optionsJson = canonicalJson(BUILD_OPTIONS);
    assertDigest("build options", optionsJson, TRUSTED_OPTIONS_SHA256, 324);

    const generatedJson = readFileSync(generatedPath, "utf8");
    assertDigest(
      "reconstructed review packet",
      generatedJson,
      TRUSTED_PAYLOAD_SHA256,
      TRUSTED_PAYLOAD_UTF8_BYTES
    );
    if (generatedJson.length !== TRUSTED_PAYLOAD_JSON_CHARACTERS) {
      fail(`reconstructed JSON character count does not equal ${TRUSTED_PAYLOAD_JSON_CHARACTERS}.`);
    }
    if (generatedJson !== committedJson) {
      fail("reconstructed exact-base JSON does not byte-match the committed historical fixture.");
    }
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  const { json, provenance } = readAndVerifyCommittedArtifact(
    options.fixturePath,
    options.provenancePath
  );
  if (!options.skipRebuild) reconstructFromExactBase(json, provenance);
  process.stdout.write(
    `SENA historical fixture verified ${TRUSTED_BASE_COMMIT} ${TRUSTED_PAYLOAD_SHA256} ` +
    `(${TRUSTED_PAYLOAD_UTF8_BYTES} UTF-8 bytes)${options.skipRebuild ? " without rebuild" : " from exact-base archive"}.\n`
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
