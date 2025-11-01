// src/backend/dataStore.ts
import { v4 as uuidv4 } from "uuid";
import { dataStore } from "@/lib/dataStore";
import { SearchQuery } from "@/types/osint";

/**
 * Adapter layer kept for backward compatibility.
 * Old modules import from "@/backend/dataStore". This file delegates to the
 * new file-based dataStore (src/lib/dataStore) and adapts shapes.
 */

// Create a new case and return { caseId }
export function createNewCase(task: string): { caseId: string } {
  const caseId = "case-" + uuidv4();
  // Build minimal CaseData shape expected by dataStore.addCase
  // Use the exact parameter type of dataStore.addCase to avoid `any` usage
  type AddCaseParam = Parameters<typeof dataStore.addCase>[0];

  const newCase: AddCaseParam = {
    caseId,
    task,
    generatedQueries: [],
    collectedData: [] as SearchQuery[],
    analysis: null,
  };

  // Note: dataStore.addCase will set createdAt/updatedAt
  dataStore
    .addCase(newCase)
    .catch((e) => console.error("[backend.dataStore] addCase error:", e));

  console.log(`[DataStore Adapter] Created case ${caseId}`);
  return { caseId };
}

// Set queries for a case
export function setCaseQueries(caseId: string, queries: string[]): void {
  // Delegate to updateCase
  dataStore
    .updateCase(caseId, { generatedQueries: queries })
    .catch((e) =>
      console.error(
        `[backend.dataStore] setCaseQueries failed for ${caseId}:`,
        e
      )
    );
}

// Add collected (raw) entry (legacy shape) -> convert to SearchQuery and save
export function addCollectedEntry(
  caseId: string,
  entry: { url: string; content: string; query: string }
): void {
  try {
    const caseData = dataStore.getCase(caseId);
    if (!caseData) {
      throw new Error(`Case ${caseId} not found`);
    }

    const searchEntry: SearchQuery = {
      query: entry.query,
      url: entry.url || `manual-input://${caseId}/${Date.now()}`,
      snippet: entry.content,
      title: entry.query || "Manual entry",
      sourceAPI: "GEMINI",
      timestamp: new Date().toISOString(),
    };

    const updated = [...caseData.collectedData, searchEntry];
    dataStore.updateCase(caseId, { collectedData: updated }).catch((e) => {
      console.error(`[backend.dataStore] updateCase failed:`, e);
    });
    console.log(
      `[DataStore Adapter] addCollectedEntry for ${caseId} (now ${updated.length} entries)`
    );
  } catch (e) {
    console.error("[DataStore Adapter] addCollectedEntry error:", e);
    throw e;
  }
}

// Save manual entry (keeps old signature)
export function saveManualEntry(
  caseId: string,
  name: string,
  content: string,
  url: string
): void {
  addCollectedEntry(caseId, {
    url: url || `manual-input://${caseId}/${Date.now()}`,
    content: `**[РУЧНЫ ЎВОД: ${name}]**\n${content}`,
    query: "MANUAL_INPUT",
  });
}

// Return a legacy-shaped case object for backward compatibility.
// Old code expects { id, task, queries, collectedData: CollectedEntry[] }
export function getCase(caseId: string) {
  const caseData = dataStore.getCase(caseId);
  if (!caseData) {
    throw new Error(`[DataStore Adapter] Case ID ${caseId} not found.`);
  }
  const adapted = {
    id: caseData.caseId,
    task: caseData.task,
    queries: caseData.generatedQueries,
    // Map SearchQuery -> legacy CollectedEntry { url, content, query }
    collectedData: caseData.collectedData.map((d) => ({
      url: d.url,
      content: d.snippet,
      query: d.query,
    })),
    createdAt: caseData.createdAt,
  };
  return adapted;
}

// Return collected content formatted for Gemini (legacy helper)
export function getCollectedContent(caseId: string): string {
  const c = getCase(caseId);
  const content = (c.collectedData || [])
    .map(
      (entry: { url: string; content: string; query: string }, idx: number) =>
        `--- КРЫНІЦА ${idx + 1} (ЗАПЫТ: ${entry.query}, URL: ${
          entry.url
        }) ---\n${entry.content}`
    )
    .join("\n\n");
  return content;
}
