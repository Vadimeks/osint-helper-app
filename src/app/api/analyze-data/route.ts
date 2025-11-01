// src/app/api/analyze-data/route.ts

import { NextRequest, NextResponse } from "next/server";
// ❗ ВЫПРАЎЛЕННЕ: Імпарт інстанса dataStore і тыпа SearchQuery
import { dataStore } from "@/lib/dataStore";
import { SearchQuery } from "@/types/osint";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ANALYZE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

/**
 * POST /api/analyze-data
 * Аналізуе сабраныя дадзеныя і захоўвае вынікі аналізу ў JSON-фармаце.
 */
export async function POST(req: NextRequest) {
  try {
    const { caseId } = await req.json();

    if (!caseId) {
      return NextResponse.json(
        { error: "Патрабуецца caseId." },
        { status: 400 }
      );
    }

    // ❗ ВЫПРАЎЛЕННЕ: Выкарыстоўваем dataStore.getCase
    const caseData = dataStore.getCase(caseId);

    if (!caseData || caseData.collectedData.length === 0) {
      return NextResponse.json(
        {
          error: `Сэсія ${caseId} не знойдзена або няма дадзеных для аналізу.`,
        },
        { status: 404 }
      );
    }

    // ❗ ВЫПРАЎЛЕННЕ: Дададзена тыпізацыя 'item: SearchQuery'
    const collectedDataString = caseData.collectedData
      .map(
        (item: SearchQuery) =>
          `- Запыт: "${item.query}", Загаловак: "${item.title}", Змест: "${item.snippet}", URL: ${item.url} [Крыніца: ${item.sourceAPI}]`
      )
      .join("\n");

    const content = `Analyze the following collected data for the task: "${caseData.task}".
        
        --- COLLECTED SOURCES ---
        ${collectedDataString}
        --- END OF SOURCES ---`;

    // ... (СІСТЭМНАЯ ІНСТРУКЦЫЯ застаецца без зменаў)
    const systemInstructionText = `You are a highly qualified OSINT analyst. Your task is to identify and analyze all potential lookalikes (individuals with identical or similar full names) present in the collected data.
For each distinct lookalike identified, you must generate a comprehensive informational report structured strictly as a JSON object, based *only* on the data provided in the sources.

Important:
1.  Separate profiles into distinct objects if they have different TIN/Passport numbers, clear different locations, or conflicting roles (e.g., 'Businessman' vs 'Student').
2.  Aggregate all data points (emails, social media links, job titles, court mentions) under the correct lookalike profile.
3.  The final output MUST BE ONLY a JSON array, conforming strictly to the detailed TsezkaReport interface below.

Output Interface:
interface TsezkaReport {
    description: string; // 1. Brief summary of the lookalike profile.
    mainData: { // 2. Main Data
        fullName: string;
        possibleNicknames: string[];
        dateOfBirth: string; // If found, else 'N/A'
        placeOfBirth: string; // If found, else 'N/A'
        citizenship: string; // If found, else 'N/A'
        photoLink: string; // Best guess if available, else 'N/A'
    };
    contacts: { // 3. Contacts
        email: string[];
        phone: string[];
        residenceAddress: string; // Current or latest known address/region
    };
    socialMedia: { // 4. Social Networks
        VK: string; // Full URL if found, else 'N/A'
        Facebook: string;
        LinkedIn: string;
        Telegram: string;
        other: string[]; // Other relevant platforms (X, Instagram, etc.)
    };
    professionalActivity: { // 5. Professional/Academic Activity
        education: string[];
        workplacePosition: string[]; // List of roles/companies
        legalEntityInvolvement: string[]; // Roles in legal entities (e.g., Founder, CEO)
    };
    mediaMentions: { // 6. Media/Database Mentions
        courtRecords: string[]; // Links or brief description of court cases/bankruptcies
        mediaMentions: string[]; // Brief description of news/media mentions
        dataBreaches: string; // If data breach links or mentions are found, else 'N/A'
        achievements: string[]; // List of notable achievements/awards
    };
    conclusion: string; // 7. Comprehensive final summary and comparison to other lookalikes.
    accuracyAssessment: string; // 8. Overall certainty assessment (HIGH, MEDIUM, LOW) and reasoning.
    additionalInfo: string; // 9. Any other relevant facts not covered above.
    sources: string[]; // 10. A complete list of all URL links used to form this specific report.
}

Return ONLY a JSON array of TsezkaReport objects: [{"description": ...}, {"description": ...}].`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: content }] }],

      systemInstruction: {
        parts: [
          {
            text: systemInstructionText,
          },
        ],
      },

      generationConfig: {
        response_mime_type: "application/json",
      },
    };

    const apiResponse = await fetch(GEMINI_ANALYZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!apiResponse.ok) {
      const errorDetails = await apiResponse.text();
      throw new Error(
        `Памылка Gemini Analyze API: ${apiResponse.status}. ${errorDetails}`
      );
    }

    const result = await apiResponse.json();

    // Атрыманне і парсінг JSON-радка
    const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;

    let analysisResult;
    try {
      // ❗ ВЫПРАЎЛЕННЕ: Памылка ESLint 'e' is defined but never used
      // Мы выкарыстоўваем 'e' у блоку catch для кансольнага вываду,
      // але ў арыгінальным кодзе ён не выкарыстоўваўся. Я пакіну яго як 'e'.
      analysisResult = JSON.parse(jsonString || "[]");
    } catch (e) {
      console.error("Не ўдалося разабраць JSON ад Gemini:", jsonString, e);
      throw new Error("Мадэль не вярнула карэктны JSON для аналізу.");
    }

    // ❗ ВЫПРАЎЛЕННЕ: Выкарыстоўваем dataStore.updateCase
    await dataStore.updateCase(caseId, {
      analysis: JSON.stringify(analysisResult),
    });

    console.log(`[АНАЛІЗ] ✅ Аналіз Case ID ${caseId} завершаны і захаваны.`);

    return NextResponse.json({
      message: "Аналіз паспяхова завершаны.",
      analysisData: analysisResult,
    });
  } catch (error) {
    console.error("Памылка ў API-маршруце analyze-data:", error);
    // ❗ ВЫПРАЎЛЕННЕ: Выпраўленне тыпізацыі 'error'
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json(
      { error: `Памылка сервера: ${errorMessage}` },
      { status: 500 }
    );
  }
}
