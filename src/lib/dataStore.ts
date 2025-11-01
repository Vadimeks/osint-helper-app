// src/lib/dataStore.ts

import * as fs from "fs-extra";
import path from "path";
import { CaseData } from "@/types/osint";

// Шлях да папкі, дзе захоўваюцца кейсы
const CASES_DIR = path.join(process.cwd(), "data", "cases");

// Часовае in-memory сховішча для кэшавання пасля загрузкі
const caseCache: Map<string, CaseData> = new Map();

// --- УТЫЛІТЫ ДЛЯ ФАЙЛАВАЙ СІСТЭМЫ ---

const getCaseFilePath = (caseId: string) => {
  return path.join(CASES_DIR, `${caseId}.json`);
};

/**
 * Загружае ўсе кейсы з дыска ў кэш.
 */
async function loadAllCases(): Promise<void> {
  if (caseCache.size > 0) return;

  await fs.ensureDir(CASES_DIR);
  const files = await fs.readdir(CASES_DIR);

  for (const file of files) {
    if (file.endsWith(".json")) {
      const caseId = file.replace(".json", "");
      try {
        const data = await fs.readJson(getCaseFilePath(caseId));
        caseCache.set(caseId, data as CaseData);
      } catch (error) {
        console.error(`[DataStore] Памылка загрузкі кейса ${caseId}:`, error);
      }
    }
  }
  console.log(`[DataStore] Загружана ${caseCache.size} кейсаў з дыска.`);
}

/**
 * Захоўвае канкрэтны кейс на дыск.
 */
async function saveCase(caseData: CaseData): Promise<void> {
  const filePath = getCaseFilePath(caseData.caseId);
  try {
    await fs.writeJson(filePath, caseData, { spaces: 2 });
  } catch (error) {
    console.error(
      `[DataStore] Памылка захавання кейса ${caseData.caseId}:`,
      error
    );
  }
}

// Загружаем дадзеныя пры першым імпарце (пры старце сервера)
loadAllCases().catch(console.error);

// --- КЛАС DataStore ---

// Вызначаем тып дадзеных, якія паступаюць (без аўтаматычна дадаваных палёў)
type CaseCreationData = Omit<
  CaseData,
  "analysis" | "createdAt" | "updatedAt"
> & { analysis: string | null };

export class DataStore {
  public getCaseCache(): Map<string, CaseData> {
    return caseCache;
  }

  public async addCase(
    // ❗ КРЫТЫЧНАЕ ВЫПРАЎЛЕННЕ: Omit зараз уключае createdAt і updatedAt
    caseData: CaseCreationData
  ): Promise<void> {
    const now = Date.now();
    const fullCase: CaseData = {
      ...caseData,
      createdAt: now, // Выкарыстоўваем 'now'
      updatedAt: now, // Выкарыстоўваем 'now'
      analysis: caseData.analysis || null,
    };
    caseCache.set(fullCase.caseId, fullCase);
    await saveCase(fullCase);
  } // Выпраўленае імя метада

  public getCase(caseId: string): CaseData | undefined {
    return caseCache.get(caseId);
  }

  public async updateCase(
    caseId: string,
    updates: Partial<CaseData>
  ): Promise<void> {
    const existingCase = caseCache.get(caseId);

    if (existingCase) {
      const updatedCase = {
        ...existingCase,
        ...updates,
        updatedAt: Date.now(),
      } as CaseData;

      caseCache.set(caseId, updatedCase);
      await saveCase(updatedCase);
    } else {
      throw new Error(`[DataStore] Кейс з ID ${caseId} не знойдзены.`);
    }
  }

  public async deleteCase(caseId: string): Promise<void> {
    caseCache.delete(caseId);
    const filePath = getCaseFilePath(caseId);
    try {
      await fs.remove(filePath);
    } catch (error) {
      console.warn(
        `[DataStore] Папярэджанне: Памылка выдалення файла кейса ${caseId}.`,
        error
      );
    }
  }
}

// ЭКСПАРТ ІНСТАНСА для ўсіх API-роутаў
export const dataStore = new DataStore();
