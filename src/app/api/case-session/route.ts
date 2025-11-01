// src/app/api/case-session/route.ts

import { NextRequest, NextResponse } from "next/server";
// ❗ ВЫПРАЎЛЕННЕ: Імпартуем інстанс dataStore замест старога метада getCaseData
import { dataStore } from "@/lib/dataStore";

/**
 * GET /api/case-session?caseId=...
 * Вяртае поўную інфармацыю аб існуючай сэсіі (CaseData) для працягу працы.
 */
export async function GET(req: NextRequest) {
  try {
    const caseId = req.nextUrl.searchParams.get("caseId");

    if (!caseId) {
      return NextResponse.json(
        { error: "Патрабуецца caseId для загрузкі сэсіі." },
        { status: 400 }
      );
    }

    // ❗ ВЫПРАЎЛЕННЕ: Выкарыстоўваем dataStore.getCase(caseId)
    const caseData = dataStore.getCase(caseId);

    if (!caseData) {
      return NextResponse.json(
        { error: `Сэсія з Case ID "${caseId}" не знойдзена.` },
        { status: 404 }
      );
    }

    console.log(`[СЭСІЯ]: Загрузка Case ID ${caseId} паспяхова завершана.`);

    // Вяртаем поўны аб'ект caseData
    return NextResponse.json(caseData);
  } catch (error) {
    console.error("Памылка ў API-маршруце case-session:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    return NextResponse.json(
      { error: `Памылка сервера: ${errorMessage}` },
      { status: 500 }
    );
  }
}
