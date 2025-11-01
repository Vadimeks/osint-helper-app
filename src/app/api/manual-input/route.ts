// src/app/api/manual-input/route.ts

import { NextResponse } from "next/server";
import { dataStore } from "@/lib/dataStore";
import { SearchQuery } from "@/types/osint";

/**
 * Захаванне ручных дадзеных у file-based dataStore
 */
export async function POST(request: Request) {
  try {
    const { caseId, name, content, url } = await request.json();

    if (!caseId || typeof caseId !== "string") {
      return NextResponse.json(
        { error: "Патрабуецца сапраўдны ідэнтыфікатар справы (caseId)." },
        { status: 400 }
      );
    }
    if (
      !name ||
      typeof name !== "string" ||
      !content ||
      typeof content !== "string"
    ) {
      return NextResponse.json(
        { error: "Патрабуюцца палі 'Назва' і 'Змест' для ручнога ўводу." },
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

    const entry: SearchQuery = {
      query: "MANUAL_INPUT",
      url:
        url && typeof url === "string" && url.trim().length > 0
          ? url.trim()
          : `manual-input://${caseId}/${Date.now()}`,
      snippet: content,
      title: name,
      sourceAPI: "GEMINI",
      timestamp: new Date().toISOString(),
    };

    const updatedCollectedData = [...caseData.collectedData, entry];

    await dataStore.updateCase(caseId, { collectedData: updatedCollectedData });

    return NextResponse.json({
      success: true,
      message: `Ручны запіс для справы ID: ${caseId} паспяхова захаваны.`,
      data: entry,
    });
  } catch (error) {
    console.error("Памылка ў API-маршруце ручнога ўводу:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json(
      { error: `Памылка сервера: ${errorMessage}` },
      { status: 500 }
    );
  }
}
