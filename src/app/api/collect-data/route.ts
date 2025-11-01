// src/app/api/collect-data/route.ts

import { NextRequest, NextResponse } from "next/server";
// ❗ ВЫПРАЎЛЕННЕ: Імпарт dataStore і SearchQuery з правільных месцаў
import { dataStore } from "@/lib/dataStore";
import { SearchQuery } from "@/types/osint"; // SearchQuery цяпер у types/osint.ts

// --- Канстанты і тыпізацыя ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_RETRIES = 5;

// Для Custom Search API
const SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const SEARCH_CX = process.env.GOOGLE_SEARCH_CX;
const CS_URL = `https://www.googleapis.com/customsearch/v1?key=${SEARCH_API_KEY}&cx=${SEARCH_CX}&num=5`;

// URL для Gemini Search-Enabled API
const GEMINI_SEARCH_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Тып для элемента Custom Search API
interface CSItem {
  link: string;
  title: string;
  snippet: string;
}

interface GeminiChunkWeb {
  uri: string;
}
interface GeminiChunk {
  web: GeminiChunkWeb;
}

// Тыпізацыя для апрацоўкі адказу Gemini
interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: { groundingChunks?: GeminiChunk[] };
}

// ----------------------------------------
// --- 1. Custom Search API (CS API) з паўторнымі спробамі ---

async function runCustomSearch(
  query: string,
  attempt: number = 0
): Promise<{ results: CSItem[]; source: "CS_API" }> {
  if (!SEARCH_API_KEY || !SEARCH_CX) {
    throw new Error(
      "Не знойдзены GOOGLE_SEARCH_API_KEY або GOOGLE_SEARCH_CX у .env.local"
    );
  }

  const url = `${CS_URL}&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.warn(
        `[CS API] 429 Too Many Requests. Retry ${
          attempt + 1
        }/${MAX_RETRIES} after ${delay.toFixed(0)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return runCustomSearch(query, attempt + 1);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          "429 Too Many Requests - Max retries reached for CS API. Switching to Gemini."
        );
      }
      throw new Error(
        `Памылка Custom Search API: ${response.status} ${response.statusText}`
      );
    }

    const data: { items?: CSItem[] } = await response.json();

    const results: CSItem[] = data.items
      ? data.items.map((item: CSItem) => ({
          link: item.link || "Невядомы URL",
          title: item.title || "Без загалоўка",
          snippet: item.snippet || "Без зместу",
        }))
      : [];

    return { results, source: "CS_API" };
  } catch (error) {
    throw error;
  }
}

// --- 2. Gemini Search API (Fallback) ---

