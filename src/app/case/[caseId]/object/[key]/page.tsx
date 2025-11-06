//src/app/case/[caseId]/object/[key]/page.tsx
import React from "react";
import { notFound } from "next/navigation";

type Props = { params: { caseId: string; key: string } };

export default async function ObjectDetailPage({ params }: Props) {
  const { caseId, key } = params;
  const resp = await fetch(
    `/api/case-session?caseId=${encodeURIComponent(caseId)}`
  );
  if (!resp.ok) return notFound();
  const caseData = await resp.json();

  let analysis: any[] = [];
  try {
    if (caseData.analysis)
      analysis =
        typeof caseData.analysis === "string"
          ? JSON.parse(caseData.analysis)
          : caseData.analysis;
  } catch {
    analysis = [];
  }

  const normalizedKey = decodeURIComponent(key).toLowerCase().trim();
  const obj = analysis.find((a: any) => {
    const k = (a.key || a.mainData?.fullName || a.main?.fullName || "")
      .toString()
      .toLowerCase()
      .trim();
    return k === normalizedKey;
  });

  if (!obj) {
    return (
      <div className="p-8 bg-gray-900 text-white min-h-screen">
        <h1 className="text-2xl font-bold">Аб'ект не знойдзены</h1>
        <p className="mt-2 text-gray-300">
          Не ўдалося знайсці аналіз для гэтага аб'екта ў сесіі.
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

  const main = obj.mainData || obj.main || {};
  const summary =
    obj.conclusion || obj.description || obj.additionalInfo || "N/A";
  const contacts = obj.contacts || {};
  const sources: string[] = obj.sources || [];

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <header className="mb-6">
        <a
          href={`/case/${encodeURIComponent(caseId)}`}
          className="text-blue-300 underline"
        >
          ← Назад да кейса
        </a>
        <h1 className="text-3xl font-bold mt-3">
          {main?.fullName || "Без імя"}
        </h1>
        <div className="text-sm text-gray-400 mt-2">
          Крыніц: {sources.length} — Ацэнка дакладнасці:{" "}
          {obj.accuracyAssessment || "N/A"}
        </div>
      </header>

      <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 p-4 bg-gray-800 rounded">
          <h2 className="text-xl font-semibold mb-2">Кароткі аналіз</h2>
          <p className="text-gray-200">{summary}</p>

          <h3 className="mt-4 font-semibold">Кантэкст і важныя факты</h3>
          <ul className="list-disc ml-5 mt-2 text-sm text-gray-200">
            {(obj.mediaMentions?.mediaMentions || [])
              .slice(0, 10)
              .map((m: string, i: number) => (
                <li key={i}>{m}</li>
              ))}
            {(!obj.mediaMentions?.mediaMentions ||
              obj.mediaMentions.mediaMentions.length === 0) && (
              <>
                <li>
                  Роля/Прафесія:{" "}
                  {(obj.professionalActivity?.workplacePosition || []).join(
                    "; "
                  ) || "N/A"}
                </li>
                <li>Дата нараджэння: {main?.dateOfBirth || "N/A"}</li>
                <li>Месца нараджэння: {main?.placeOfBirth || "N/A"}</li>
              </>
            )}
          </ul>
        </div>

        <aside className="p-4 bg-gray-800 rounded">
          <h3 className="text-lg font-semibold">Кантакты / Сацыяльныя</h3>
          <div className="text-sm text-gray-200 mt-2">
            <div>
              <strong>E-mail:</strong>{" "}
              {(contacts?.email || []).join(", ") || "N/A"}
            </div>
            <div className="mt-1">
              <strong>Тэлефон:</strong>{" "}
              {(contacts?.phone || []).join(", ") || "N/A"}
            </div>
            <div className="mt-1">
              <strong>Адрас:</strong> {contacts?.residenceAddress || "N/A"}
            </div>
          </div>

          {main?.photoLink && (
            <div className="mt-4">
              <img
                src={main.photoLink}
                alt="photo"
                className="w-full rounded"
              />
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
