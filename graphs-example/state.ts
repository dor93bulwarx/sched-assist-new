import { Annotation } from "@langchain/langgraph";
import type { VulnerabilityDto } from "../dto/vulnerabilityDto";

/** LLM output may have optional cveId (vulnerabilities without CVE) */
export type UpdatedVulnerabilityDto = Omit<VulnerabilityDto, "cveId"> & {
  cveId?: string | null;
};

export interface VersionInfo {
  id?: number;
  productId?: number;
  productName?: string;
  version: string;
  [key: string]: any;
}

export const VulnerabilityAnalysisAnnotation = Annotation.Root({
  // Input: Text or data about the vulnerability (e.g. CVE description)
  vulnerabilityData: Annotation<string>,

  // 0. Validation
  isVulnerability: Annotation<boolean | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),

  // 1. Identified vendor
  vendor: Annotation<string | null>,

  // 2. Identified relevant products
  products: Annotation<string[]>({
    reducer: (state, update) => update,
    default: () => [],
  }),

  // 3. Versions fetched from our DB for these products
  possibleVersions: Annotation<VersionInfo[]>({
    reducer: (state, update) => update,
    default: () => [],
  }),

  // 4. Exact product versions identified by the model as affected
  affectedVersions: Annotation<VersionInfo[]>({
    reducer: (state, update) => update,
    default: () => [],
  }),

  // 5. Extracted vulnerability metadata
  cveId: Annotation<string | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),
  severity: Annotation<"Low" | "Medium" | "High" | "Critical" | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),
  summary: Annotation<string | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),
  publishedAt: Annotation<string | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),
  cveUrl: Annotation<string | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),

  // 6. Existing DB record data (populated if vulnerability already exists)
  existingVulnerabilityId: Annotation<number | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),
  existingVersionIds: Annotation<number[]>({
    reducer: (state, update) => update,
    default: () => [],
  }),

  // 7. Updated vulnerability object from LLM (exists path only)
  updatedVulnerabilityObject: Annotation<UpdatedVulnerabilityDto | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),

  // 8. Whether the vulnerability was persisted to DB
  persisted: Annotation<boolean>({
    reducer: (state, update) => update,
    default: () => false,
  }),
  newVulnerabilityId: Annotation<number | null>({
    reducer: (state, update) => update,
    default: () => null,
  }),
  added: Annotation<boolean>({
    reducer: (state, update) => update,
    default: () => false,
  }),
  notified: Annotation<boolean>({
    reducer: (state, update) => update,
    default: () => false,
  }),
  error: Annotation<string | null>,
});

export type VulnerabilityAnalysisState =
  typeof VulnerabilityAnalysisAnnotation.State;

export function makeVulnerabilityAnalysisInitialState(
  vulnerabilityData: string,
): VulnerabilityAnalysisState {
  return {
    vulnerabilityData,
    isVulnerability: null,
    vendor: null,
    products: [],
    possibleVersions: [],
    affectedVersions: [],
    cveId: null,
    severity: null,
    summary: null,
    publishedAt: null,
    cveUrl: null,
    existingVulnerabilityId: null,
    existingVersionIds: [],
    updatedVulnerabilityObject: null,
    persisted: false,
    newVulnerabilityId: null,
    added: false,
    notified: false,
    error: null,
  };
}
