import pilotPackageManifestJson from "../../public/sena-pilot/sena-pilot-package-manifest.json";
import lessonStudySenaContractJson from "../../public/sena-pilot/sample/lesson-study-sena-contract.json";
import type { SenaDataset, SenaPilotPackageManifest } from "./types";

export type SenaPilotAssetLink = {
  label: string;
  href: string;
  detail: string;
};

const pilotPackageManifest = pilotPackageManifestJson as SenaPilotPackageManifest;

export const lessonStudySampleUrl = "/sena-pilot/sample/lesson-study-sena-contract.json";

export const lessonStudySenaContract = lessonStudySenaContractJson as SenaDataset;

export const senaPilotPackageManifestUrl = "/sena-pilot/sena-pilot-package-manifest.json";

export const senaPilotPackageManifestAsset: SenaPilotAssetLink = {
  label: "Package manifest",
  href: senaPilotPackageManifestUrl,
  detail: "Machine-readable inventory and expected sample counts"
};

export const senaPilotSampleCsvAssets: SenaPilotAssetLink[] = [
  {
    label: "People CSV",
    href: "/sena-pilot/sample/lesson-study-people.csv",
    detail: "Lesson-study participants"
  },
  {
    label: "Interactions CSV",
    href: "/sena-pilot/sample/lesson-study-interactions.csv",
    detail: "Lesson-study social ties"
  },
  {
    label: "Utterances CSV",
    href: "/sena-pilot/sample/lesson-study-utterances.csv",
    detail: "Lesson-study conversation stream"
  },
  {
    label: "Coded Segments CSV",
    href: "/sena-pilot/sample/lesson-study-coded_segments.csv",
    detail: "Lesson-study ENA coding rows"
  },
  {
    label: "Codebook CSV",
    href: "/sena-pilot/sample/lesson-study-codebook.csv",
    detail: "Lesson-study code definitions"
  }
];

export const senaPilotSampleAssets: SenaPilotAssetLink[] = [
  {
    label: "Lesson-study JSON",
    href: lessonStudySampleUrl,
    detail: "Single-upload lesson-study contract"
  },
  ...senaPilotSampleCsvAssets
];

export const senaPilotTemplateAssets: SenaPilotAssetLink[] = [
  {
    label: "JSON contract template",
    href: "/sena-pilot/templates/sena-data-contract-template.json",
    detail: "Empty SENA contract skeleton"
  },
  {
    label: "Dataset metadata template",
    href: "/sena-pilot/templates/sena-dataset-metadata-template.json",
    detail: "Governance metadata JSON for five-CSV uploads"
  },
  {
    label: "People CSV template",
    href: "/sena-pilot/templates/people.csv",
    detail: "Participant table header"
  },
  {
    label: "Interactions CSV template",
    href: "/sena-pilot/templates/interactions.csv",
    detail: "Person-person tie table header"
  },
  {
    label: "Utterances CSV template",
    href: "/sena-pilot/templates/utterances.csv",
    detail: "Conversation stream table header"
  },
  {
    label: "Coded Segments CSV template",
    href: "/sena-pilot/templates/coded_segments.csv",
    detail: "ENA coding table header"
  },
  {
    label: "Codebook CSV template",
    href: "/sena-pilot/templates/codebook.csv",
    detail: "Code definitions table header"
  }
];

export const senaPilotAssetIntegrity = pilotPackageManifest.assetIntegrity;

export const senaPilotHandoffChecks = pilotPackageManifest.handoffChecks;
