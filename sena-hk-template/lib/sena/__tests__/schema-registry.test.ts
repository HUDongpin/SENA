import { describe, expect, it } from "vitest";
import { buildSenaProductionPageContract } from "../production-page-contract";
import { buildSenaRuntimeBundle } from "../runtime-bundle";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaModel } from "../model";
import {
  getSenaSchemaVersion,
  isSenaSchemaVersion,
  listSenaSchemaVersions,
  SENA_SCHEMA_VERSIONS
} from "../schema-registry";

describe("SENA schema registry", () => {
  it("centralizes core v1 contract identifiers without changing emitted schemas", () => {
    expect(SENA_SCHEMA_VERSIONS.productionPageContract).toBe("sena-production-page-contract/v1");
    expect(SENA_SCHEMA_VERSIONS.runtimeBundle).toBe("sena-runtime-bundle/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseDb).toBe("sena-enterprise-db/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal).toBe("sena-enterprise-go-live-rehearsal/v1");

    expect(getSenaSchemaVersion("productionPageContract")).toBe(buildSenaProductionPageContract().schemaVersion);

    const model = buildSenaModel(lessonStudySenaContract);
    const bundle = buildSenaRuntimeBundle(model, { sourceDataset: lessonStudySenaContract });
    expect(getSenaSchemaVersion("runtimeBundle")).toBe(bundle.schemaVersion);
  });

  it("provides registry introspection and runtime validation helpers", () => {
    const versions = listSenaSchemaVersions();
    expect(versions).toContain("sena-review-packet/v1");
    expect(versions).toContain("sena-enterprise-platform-decision-register/v1");
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((schemaVersion) => /^sena-.+\/v\d+$/.test(schemaVersion))).toBe(true);

    expect(isSenaSchemaVersion("sena-runtime-bundle/v1")).toBe(true);
    expect(isSenaSchemaVersion("sena-runtime-bundle/v2")).toBe(false);
  });
});
