import { InMemoryStore } from "@langchain/langgraph";

// 1. Initialize the store
const store = new InMemoryStore();

// 2. Add data to the store
async function initializeMemoryStore() {
  await store.put(
    ["agents", "vulnerability_identification_agent", "persona"], // Namespace
    "core_instructions", // Key
    {
      core_instructions:
        "You are a cybersecurity expert. You are responsible for identifying vulnerabilities in software and providing a report on the vulnerabilities found.",
    },
  );
}

export { store, initializeMemoryStore };
