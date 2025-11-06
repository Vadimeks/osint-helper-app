// src/app/api/analyze-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dataStore } from "@/lib/dataStore";
import { SearchQuery } from "@/types/osint";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ANALYZE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

type TsezkaReportIn = {
  description?: string;
  mainData?: Record<string, unknown>;
  contacts?: Record<string, unknown>;
  socialMedia?: Record<string, unknown>;
  professionalActivity?: Record<string, unknown>;
  mediaMentions?: Record<string, unknown>;
  conclusion?: string;
  accuracyAssessment?: string;
  additionalInfo?: string;
  sources?: string[];
  confidenceScore?: number;
  key?: string;
  [k: string]: unknown;
};

const BATCH_SIZE = 40;

// Typed shapes for the parts of Gemini response we read
type GeminiContentPart = { text?: string };
type GeminiContent = { parts?: GeminiContentPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  [k: string]: unknown;
};

async function callGemini(payload: unknown): Promise<unknown> {
  try {
    console.log(
      "[analyze-data] callGemini payload preview:",
      typeof payload === "object"
        ? JSON.stringify(payload).slice(0, 8000)
        : String(payload)
    );
  } catch {}

  const res = await fetch(GEMINI_ANALYZE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    console.error("[analyze-data] Gemini error response:", res.status, parsed);
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildSystemInstruction(): string {
  return `
You are a highly qualified OSINT analyst. You will be given collected sources (snippets and URLs).
Your job: identify distinct individuals/entities ("lookalikes") and produce a JSON array of objects that follow the TsezkaReport schema.
Important:
- RETURN ONLY JSON (no commentary/markdown).
- Fill "conclusion" with a short Belarusian summary (1-3 sentences) for each object.
- Use "N/A" for missing fields and empty arrays for lists if nothing found.
- Include "sources" as an array of URLs.
`;
}

function ensureString(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v ?? "");
  }
}

