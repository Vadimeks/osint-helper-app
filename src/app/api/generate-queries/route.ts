// src/app/api/generate-queries/route.ts

import { NextRequest, NextResponse } from "next/server";

// Калі вы яшчэ не выправілі ключ, зрабіце гэта:
// Выкарыстоўваем працэсныя зменныя асяроддзя (напрыклад, GEMINI_API_KEY з .env.local)
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

// [Функцыі extractJson і fetchWithRetry застаюцца без зменаў]
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
// [Канец функцый]

export async function POST(req: NextRequest) {
  try {
    const { task } = await req.json();

    if (!task || typeof task !== "string") {
      return NextResponse.json(
        { error: "Патрабуецца поле 'task' (задача аналізу)." },
        { status: 400 }
      );
    }

    // УЗМАЦНЕНАЯ Сістэмная інструкцыя
    const systemPrompt = `
YOU MUST ONLY RESPOND WITH THE JSON OBJECT THAT CONTAINS THE 'queries' ARRAY. DO NOT ADD ANY EXTRA TEXT, EXPLANATIONS, OR CONVERSATIONAL PHRASES.

Act as an expert OSINT analyst. The user provides a name or object (e.g., "Медведев Сергей Викторович").

Your task is to generate 15–20 highly effective, targeted Google search queries to start a full-spectrum investigation.

You MUST include:
- Cyrillic variants: Russian, Ukrainian, Belarusian
- Latin transliterations: English-style, Ukrainian-style, Belarusian-style
- Partial name combinations: First + Patronymic, Last + First, Initials
- Advanced operators: site:, filetype:, intitle:, inurl:, OR, AND, quoted phrases

Cover multiple dimensions:
- Personal data (ИНН, СНИЛС, дата рождения, адрес)
- Legal and business records (ЕГРЮЛ, учредитель, директор, суды)
- Social media (site:vk.com, site:ok.ru, site:facebook.com, site:linkedin.com)
- Multimedia (site:youtube.com, интервью, выступление)
- Documents (filetype:pdf, резюме, анкета)
- News and scandals (новости, задержан, скандал)
- Connections (связи, партнеры, семья)
- Sanctions and OSINT mentions

The output MUST follow this schema:
{
  "queries": [ "..." ]
}
`;

    const payload = {
      contents: [
        {
          parts: [{ text: `Generate search queries for the task: "${task}"` }],
        },
      ],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        // Гэта ўсё яшчэ самы важны кантроль
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            queries: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
          },
          required: ["queries"],
        },
      },
    };

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

    const resultJsonText: string = candidate.content.parts[0].text;
    const cleanJsonText = extractJson(resultJsonText);

    // --- ЗМЕНЕНЫ БЛОК ДЛЯ АПРАЦОЎКІ АБОДВУХ ФАРМАТАЎ JSON ---
    let parsedResult: unknown;
    try {
      parsedResult = JSON.parse(cleanJsonText);
    } catch (_e) {
      console.error("Сыры тэкст LLM:", resultJsonText);
      console.error("Ачышчаны тэкст:", cleanJsonText);
      throw new Error(
        `Памылка разбору дадзеных (SyntaxError): LLM вярнуў некарэктны JSON.`
      );
    }

    let queries: string[] | undefined;

    // Сцэнар А: LLM вярнуў поўны аб'ект {"queries": [...]}.
    if (
      typeof parsedResult === "object" &&
      parsedResult !== null &&
      "queries" in parsedResult &&
      Array.isArray((parsedResult as { queries?: unknown }).queries)
    ) {
      queries = (parsedResult as { queries: string[] }).queries;
    }
    // Сцэнар Б: LLM вярнуў толькі чысты масіў [...], як паказана ў логах.
    else if (Array.isArray(parsedResult)) {
      queries = parsedResult as string[];
    }

    if (!queries || !Array.isArray(queries)) {
      // Калі абодва сцэнарыі не спрацавалі, выкідваем памылку.
      console.error("Атрыманы аб'ект:", parsedResult);
      throw new Error(
        "Няправільны фармат JSON-адказу ад LLM: адсутнічае масіў 'queries' або няслушная структура."
      );
    }

    return NextResponse.json({ queries });
    // --- КАНЕЦ ЗМЕНЕНАГА БЛОКА ---
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
