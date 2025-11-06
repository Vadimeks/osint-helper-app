import React from "react";
import { notFound } from "next/navigation";
import { CaseData, AiProfile } from "@/types/osint";

type Props = { params: { caseId: string; key: string } };

function safeParseAnalysis(raw: unknown): AiProfile[] {
  if (!raw) return [];
  // If it's already an array of objects, return as-is (best-effort)
  if (Array.isArray(raw)) {
    return raw as AiProfile[];
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as AiProfile[];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeKeyFromProfile(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "unknown";
  const p = profile as Record<string, unknown>;
  const maybeKey = p["key"];
  if (typeof maybeKey === "string" && maybeKey.trim().length > 0) {
    return maybeKey.toLowerCase().trim();
  }

  const mainData = p["mainData"] as Record<string, unknown> | undefined;
  if (mainData && typeof mainData["fullName"] === "string") {
    return String(mainData["fullName"]).toLowerCase().trim();
  }

  const main = p["main"] as Record<string, unknown> | undefined;
  if (main && typeof main["fullName"] === "string") {
    return String(main["fullName"]).toLowerCase().trim();
  }

  return "unknown";
}

export default async function ObjectDetailPage({ params }: Props) {
  const { caseId, key } = params;

  const resp = await fetch(
    `/api/case-session?caseId=${encodeURIComponent(caseId)}`
  );
  if (!resp.ok) return notFound();

  const caseDataRaw = (await resp.json()) as unknown;
  const caseData = (caseDataRaw as CaseData | null) ?? null;
  if (!caseData) return notFound();

  const analysis = safeParseAnalysis(
    (caseData as unknown as Record<string, unknown>)["analysis"]
  );

  const normalizedKey = decodeURIComponent(key).toLowerCase().trim();

  const obj = analysis.find(
    (a) => normalizeKeyFromProfile(a) === normalizedKey
  );

  if (!obj) {
    return (
      <div className="p-8 bg-gray-900 text-white min-h-screen">
        <h1 className="text-2xl font-bold">Аб&apos;ект не знойдзены</h1>
        <p className="mt-2 text-gray-300">
          Не ўдалося знайсці аналіз для гэтага аб&apos;екта ў сесіі.
        </p>
        <div className="mt-4">
          <a
            href={`/case/${encodeURIComponent(caseId)}`}
            className="text-blue-300 underline"
          >
            ← Назад да кейса
          </a>
        </div>
      </div>
    );
  }

  const main =
    (obj as unknown as Record<string, unknown>)["mainData"] ??
    (obj as unknown as Record<string, unknown>)["main"] ??
    {};
  const mainRec = (main as Record<string, unknown>) || {};
  const summary =
    (obj as unknown as Record<string, unknown>)["conclusion"] ??
    (obj as unknown as Record<string, unknown>)["description"] ??
    (obj as unknown as Record<string, unknown>)["additionalInfo"] ??
    "N/A";

  const contactsRaw = (obj as unknown as Record<string, unknown>)["contacts"];
  const contacts =
    contactsRaw && typeof contactsRaw === "object"
      ? (contactsRaw as Record<string, unknown>)
      : {};

  const sourcesRaw = (obj as unknown as Record<string, unknown>)["sources"];
  const sources = Array.isArray(sourcesRaw) ? (sourcesRaw as string[]) : [];

  const fullName =
    typeof mainRec["fullName"] === "string"
      ? String(mainRec["fullName"])
      : "Без імя";
  const photoLink =
    typeof mainRec["photoLink"] === "string"
      ? String(mainRec["photoLink"])
      : undefined;
  const accuracy =
    (obj as unknown as Record<string, unknown>)["accuracyAssessment"] ?? "N/A";

  const mediaMentionsRaw = (obj as unknown as Record<string, unknown>)[
    "mediaMentions"
  ];
  const mediaMentionsList =
    mediaMentionsRaw &&
    typeof mediaMentionsRaw === "object" &&
    Array.isArray(
      (mediaMentionsRaw as Record<string, unknown>)["mediaMentions"]
    )
      ? ((mediaMentionsRaw as Record<string, unknown>)[
          "mediaMentions"
        ] as string[])
      : [];

  const professionalPositionsRaw = (obj as unknown as Record<string, unknown>)[
    "professionalActivity"
  ];
  const workplacePositions =
    professionalPositionsRaw &&
    typeof professionalPositionsRaw === "object" &&
    Array.isArray(
      (professionalPositionsRaw as Record<string, unknown>)["workplacePosition"]
    )
      ? ((professionalPositionsRaw as Record<string, unknown>)[
          "workplacePosition"
        ] as string[])
      : [];

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <header className="mb-6">
        <a
          href={`/case/${encodeURIComponent(caseId)}`}
          className="text-blue-300 underline"
        >
          ← Назад да кейса
        </a>

        <h1 className="text-3xl font-bold mt-3">{fullName}</h1>

        <div className="text-sm text-gray-400 mt-2">
          Крыніц: {sources.length} — Ацэнка дакладнасці: {String(accuracy)}
        </div>
      </header>

      <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 p-4 bg-gray-800 rounded">
          <h2 className="text-xl font-semibold mb-2">Кароткі аналіз</h2>
          <p className="text-gray-200">{String(summary)}</p>

          <h3 className="mt-4 font-semibold">Кантэкст і важныя факты</h3>
          <ul className="list-disc ml-5 mt-2 text-sm text-gray-200">
            {Array.isArray(mediaMentionsList) &&
              mediaMentionsList
                .slice(0, 10)
                .map((m, i) => <li key={i}>{m}</li>)}

            {(!Array.isArray(mediaMentionsList) ||
              mediaMentionsList.length === 0) && (
              <>
                <li>
                  Роля/Прафесія:{" "}
                  {Array.isArray(workplacePositions)
                    ? workplacePositions.join("; ")
                    : "N/A"}
                </li>
                <li>
                  Дата нараджэння:{" "}
                  {typeof mainRec["dateOfBirth"] === "string"
                    ? String(mainRec["dateOfBirth"])
                    : "N/A"}
                </li>
                <li>
                  Месца нараджэння:{" "}
                  {typeof mainRec["placeOfBirth"] === "string"
                    ? String(mainRec["placeOfBirth"])
                    : "N/A"}
                </li>
              </>
            )}
          </ul>
        </div>

        <aside className="p-4 bg-gray-800 rounded">
          <h3 className="text-lg font-semibold">Кантакты / Сацыяльныя</h3>
          <div className="text-sm text-gray-200 mt-2">
            <div>
              <strong>E-mail:</strong>{" "}
              {contacts && Array.isArray(contacts["email"])
                ? (contacts["email"] as string[]).join(", ")
                : typeof contacts["email"] === "string"
                ? contacts["email"]
                : "N/A"}
            </div>
            <div className="mt-1">
              <strong>Тэлефон:</strong>{" "}
              {contacts && Array.isArray(contacts["phone"])
                ? (contacts["phone"] as string[]).join(", ")
                : typeof contacts["phone"] === "string"
                ? contacts["phone"]
                : "N/A"}
            </div>
            <div className="mt-1">
              <strong>Адрас:</strong>{" "}
              {typeof contacts["residenceAddress"] === "string"
                ? contacts["residenceAddress"]
                : "N/A"}
            </div>
          </div>

          {photoLink && (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoLink} alt="photo" className="w-full rounded" />
            </div>
          )}
        </aside>
      </section>

      <section className="p-4 bg-gray-800 rounded">
        <h3 className="text-xl font-semibold mb-2">Крыніцы</h3>
        <ul className="list-inside list-decimal text-sm text-gray-200">
          {sources.map((s, i) => (
            <li key={i} className="mb-1">
              <a
                href={s}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 underline"
              >
                {s}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
