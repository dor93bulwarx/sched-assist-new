import { StateGraph, START, END } from "@langchain/langgraph";
import {
  VulnerabilityAnalysisAnnotation,
  VulnerabilityAnalysisState,
} from "./state";
import { validationGraph } from "./validationGraph";
import {
  extractMetadataAndVendorNode,
  identifyProductsNode,
  fetchPossibleVersionsNode,
  identifyAffectedVersionsNode,
  checkExistingVulnerabilityNode,
  addVulnerabilityNode,
  getUpdatedVulnerabilityObjectNode,
  deleteStaleVersionAssociationsNode,
  addVersionVulnerabilitiesNode,
  upsertVulnerabilityNode,
  upsertJunctionNode,
  notifySubscribersNode,
  saveToMemoryNode,
} from "./nodes/vulnerabilityNodes";
import { store } from "./memory";

function routeAfterValidation(state: VulnerabilityAnalysisState): string {
  if (state.error || state.isVulnerability === false) {
    return END;
  }
  return "extractMetadataAndVendor";
}

function routeAfterMetadataAndVendor(
  state: VulnerabilityAnalysisState,
): string {
  if (state.error || !state.summary || !state.vendor) {
    return END;
  }
  return "checkExistingVulnerability";
}

function routeAfterExistingCheck(state: VulnerabilityAnalysisState): string {
  if (state.error) {
    return END;
  }
  if (state.existingVulnerabilityId) {
    return "getUpdatedVulnerabilityObject";
  }
  return "identifyProducts";
}

function routeAfterProducts(state: VulnerabilityAnalysisState): string {
  if (state.error || state.products.length === 0) {
    return END;
  }
  return "fetchPossibleVersions";
}

function routeAfterVersions(state: VulnerabilityAnalysisState): string {
  if (state.error || state.possibleVersions.length === 0) {
    return END;
  }
  return "identifyAffectedVersions";
}

function routeAfterAffectedVersions(state: VulnerabilityAnalysisState): string {
  if (state.error || state.affectedVersions.length === 0) {
    return END;
  }
  return "addVulnerability";
}

const workflow = new StateGraph(VulnerabilityAnalysisAnnotation)
  .addNode("validationSubgraph", validationGraph)
  .addNode("extractMetadataAndVendor", extractMetadataAndVendorNode)
  .addNode("checkExistingVulnerability", checkExistingVulnerabilityNode)
  .addNode("getUpdatedVulnerabilityObject", getUpdatedVulnerabilityObjectNode)
  .addNode("upsertVulnerability", upsertVulnerabilityNode)
  .addNode("upsertJunction", upsertJunctionNode)
  .addNode("deleteStaleVersionAssociations", deleteStaleVersionAssociationsNode)
  .addNode("identifyProducts", identifyProductsNode)
  .addNode("fetchPossibleVersions", fetchPossibleVersionsNode)
  .addNode("identifyAffectedVersions", identifyAffectedVersionsNode)
  .addNode("addVulnerability", addVulnerabilityNode)
  .addNode("addVersionVulnerabilities", addVersionVulnerabilitiesNode)
  .addNode("notifySubscribers", notifySubscribersNode)
  .addNode("saveToMemory", saveToMemoryNode)

  .addEdge(START, "validationSubgraph")

  .addConditionalEdges("validationSubgraph", routeAfterValidation, {
    extractMetadataAndVendor: "extractMetadataAndVendor",
    [END]: END,
  })

  .addConditionalEdges(
    "extractMetadataAndVendor",
    routeAfterMetadataAndVendor,
    {
      checkExistingVulnerability: "checkExistingVulnerability",
      [END]: END,
    },
  )

  .addConditionalEdges("checkExistingVulnerability", routeAfterExistingCheck, {
    getUpdatedVulnerabilityObject: "getUpdatedVulnerabilityObject",
    identifyProducts: "identifyProducts",
    [END]: END,
  })

  .addEdge("getUpdatedVulnerabilityObject", "upsertVulnerability")
  .addEdge("upsertVulnerability", "upsertJunction")
  .addEdge("upsertJunction", "deleteStaleVersionAssociations")
  .addEdge("deleteStaleVersionAssociations", "notifySubscribers")

  .addConditionalEdges("identifyProducts", routeAfterProducts, {
    fetchPossibleVersions: "fetchPossibleVersions",
    [END]: END,
  })

  .addConditionalEdges("fetchPossibleVersions", routeAfterVersions, {
    identifyAffectedVersions: "identifyAffectedVersions",
    [END]: END,
  })

  .addConditionalEdges("identifyAffectedVersions", routeAfterAffectedVersions, {
    addVulnerability: "addVulnerability",
    [END]: END,
  })
  .addEdge("addVulnerability", "addVersionVulnerabilities")
  .addEdge("addVersionVulnerabilities", "notifySubscribers")
  .addEdge("notifySubscribers", "saveToMemory")
  .addEdge("saveToMemory", END);

export const identifyVulnerabilitiesGraph = workflow.compile({ store: store });