function getStringField(
  obj: Record<string, unknown> | undefined,
  field: string
): string {
  if (!obj) return "";
  const v = obj[field];
  return typeof v === "string" ? v : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Няправільны фармат JSON у запыце." },
        { status: 400 }
      );
    }
    const { caseId } = body as { caseId?: unknown };
    if (!caseId || typeof caseId !== "string") {
      return NextResponse.json(
        { error: "Патрабуецца caseId (string)." },
        { status: 400 }
      );
    }

    const caseData = dataStore.getCase(caseId);
    if (!caseData) {
      return NextResponse.json(
        { error: `Сэсія ${caseId} не знойдзена.` },
        { status: 404 }
      );
    }
    if (
      !Array.isArray(caseData.collectedData) ||
      caseData.collectedData.length === 0
    ) {
      return NextResponse.json(
        { error: `Сэсія ${caseId} не мае сабраных дадзеных для аналізу.` },
        { status: 400 }
      );
    }

    // Build collected text blocks
    const collected = (caseData.collectedData as SearchQuery[]).map((c) => ({
      url: c.url,
      title: c.title,
      snippet: c.snippet,
      sourceAPI: c.sourceAPI,
      query: c.query,
      timestamp: c.timestamp,
    }));

    // If many items, do batch extraction to compress facts
    let synthesisInput = "";
    if (collected.length > BATCH_SIZE) {
      for (let i = 0; i < collected.length; i += BATCH_SIZE) {
        const batchItems = collected.slice(i, i + BATCH_SIZE);
        const batchText = batchItems
          .map(
            (it, idx) =>
              `${idx + 1}. URL: ${it.url}\nTitle: ${it.title}\nSnippet: ${
                it.snippet
              }\nSource: ${it.sourceAPI}\n`
          )
          .join("\n---\n");

        const system = buildSystemInstruction();
        const batchUserText = `Extract concise factual records (names, dates, locations, contacts, roles, short facts) from the following sources. Return a JSON array of short records (only JSON) in Belarusian.\n\n${batchText}`;

        const payload = {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: batchUserText }] }],
          generationConfig: {},
        };

        try {
          const respRaw = await callGemini(payload);
          const respTyped = respRaw as GeminiResponse;
          const candidateText =
            respTyped?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) synthesisInput += "\n" + candidateText + "\n";
          else synthesisInput += "\n" + batchText + "\n";
        } catch (err) {
          console.warn(
            "[analyze-data] batch extraction failed, using raw batch text",
            err
          );
          synthesisInput += "\n" + batchText + "\n";
        }
      }
    } else {
      synthesisInput = collected
        .map(
          (it, idx) =>
            `${idx + 1}. URL: ${it.url}\nTitle: ${it.title}\nSnippet: ${
              it.snippet
            }\nSource: ${it.sourceAPI}\n`
        )
        .join("\n---\n");
    }

    // Final synthesis: request strict TsezkaReport schema and require conclusion
    const finalSystem = buildSystemInstruction();
    const finalUserText = `TASK: For the dataset below, identify distinct people/entities and return a JSON array of objects following the TsezkaReport schema. For each object include a short Belarusian summary in the "conclusion" field (1-3 sentences). DATA:\n\n${synthesisInput}\n\nReturn ONLY the JSON array.`;

    const finalPayload = {
      systemInstruction: { parts: [{ text: finalSystem }] },
      contents: [{ role: "user", parts: [{ text: finalUserText }] }],
      generationConfig: { response_mime_type: "application/json" },
    };

    try {
      console.log(
        "[analyze-data] finalPayload preview:",
        JSON.stringify(finalPayload).slice(0, 8000)
      );
    } catch {}

    const finalRespRaw = await callGemini(finalPayload);
    const finalRespTyped = finalRespRaw as GeminiResponse;
    const jsonString =
      finalRespTyped?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonString) {
      console.error("[analyze-data] finalResp:", finalRespRaw);
      throw new Error("Мадэль не вярнула выніку пры канчатковым сінтэзе.");
    }

    let analysisResultRaw: unknown;
    try {
      analysisResultRaw = JSON.parse(jsonString);
    } catch (e) {
      console.error("Failed to parse final analysis JSON:", jsonString, e);
      throw new Error("Мадэль не вярнула карэктны JSON.");
    }

    if (!Array.isArray(analysisResultRaw)) {
      throw new Error("Result is not an array");
    }

    const normalized: TsezkaReportIn[] = (analysisResultRaw as unknown[]).map(
      (obj, idx) => {
        const o = (obj as Record<string, unknown>) ?? {};
        const mainData =
          o.mainData && typeof o.mainData === "object"
            ? (o.mainData as Record<string, unknown>)
            : o.main && typeof o.main === "object"
            ? (o.main as Record<string, unknown>)
            : {};
        const mainFull = getStringField(mainData, "fullName");
        const conclusionRaw =
          o.conclusion ?? o.description ?? o.additionalInfo ?? "";
        const conclusion = ensureString(conclusionRaw).trim() || "N/A";
        const keyBase =
          typeof o.key === "string" && o.key ? o.key : mainFull || `obj-${idx}`;
        const key = encodeURIComponent(String(keyBase).toLowerCase().trim());

        // ensure sources is array of strings
        let sources: string[] = [];
        if (Array.isArray(o.sources)) {
          sources = (o.sources as unknown[])
            .map((s) => ensureString(s))
            .filter(Boolean);
        } else if (typeof o.sources === "string") {
          sources = [o.sources];
        }

        return {
          ...o,
          mainData,
          conclusion,
          sources,
          key,
        } as TsezkaReportIn;
      }
    );

    // persist normalized analysis into dataStore
    await dataStore.updateCase(caseId, {
      analysis: JSON.stringify(normalized),
    });

    return NextResponse.json({
      message: "Аналіз паспяхова завершаны.",
      analysisData: normalized,
    });
  } catch (error) {
    console.error("Памылка ў API analyze-data:", error);
    const msg =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
