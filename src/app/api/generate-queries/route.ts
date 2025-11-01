// src/app/api/generate-queries/route.ts

import { NextRequest, NextResponse } from "next/server";
import { dataStore } from "@/lib/dataStore";
// ❗ ВЫПРАЎЛЕННЕ: Імпартуем SearchQuery для правільнай тыпізацыі пустога масіва
import { SearchQuery } from "@/types/osint";

// Выкарыстоўваем працэсныя зменныя асяроддзя
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

// Абноўленая функцыя fetchWithRetry
async function fetchWithRetry(
  url: string,
  payload: Record<string, unknown>,
  attempt: number = 0
): Promise<Response> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.warn(
        `429 Too Many Requests. Retry ${
          attempt + 1
        }/${MAX_RETRIES} after ${delay.toFixed(0)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, payload, attempt + 1);
    }

    return response;
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.error(
        `Fetch error. Retry ${attempt + 1}/${MAX_RETRIES} after ${delay.toFixed(
          0
        )}ms:`,
        error
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, payload, attempt + 1);
    }
    throw new Error(`Не атрымалася звязацца з API пасля ${MAX_RETRIES} спроб.`);
  }
}

/**
 * Разбірае тэкст ад мадэлі, здабывае масіў запытаў і фільтруе несапраўдныя запісы.
 */
function extractQueries(text: string): string[] {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();

  let potentialQueries: unknown[] = [];

  try {
    const parsed = JSON.parse(jsonText); // Спрабуем атрымаць масіў з поля "queries"
    if (Array.isArray(parsed.queries)) {
      potentialQueries = parsed.queries;
    } else if (Array.isArray(parsed)) {
      // Спрабуем разабраць як просты масіў
      potentialQueries = parsed;
    }
  } catch (error) {
    console.warn("Не атрымалася разабраць JSON, які вярнула мадэль:", error);
    return []; // Вяртаем пусты масіў у выпадку памылкі разбору
  } // ❗ КЛЮЧАВОЕ ВЫПРАЎЛЕННЕ: Фільтруем несапраўдныя значэнні

  const validQueries = potentialQueries.filter((q): q is string => {
    // Захоўваем толькі радкі
    if (typeof q === "string") {
      const trimmed = q.trim(); // Выключаем пустыя радкі І радок "undefined"
      return trimmed.length > 0 && trimmed.toLowerCase() !== "undefined";
    }
    return false; // Выключаем null, undefined, number, object і г.д.
  });

  return validQueries;
}

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      throw new Error("GEMINI_API_KEY не знойдзены.");
    }

    const { task } = await req.json();

    if (!task || typeof task !== "string") {
      return NextResponse.json(
        { error: "Патрабуецца поле 'task'." },
        { status: 400 }
      );
    }

    const caseId = "case-" + crypto.randomUUID();

    const systemInstruction = `
You are an expert OSINT analyst. Your goal is to convert a complex OSINT task into 5-10 highly effective Google search queries.
The user's task is: "${task}".

Think step-by-step:
1. Identify the key entity (person, organization, etc.).
2. Extract all identifying information (names, locations, dates, positions, company names).
3. Generate 5-10 unique, highly specific search strings that combine the identifying information in various ways (e.g., "Full Name" + "Company Name", "Location" + "Date of Birth").
4. Include both Cyrillic and Latin spellings if applicable (e.g., for names/company names).

Your response MUST be a single JSON object containing a list of queries. Do NOT include any extra text.

Example format:
\`\`\`json
{
    "queries": [
        "Сергеев Иван Петрович Минск",
        "Ivan Sergeev CEO Progress OOO",
        "Сергеев Иван Петрович 1975"
    ]
}
\`\`\`
`;

    const payload = {
      contents: [
        { parts: [{ text: `Generate queries for OSINT task: "${task}"` }] },
      ],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.2 },
    };

    const apiResponse = await fetchWithRetry(API_URL, payload);

    if (!apiResponse.ok) {
      const errorDetails = await apiResponse.text();
      throw new Error(
        `Памылка LLM API: Код ${apiResponse.status}. ${errorDetails}`
      );
    }

    const result = await apiResponse.json();
    const resultText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      throw new Error("Мадэль не змагла згенераваць запыты.");
    }

    const generatedQueries = extractQueries(resultText);

    if (generatedQueries.length === 0) {
      throw new Error("Мадэль вярнула пусты або несапраўдны спіс запытаў.");
    }

    const newCase = {
      caseId: caseId,
      task: task,
      generatedQueries: generatedQueries,
      collectedData: [] as SearchQuery[],
      analysis: null as string | null,
    };

    await dataStore.addCase(newCase);

    console.log(
      `✅ Створана сэсія ${caseId} з ${generatedQueries.length} запытамі.`
    );

    return NextResponse.json({
      caseId: newCase.caseId,
      queries: newCase.generatedQueries,
    });
  } catch (error) {
    console.error("Памылка ў API-маршруце generate-queries:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json(
      { error: `Памылка сервера: ${errorMessage}` },
      { status: 500 }
    );
  }
}
