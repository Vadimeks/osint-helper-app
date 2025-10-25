// src/backend/dataStore.ts
// Гэтае сховішча імітуе базу дадзеных для захавання стану OSINT-справы
// Пасля перазапуску сервера дадзеныя будуць страчаныя!

import { v4 as uuidv4 } from "uuid";

// --- Інтэрфейсы для дадзеных справы ---

interface CollectedEntry {
  url: string; // Спасылка на крыніцу
  content: string; // Змест, які будзе адпраўлены LLM для сінтэзу
  query: string; // Запыт, па якім знойдзены запіс (або MANUAL_INPUT)
}

interface CaseData {
  id: string;
  task: string;
  queries: string[];
  collectedData: CollectedEntry[]; // Увесь сыры тэкст са збору і ручнога ўводу
  createdAt: number;
}

// Захоўваем усе справы ў аб'екце, дзе ключ - гэта caseId
const cases: Record<string, CaseData> = {};

// --- Асноўныя функцыі ---

/**
 * Стварае новую справу і вяртае яе ID.
 */
export function createNewCase(task: string): { caseId: string } {
  const newId = uuidv4();
  cases[newId] = {
    id: newId,
    task: task,
    queries: [],
    collectedData: [],
    createdAt: Date.now(),
  };
  console.log(`[DataStore] ✅ Створана новая справа: ${newId}`);
  return { caseId: newId };
}

/**
 * Дадае згенераваныя запыты да справы.
 */
export function setCaseQueries(caseId: string, queries: string[]): void {
  if (cases[caseId]) {
    cases[caseId].queries = queries;
    console.log(
      `[DataStore] Захавана ${queries.length} запытаў для ${caseId}.`
    );
  } else {
    throw new Error(
      `[DataStore Error] Справа ID ${caseId} не знойдзена пры захаванні запытаў.`
    );
  }
}

/**
 * Дадае новы запіс (аўтаматычны збор або ручны ўвод) да справы.
 */
export function addCollectedEntry(caseId: string, entry: CollectedEntry): void {
  if (cases[caseId]) {
    cases[caseId].collectedData.push(entry);
    console.log(
      `[DataStore] Дададзены запіс для ${caseId}. Усяго запісаў: ${cases[caseId].collectedData.length}`
    );
  } else {
    throw new Error(
      `[DataStore Error] Справа ID ${caseId} не знойдзена пры даданні запісу.`
    );
  }
}

/**
 * Спецыяльная функцыя для ручнога ўводу
 */
export function saveManualEntry(
  caseId: string,
  name: string,
  content: string,
  url: string
): void {
  const entry: CollectedEntry = {
    url: url || `manual-input://${caseId}/${Date.now()}`,
    content: `**[РУЧНЫ ЎВОД: ${name}]**\n${content}`,
    query: "MANUAL_INPUT",
  };
  addCollectedEntry(caseId, entry);
}

/**
 * Вяртае поўны аб'ект справы.
 */
export function getCase(caseId: string): CaseData {
  if (cases[caseId]) {
    return cases[caseId];
  }
  throw new Error(`[DataStore Error] Справа ID ${caseId} не знойдзена.`);
}

/**
 * Вяртае ўсе сабраныя дадзеныя ў фармаце для адпраўкі ў LLM-сінтэз.
 */
export function getCollectedContent(caseId: string): string {
  const caseData = getCase(caseId);

  // Фармат для адпраўкі ў Gemini
  const content = caseData.collectedData
    .map(
      (entry, index) =>
        `--- КРЫНІЦА ${index + 1} (ЗАПЫТ: ${
          entry.query
        }, URL: ${entry.url.substring(0, 100)}) ---\n${entry.content}`
    )
    .join("\n\n");

  return content;
}
