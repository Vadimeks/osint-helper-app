// src/app/api/analyze/route.ts

import { NextRequest, NextResponse } from "next/server";
// !!! ВАЖНА: ІМПАРТ ФУНКЦЫІ ДЛЯ ПРАЦЫ З ДАНЫМІ
import { getCase } from "@/backend/dataStore";
interface CaseEntry {
  query: string;
  content: string;
  url?: string;
}

interface CaseData {
  id: string;
  task: string;
  queries: string[];
  entries: CaseEntry[]; // <-- Гэта выпраўляе памылку "Property 'entries' does not exist"
}
// Выкарыстоўваем працэсныя зменныя асяроддзя
const API_KEY = process.env.GEMINI_API_KEY;
// Захоўваем вашу мадэль, але рэкамендую 'gemini-2.5-pro' для сінтэзу
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

// Інтэрфейс Tsezka, які вызначае структуру вынікаў ад LLM.
interface Tsezka {
  name: string;
  region: string;
  activity: string;
  certainty: "High" | "Medium" | "Low"; // Удакладняем тып для лепшага кантролю
  url: string;
}

/**
 * [ФУНКЦЫЯ ВЫПРАЎЛЕННЯ]
 * Здабывае першы знойдзены JSON-блок з радка.
 * (Ваш код extractJson)
 */
function extractJson(text: string): string {
  // 1. Пошук блокаў у фармаце ```json...```
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  } // 2. Пошук масіва [ ... ]

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1).trim();
  } // 3. Пошук аб'екта { ... }

  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    return text.substring(objStart, objEnd + 1).trim();
  } // 4. Калі нічога не знойдзена, вяртаем зыходны тэкст

  return text;
}

/**
 * Выконвае POST-запыт да Gemini API з экспаненцыяльным адкатам (Exponential Backoff).
 * (Ваш код fetchWithRetry)
 */
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
// [Канец дапаможных функцый]

/**
 * Апрацоўка POST-запыту для ВЫКАНАННЯ СІНТЭЗУ дадзеных OSINT.
 * Цяпер прымае caseId і выцягвае ўсе сабраныя дадзеныя.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. АТРЫМАННЕ caseId
    const { caseId } = await request.json(); // !!! МЯНЯЕМ fullName НА caseId

    if (!caseId) {
      return NextResponse.json(
        { error: "Патрабуецца caseId для выканання аналізу." },
        { status: 400 }
      );
    } // 2. ЧЫТАННЕ ЎСІХ САБРАНЫХ ДАНЫХ

    const currentCase = getCase(caseId) as unknown as CaseData; // <-- ДАДАЕМ CaseData
    const allContent: string = currentCase.entries
      .map(
        (entry: CaseEntry) =>
          `--- Крыніца (${entry.url || "Manual Input"}, Запыт: ${
            entry.query
          }):\n${entry.content}\n---`
      )
      .join("\n\n");

    if (allContent.trim().length === 0) {
      return NextResponse.json(
        {
          error:
            "Няма дадзеных для аналізу. Спачатку збярыце дадзеныя (Крок 2).",
        },
        { status: 404 }
      );
    } // 3. СІСТЭМНАЯ ІНСТРУКЦЫЯ ДЛЯ СІНТЭЗУ

    const systemPrompt = `
You are an expert OSINT analyst. Your task is to analyze the raw, collected data provided below, which includes automated search results and manual inputs, and synthesize it into structured intelligence profiles ("Tsezki").

STRICTLY follow these rules:
1. Identify unique individuals or entities mentioned in the RAW COLLECTED DATA.
2. For each unique entity, create one "Tsezka" object.
3. The response MUST be a single JSON object containing the "tsezki" array conforming EXACTLY to the specified TypeScript interface.
4. DO NOT include any text, notes, or explanations outside the JSON block.

Tsezka Interface:
interface Tsezka {
 name: string; // The full name or entity title
 region: string; // Geographic location or region
 activity: string; // A concise summary of their main professional or online activities, based ONLY on the collected data.
 certainty: 'High' | 'Medium' | 'Low'; // Confidence level that the data belongs to the target person/entity.
 url: string; // The most relevant URL/source for this profile. Use the "Source" URL from the collected data.
}

Respond ONLY in Belarusian or Russian in the 'activity' and 'name' fields, and use the exact values 'High', 'Medium', or 'Low' in the 'certainty' field.
`;
    const userQuery = `
RAW COLLECTED DATA (Manual Input and Search Results):

${allContent}

Please analyze the data and generate the final JSON object containing the 'tsezki' array.
`; // 4. ПАДРЫХТОЎКА PAYLOAD

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: userQuery }],
        },
      ], // !!! ВАЖНА: ПАВІННА БЫЦЬ БЕЗ GOOGLE SEARCH TOOL // tools: [{ google_search: {} }], // <--- ГЭТА ТРЭБА ВЫДАЛІЦЬ!
      systemInstruction: { parts: [{ text: systemPrompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            tsezki: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  region: { type: "string" },
                  activity: { type: "string" },
                  certainty: {
                    type: "string",
                    enum: ["High", "Medium", "Low"],
                  },
                  url: { type: "string" },
                },
                required: ["name", "region", "activity", "certainty", "url"],
              },
            },
          },
          required: ["tsezki"],
        },
        temperature: 0.1, // Нізкая тэмпература для структураванага выніку
      },
    }; // 5. Выкананне API-запыту

    const apiResponse = await fetchWithRetry(API_URL, payload);

    if (!apiResponse.ok) {
      const errorDetails = await apiResponse.text();
      console.error("API Error Response:", apiResponse.status, errorDetails);
      throw new Error(`Памылка API: Код ${apiResponse.status}`);
    }

    const result = await apiResponse.json();
    const candidate = result.candidates?.[0];

    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      throw new Error("API не вярнуў змесціва ў адказе.");
    }

    const resultJsonText: string = candidate.content.parts[0].text; // 6. Разбор JSON

    const cleanJsonText = extractJson(resultJsonText);

    let parsedResult: { tsezki?: Tsezka[] };
    try {
      parsedResult = JSON.parse(cleanJsonText);
    } catch (_e) {
      console.error("Сыры тэкст LLM:", resultJsonText);
      console.error("Ачышчаны тэкст:", cleanJsonText);
      throw new Error(
        `Памылка разбору дадзеных (SyntaxError): LLM вярнуў некарэктны JSON.`
      );
    }

    if (!parsedResult || !Array.isArray(parsedResult.tsezki)) {
      console.error("Атрыманы аб'ект:", parsedResult);
      throw new Error(
        "Няправільны фармат JSON-адказу ад LLM: адсутнічае масіў 'tsezki' або няслушная структура."
      );
    }
    const tsezki: Tsezka[] = parsedResult.tsezki;

    return NextResponse.json({ tsezki });
  } catch (error: unknown) {
    console.error("Памылка ў API-маршруце:", error);

    let errorMessage =
      "Унутраная памылка сервера. Магчыма, LLM не змог згенераваць карэктны JSON. Паспрабуйце змяніць запыт.";
    if (error instanceof Error) {
      if (error.name === "SyntaxError") {
        errorMessage = `Памылка разбору дадзеных (SyntaxError): LLM вярнуў некарэктны JSON. Калі ласка, удакладніце запыт.`;
      } else {
        errorMessage = error.message;
      }

      if (errorMessage.includes("400")) {
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
