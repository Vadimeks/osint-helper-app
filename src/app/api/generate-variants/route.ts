// src/app/api/generate-variants/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

function extractJson(text: string): string {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) return jsonMatch[1].trim();

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start)
    return text.substring(start, end + 1).trim();

  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart)
    return text.substring(objStart, objEnd + 1).trim();

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
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, payload, attempt + 1);
    }

    return response;
  } catch (_e) {
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, payload, attempt + 1);
    }
    throw new Error(`Не атрымалася звязацца з API пасля ${MAX_RETRIES} спроб.`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fullName } = await req.json();

    if (!fullName || typeof fullName !== "string") {
      return NextResponse.json(
        { error: "Патрабуецца поле 'fullName'." },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are an expert OSINT analyst and identity profiler.

Your task is to generate a comprehensive set of variants based on a full name provided by the user (e.g., "Медведев Сергей Викторович").

You MUST return three arrays:
1. nameVariants — all possible name spellings and transliterations:
   - Cyrillic: Russian, Ukrainian, Belarusian
   - Latin: English-style, Ukrainian-style, Belarusian-style
   - Partial forms: First + Patronymic, Last + First, Initials (e.g., S.V. Medvedev)

2. emailVariants — realistic email address guesses based on common patterns:
   - Gmail, Yandex, Mail.ru, Protonmail, Outlook
   - Formats like: medvedev.sv@..., s.medvedev@..., sergey.v.medvedev@...

3. usernameVariants — likely usernames or handles for social platforms:
   - VK, Telegram, Instagram, Facebook, LinkedIn, GitHub, TikTok
   - Formats like: medvedev_sv, sergeymedvedev, medvedev1979, s.v.medvedev

You MUST return a single JSON object with this schema:
{
  "nameVariants": [...],
  "emailVariants": [...],
  "usernameVariants": [...]
}

Do NOT include any extra text or explanation. Respond ONLY with the JSON object inside a markdown block: \`\`\`json{...}\`\`\`
`;

    const payload = {
      contents: [
        {
          parts: [{ text: `Generate identity variants for: "${fullName}"` }],
        },
      ],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    const apiResponse = await fetchWithRetry(API_URL, payload);

    if (!apiResponse.ok) {
      const errorDetails = await apiResponse.text();

      throw new Error(
        `Памылка API: Код ${apiResponse.status}. ${errorDetails}`
      );
    }

    const result = await apiResponse.json();
    const candidate = result.candidates?.[0];

    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      throw new Error("API не вярнуў змесціва ў адказе.");
    }

    const resultJsonText: string = candidate.content.parts[0].text;
    const cleanJsonText = extractJson(resultJsonText);

    let parsedResult: {
      nameVariants?: string[];
      emailVariants?: string[];
      usernameVariants?: string[];
    };

    try {
      parsedResult = JSON.parse(cleanJsonText);
    } catch (_e) {
      throw new Error("Памылка разбору дадзеных: некарэктны JSON.");
    }

    if (
      !parsedResult ||
      !Array.isArray(parsedResult.nameVariants) ||
      !Array.isArray(parsedResult.emailVariants) ||
      !Array.isArray(parsedResult.usernameVariants)
    ) {
      throw new Error(
        "Няправільны фармат JSON-адказу: адсутнічаюць неабходныя масівы."
      );
    }

    return NextResponse.json(parsedResult);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