async function runGeminiSearch(
  query: string
): Promise<{ results: CSItem[]; source: "GEMINI" }> {
  if (!GEMINI_API_KEY) {
    throw new Error("Не знойдзены GEMINI_API_KEY у .env.local");
  }

  console.log(
    `[GEMINI] 🔄 Пачатак пошуку ў Gemini Search Tool для запыту: ${query}`
  );

  const systemInstructionText = `You are a skilled OSINT assistant. Use the 'google_search' tool for information retrieval and provide a short synthesis of the findings. The response should contain only the synthesis and nothing else.`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Perform a search and synthesize information for: "${query}"`,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: systemInstructionText,
        },
      ],
    },
    tools: [{ googleSearch: {} }],
  };

  const apiResponse = await fetch(GEMINI_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!apiResponse.ok) {
    const errorDetails = await apiResponse.text();
    throw new Error(
      `Памылка Gemini Search API: ${apiResponse.status}. ${errorDetails}`
    );
  }

  const result: { candidates?: GeminiCandidate[] } = await apiResponse.json();

  const candidate = result.candidates?.[0];

  const text = candidate?.content?.parts?.[0]?.text || "No summary available.";

  const citations: GeminiChunk[] =
    candidate?.groundingMetadata?.groundingChunks || [];

  const links: CSItem[] = citations
    .map((chunk: GeminiChunk) => ({
      link: chunk.web.uri,
      title: `[Gemini Result] ${query}`,
      snippet: text,
    }))
    .filter(
      (item: CSItem, index: number, self: CSItem[]) =>
        index === self.findIndex((t: CSItem) => t.link === item.link)
    );

  console.log(`[GEMINI] ✅ Знойдзена ${links.length} унікальных спасылак.`);
  return { results: links, source: "GEMINI" };
}

// --- 3. Асноўны POST-маршрут (ЗБОР ДАНЫХ) ---

export async function POST(req: NextRequest) {
  try {
    const { caseId, searchQuery } = await req.json(); // ❗ НОВАЕ ЛАГАВАННЕ ДЛЯ ДЫЯГНОСТЫКІ
    console.log(
      `[ЗБОР-API] Атрымана: caseId="${caseId}", searchQuery="${searchQuery}"`
    ); // ❗ ПАШЫРАНАЯ ПРАВЕРКА НА 400 ERROR

    const isCaseIdValid =
      typeof caseId === "string" && caseId.trim().length > 0;
    const isSearchQueryValid =
      typeof searchQuery === "string" && searchQuery.trim().length > 0;

    if (!isCaseIdValid || !isSearchQueryValid) {
      console.error(
        `[ЗБОР-API] ❌ Памылка 400: Несапраўдныя дадзеныя. caseId=${caseId} (Валідны: ${isCaseIdValid}), searchQuery=${searchQuery} (Валідны: ${isSearchQueryValid})`
      );
      return NextResponse.json(
        {
          error:
            "Патрабуецца сапраўдны caseId (непусты радок) і searchQuery (непусты радок).",
        },
        { status: 400 }
      );
    } // ❗ ВЫПРАЎЛЕННЕ: Выкарыстоўваем dataStore.getCase

    const caseData = dataStore.getCase(caseId);

    if (!caseData) {
      return NextResponse.json(
        { error: `Сэсія ${caseId} не знойдзена.` },
        { status: 404 }
      );
    }

    console.log(`[ЗБОР]: Case ID ${caseId} пачынае пошук: "${searchQuery}"`);

    let searchResult: { results: CSItem[]; source: "CS_API" | "GEMINI" };

    try {
      searchResult = await runCustomSearch(searchQuery);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("429 Too Many Requests")
      ) {
        console.warn(
          "[ЗБОР] Перавышаны ліміт CS API. Пераход на Gemini Search Tool."
        );
        searchResult = await runGeminiSearch(searchQuery);
      } else {
        throw error;
      }
    } // Фарміраванне новых запісаў

    const newEntries: SearchQuery[] = searchResult.results.map((result) => ({
      query: searchQuery,
      url: result.link,
      snippet: result.snippet,
      title: result.title,
      sourceAPI: searchResult.source,
      timestamp: new Date().toISOString(),
    })); // Фільтруем дублікаты (па URL) перад даданнем, каб пазбегнуць паўтораў

    const existingUrls = new Set(caseData.collectedData.map((d) => d.url));
    const uniqueNewEntries = newEntries.filter(
      (entry) => !existingUrls.has(entry.url)
    ); // Аб'ядноўваем сабраныя дадзеныя

    const updatedCollectedData: SearchQuery[] = [
      ...caseData.collectedData,
      ...uniqueNewEntries,
    ]; // ❗ ВЫПРАЎЛЕННЕ: Выкарыстоўваем dataStore.updateCase

    await dataStore.updateCase(caseId, {
      collectedData: updatedCollectedData,
    });

    const addedCount = uniqueNewEntries.length;

    console.log(
      `✅ Збор завершаны. Дададзена ${addedCount} крыніц праз ${searchResult.source}.`
    );

    return NextResponse.json({
      message: "Дадзеныя паспяхова сабраны.",
      entriesCount: addedCount,
      source: searchResult.source,
      collectedCount: updatedCollectedData.length, // вяртаем агульную колькасць для франтэнда
    });
  } catch (error) {
    console.error("Памылка ў API-маршруце collect-data:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json(
      { error: `Памылка сервера: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// --- 4. Асноўны GET-маршрут (Праверка колькасці) ---

export async function GET(req: NextRequest) {
  try {
    const caseId = req.nextUrl.searchParams.get("caseId");

    if (!caseId || typeof caseId !== "string") {
      return NextResponse.json(
        { error: "Патрабуецца сапраўдны caseId (радок)." },
        { status: 400 }
      );
    } // ❗ ВЫПРАЎЛЕННЕ: Выкарыстоўваем dataStore.getCase

    const caseData = dataStore.getCase(caseId);

    if (!caseData) {
      return NextResponse.json({ count: 0 }, { status: 200 });
    }

    return NextResponse.json({
      count: caseData.collectedData.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json(
      { error: `Памылка сервера: ${errorMessage}` },
      { status: 500 }
    );
  }
}
