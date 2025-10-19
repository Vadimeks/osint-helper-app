// src/app/api/analyze/route.ts

import { NextResponse } from "next/server";

// Выкарыстоўваем працэсныя зменныя асяроддзя (напрыклад, GEMINI_API_KEY з .env.local)
// Зменіце 'GEMINI_API_KEY' на фактычнае імя вашай зменнай!
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

// Інтэрфейс Tsezka, які вызначае структуру вынікаў ад LLM.
interface Tsezka {
  name: string;
  region: string;
  activity: string;
  certainty: string;
  url: string;
}

/**
 * [ФУНКЦЫЯ ВЫПРАЎЛЕННЯ]
 * Здабывае першы знойдзены JSON-блок з радка.
 * (Код extractJson тут і ў generate-queries павінен быць аб'яднаны,
 * але пакуль пакідаем так, каб выправіць праблему)
 */
function extractJson(text: string): string {
  // ... (Ваш код extractJson застаецца тут)
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
 */
async function fetchWithRetry(
  url: string,
  payload: Record<string, unknown>,
  attempt: number = 0
): Promise<Response> {
  // ... (Ваш код fetchWithRetry застаецца тут)
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

/**
 * Апрацоўка POST-запыту для выканання OSINT-аналізу з выкарыстаннем Gemini API.
 */
export async function POST(request: Request) {
  try {
    // 1. Атрыманне дадзеных
    const { fullName } = await request.json();
    if (!fullName) {
      return NextResponse.json(
        { error: "Поўнае імя не пазначана." },
        { status: 400 }
      );
    } // Сістэмная інструкцыя - узмацняем патрабаванне ТОЛЬКІ JSON

    const systemPrompt = `
        You are a highly qualified OSINT analyst. Your task is to conduct a THOROUGH search using Google Search, Yandex, and Bing, DuckDuckGo and other, based on the user's name/task.
        
        STRICT NAME MATCHING: You MUST include in the results ONLY those individuals whose FULL NAME (First name, Patronymic, Last name) EXACTLY matches the query. Patronymic MUST match exactly.
        
        SEARCH EXECUTION: Automatically execute search queries covering all major name permutations (FIO, IFO), Cyrillic (Russian, Belarusian, Ukrainian), and Latin transliterations implied by the task.

        COMPREHENSIVE SYNTHESIS (CRITICAL): You MUST aggregate and synthesize ALL relevant and unique information found across ALL search results into a single, comprehensive list of 'tsezki'. Every unique profile found for the subject MUST be detailed, covering all roles and facts (e.g., "IP" and "Sports Coordinator" must be combined into one detailed 'activity' field for one individual). If multiple distinct individuals match the full name (e.g., same name, different region), they MUST ALL be returned as separate objects in the 'tsezki' array.

        SEARCH SCOPE & REGIONAL DEEP DIVE: Search for matches by full name in Russia, Belarus, Ukraine, and the Russian-speaking diaspora worldwide, focusing on official regional data sources (ЕГРИП, ФНС, ФЕДРЕСУРС, ЕГР).

        OUTPUT REQUIREMENT: For each matching individual, you must provide: 1) Name, 2) Region, 3) Activity, 4) Certainty assessment (with reasoning), and 5) Source URL.

        If NO profiles are found, you MUST return the following JSON structure: {"tsezki": []}

        YOUR ENTIRE RESPONSE MUST BE A SINGLE JSON OBJECT CONTAINED WITHIN A MARKDOWN BLOCK: \`\`\`json{...}\`\`\`. DO NOT ADD ANY EXTRA TEXT OR EXPLANATIONS.
        
        The JSON structure MUST follow this schema:
        {"tsezki": [{"name": "...", "region": "...", "activity": "...", "certainty": "...", "url": "..."}]}
        Respond ONLY in Belarusian or Russian in the 'certainty' field.
    `;

    const userQuery = `Perform an OSINT analysis based on the following task: "${fullName}". Display all discovered information in JSON format, strictly following the structure specified in the system instruction`; // 3. Падрыхтоўка payload

    const payload = {
      // Змесціва запыту
      contents: [
        {
          role: "user",
          parts: [
            {
              text: userQuery,
            },
          ],
        },
      ], // Уключэнне Google Search для Grounding (OSINT)

      tools: [{ google_search: {} }], // Сістэмная інструкцыя для ўстаноўкі ролі

      systemInstruction: {
        parts: [{ text: systemPrompt }],
      }, // Дадаем JSON Schema, якой не хапала, каб узмацніць кантроль, як у generate-queries

      //   generationConfig: {
      //     responseMimeType: "application/json",
      //     responseSchema: {
      //       type: "OBJECT",
      //       properties: {
      //         tsezki: {
      //           type: "ARRAY",
      //           items: {
      //             type: "OBJECT",
      //             properties: {
      //               name: { type: "STRING" },
      //               region: { type: "STRING" },
      //               activity: { type: "STRING" },
      //               certainty: { type: "STRING" },
      //               url: { type: "STRING" },
      //             },
      //             required: ["name", "region", "activity", "certainty", "url"],
      //           },
      //         },
      //       },
      //       required: ["tsezki"],
      //     },
      //   },
    }; // ... (далейшы код не змяніўся)

    // 4. Выкананне API-запыту
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

    const resultJsonText: string = candidate.content.parts[0].text; // --- 5. Разбор JSON і падрыхтоўка адказу ---

    const cleanJsonText = extractJson(resultJsonText); // Паспрабуем разабраць JSON

    let parsedResult: { tsezki?: Tsezka[] };
    try {
      parsedResult = JSON.parse(cleanJsonText);
    } catch (_e) {
      console.error("Сыры тэкст LLM:", resultJsonText);
      console.error("Ачышчаны тэкст:", cleanJsonText);
      throw new Error(
        `Памылка разбору дадзеных (SyntaxError): LLM вярнуў некарэктны JSON.`
      );
    } // Праверка наяўнасці ўласцівасці 'tsezki'

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
      // Спецыяльная апрацоўка для памылак парсінгу JSON
      if (error.name === "SyntaxError") {
        errorMessage = `Памылка разбору дадзеных (SyntaxError): LLM вярнуў некарэктны JSON. Калі ласка, удакладніце запыт.`;
      } else {
        errorMessage = error.message;
      } // Спрабуем вярнуць 400, калі гэта відавочна памылка Bad Request, // якая прайшла праз нашу логіку паўтору.

      if (errorMessage.includes("400")) {
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
