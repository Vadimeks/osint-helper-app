// src/app/api/update-queries/route.ts

import { NextRequest, NextResponse } from "next/server";
// ❗ ВЫПРАЎЛЕННЕ: Імпартуем інстанс dataStore замест старога метада updateCaseData
import { dataStore } from "@/lib/dataStore";

/**
 * POST /api/update-queries
 * Абнаўляе спіс generatedQueries для пэўнай справы.
 */
export async function POST(req: NextRequest) {
  try {
    const { caseId, updatedQueries } = await req.json();

    if (
      !caseId ||
      typeof caseId !== "string" ||
      !Array.isArray(updatedQueries)
    ) {
      return NextResponse.json(
        {
          error:
            "Няправільны фармат дадзеных. Патрабуецца caseId (радок) і updatedQueries (масіў).",
        },
        { status: 400 }
      );
    }

    // ❗ ВЫПРАЎЛЕННЕ: Выкарыстоўваем dataStore.updateCase
    await dataStore.updateCase(caseId, { generatedQueries: updatedQueries });

    console.log(
      `[АБНАЎЛЕННЕ]: Спіс запытаў для Case ID ${caseId} паспяхова абноўлены.`
    );

    return NextResponse.json({
      success: true,
      caseId: caseId,
      updatedCount: updatedQueries.length,
    });
  } catch (error) {
    console.error("Памылка ў API-маршруце update-queries:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Невядомая памылка сервера.";
    // Калі caseId не існуе, updateCaseData кіне Error, і мы вернем 500
    return NextResponse.json(
      { error: `Памылка сервера: ${errorMessage}` },
      { status: 500 }
    );
  }
}
