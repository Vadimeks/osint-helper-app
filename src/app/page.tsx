// src/app/page.tsx
"use client";

import { useState, useCallback } from "react";
import TableComponent from "@/app/components/TableComponent";
import { Tsezka, AiProfile, CaseData, SearchQuery } from "@/types/osint";

// --- ІНТЭРФЕЙСЫ ДЛЯ ЛАКАЛЬНАГА ВЫКАРЫСТАННЯ ---
interface GeneratedVariants {
  nameVariants: string[];
  emailVariants: string[];
  usernameVariants: string[];
}
type ApiError = { error?: string; message?: string };

// --- УТЫЛІТЫ: ВЫКЛІКІ API ---

const getErrorMessage = (error: unknown, defaultMsg: string): string => {
  return error instanceof Error ? error.message : defaultMsg;
};

// Правільная адпраўка fullName у generate-variants
async function generateVariants(fullName: string): Promise<GeneratedVariants> {
  const response = await fetch("/api/generate-variants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Памылка генерацыі варыянтаў: ${err}`);
  }
  return response.json();
}

// Правільная адпраўка толькі task у generate-queries (сервер стварае caseId)
async function generateQueries(
  task: string
): Promise<{ caseId: string; queries: string[] }> {
  const response = await fetch("/api/generate-queries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Памылка генерацыі запытаў: ${err}`);
  }
  return response.json();
}

// Правільная адпраўка поля searchQuery і optional specializedSources у collect-data
async function collectData(
  caseId: string,
  searchQuery: string,
  specializedSources?: string[] // optional list of specialized sources
): Promise<number> {
  const body: Record<string, unknown> = { caseId, searchQuery };
  if (specializedSources && specializedSources.length > 0) {
    body.specializedSources = specializedSources;
  }

  const response = await fetch("/api/collect-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Памылка збору дадзеных: ${errText}`);
  }
  const result = await response.json();
  return result.collectedCount || 0;
}

async function analyzeData(caseId: string): Promise<AiProfile[]> {
  const response = await fetch("/api/analyze-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId }),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(
      error.error || error.message || "Не атрымалася прааналізаваць дадзеныя."
    );
  }

  const result = await response.json();
  let profiles: AiProfile[];

  if (result.analysisData && Array.isArray(result.analysisData)) {
    profiles = result.analysisData as AiProfile[];
  } else if (typeof result.analysis === "string") {
    try {
      profiles = JSON.parse(result.analysis) as AiProfile[];
    } catch {
      throw new Error("Аналіз AI вярнуў некарэктны фармат JSON.");
    }
  } else {
    throw new Error("Аналіз не вярнуў масіў профіляў.");
  }

  return profiles;
}

async function getFullCaseData(caseId: string): Promise<CaseData | null> {
  const response = await fetch(`/api/case-session?caseId=${caseId}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Не атрымалася атрымаць поўныя дадзеныя сэсіі.");
  }
  return response.json() as Promise<CaseData>;
}

// --- НЕКАТОРЫЯ УТЫЛІТЫ ---
const isQueryValid = (q: unknown): q is string =>
  typeof q === "string" &&
  q.trim().length > 0 &&
  q.toLowerCase() !== "undefined";

const uniqueArray = (arr: string[]) =>
  Array.from(new Set(arr.map((s) => s.trim()).filter((s) => s.length > 0)));

// --- НОВАЯ ФУНКЦЫЯ: Пераўтварэнне з AiProfile ў Tsezka ---
const transformToTsezka = (profiles: AiProfile[]): Tsezka[] => {
  return profiles.map((profile) => ({
    name: profile.mainData?.fullName || "Няма імя",
    region: profile.contacts?.residenceAddress || "Невядомы рэгіён",
    activity:
      (profile.professionalActivity?.workplacePosition || []).join(", ") ||
      "Няма дзейнасці",
    certainty: `${profile.accuracyAssessment || "N/A"}. ${
      profile.conclusion || ""
    }`,
    url:
      profile.sources && profile.sources.length > 0 ? profile.sources[0] : "#",
  }));
};

// --- КАМПАНЕНТЫ І ЛОГІКА ---

export default function OsintHelperApp() {
  const [task, setTask] = useState("");
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AiProfile[] | null>(
    null
  );
  const [collectedCount, setCollectedCount] = useState(0);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullCase, setFullCase] = useState<CaseData | null>(null);
  const [loadCaseIdInput, setLoadCaseIdInput] = useState<string>("");
  const [generatedVariants, setGeneratedVariants] =
    useState<GeneratedVariants | null>(null);
  // Новае: спецыялізаваныя крыніцы (ўвод карыстальнікам: па радках або праз коскі)
  const [specializedSourcesText, setSpecializedSourcesText] =
    useState<string>("");

  const isIdle = loadingState === null;
  const isReadyForCollection = Boolean(currentCaseId && queries.length > 0);
  const isReadyForAnalysis = Boolean(
    currentCaseId && collectedCount > 0 && isIdle
  );

  // --- E. Аднаўленне стану і прагляд сэсіі ---
  // Заўвага: НЕ аўтавыклікаем handleViewCase пры загрузцы старонкі.
  // Карыстальнік павінен уручную загрузіць кейс або стварыць новы.
  const handleViewCase = useCallback(async (caseIdToLoad: string) => {
    if (!caseIdToLoad || caseIdToLoad.trim().length === 0) return;
    setError(null);
    setLoadingState("Загрузка сэсіі...");

    try {
      const data = await getFullCaseData(caseIdToLoad);

      if (data) {
        setCurrentCaseId(caseIdToLoad);
        // persist current case id for convenience (but НЕ аўта-лагін)
        if (typeof window !== "undefined") {
          localStorage.setItem("currentCaseId", caseIdToLoad);
        }

        setFullCase(data);
        setTask(data.task);
        setQueries(data.generatedQueries || []);
        setCollectedCount(data.collectedData?.length || 0);

        if (data.analysis) {
          try {
            setAnalysisResult(JSON.parse(data.analysis) as AiProfile[]);
          } catch {
            setAnalysisResult(null);
          }
        } else {
          setAnalysisResult(null);
        }

        setGeneratedVariants(null);
        setLoadCaseIdInput("");
      } else {
        // паказваем паведамленне толькі калі карыстальнік РУЧНО спрабаваў загрузіць кейс
        setError(`Кейс ID ${caseIdToLoad} не знойдзены.`);
        setCurrentCaseId(null);
        setFullCase(null);
      }
    } catch (e: unknown) {
      setError(
        getErrorMessage(
          e,
          "Памылка аднаўлення стану сэсіі. Паспрабуйце яшчэ раз."
        )
      );
      setFullCase(null);
    } finally {
      setLoadingState(null);
    }
  }, []);

  // --- A. Асноўны запуск: Генерацыя запытаў і стварэнне сэсіі ---
  const handleStartCase = useCallback(async () => {
    if (!task.trim()) {
      setError("Калі ласка, увядзіце задачу.");
      return;
    }

    setError(null);
    setAnalysisResult(null);
    setCollectedCount(0);
    setQueries([]);
    setGeneratedVariants(null);
    setFullCase(null);

    try {
      setLoadingState("Генерацыя першасных запытаў...");
      const { caseId: newCaseId } = await generateQueries(task);

      // аўтаматычная загрузка створанага кейса у UI
      await handleViewCase(newCaseId);

      setLoadingState(
        `✅ Новы кейс ID ${newCaseId} створаны. Гатова да збору дадзеных.`
      );
      setTimeout(() => setLoadingState(null), 2000);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Памылка генерацыі запытаў."));
      setCurrentCaseId(null);
    } finally {
      setLoadingState(null);
    }
  }, [task, handleViewCase]);

  // B. Генерацыя дадатковых варыянтаў
  const handleGenerateVariants = useCallback(async () => {
    if (!task.trim()) {
      setError("Калі ласка, увядзіце імя/задачу для генерацыі варыянтаў.");
      return;
    }

    setError(null);
    try {
      setLoadingState("Генерацыя варыянтаў імёнаў і нікнэймаў...");
      const variants = await generateVariants(task);
      setGeneratedVariants(variants);

      // аўтаматычна дадаём новыя nameVariants у спіс queries (і робім унікальнымі)
      const cleanedNew = (variants.nameVariants || []).filter(isQueryValid);
      setQueries((prev) => uniqueArray([...prev, ...cleanedNew]));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Памылка генерацыі варыянтаў."));
    } finally {
      setLoadingState(null);
    }
  }, [task]);

  // C. Збор дадзеных — асноўны flow з падтрымкай спецыялізаваных крыніц
  const handleCollectAll = useCallback(async () => {
    if (!currentCaseId || queries.length === 0) {
      setError("Няма кейса або няма запытаў для збору.");
      return;
    }

    setError(null);
    let totalCollected = 0;

    // парсим specializedSourcesText у масіў крыніц
    const specializedSources = specializedSourcesText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      setLoadingState(`Пачатак збору дадзеных па ${queries.length} запытах...`);

      for (const query of queries) {
        setLoadingState(`Збор: ${query.substring(0, 100)}...`);
        const collectedCountForQuery = await collectData(
          currentCaseId,
          query,
          specializedSources.length > 0 ? specializedSources : undefined
        );
        totalCollected += collectedCountForQuery;
      }

      const updatedCase = await getFullCaseData(currentCaseId);
      if (updatedCase) {
        setCollectedCount(updatedCase.collectedData.length);
        setFullCase(updatedCase);
      }

      setLoadingState(null);
      alert(`Збор завершаны! Дададзена ${totalCollected} новых крыніц.`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Памылка збору дадзеных."));
    } finally {
      setLoadingState(null);
    }
  }, [currentCaseId, queries, specializedSourcesText]);

  // --- D. Запуск аналізу ---
  const handleAnalyze = useCallback(async () => {
    if (!currentCaseId || collectedCount === 0) {
      setError("Немагчыма пачаць аналіз: няма сабраных дадзеных.");
      return;
    }

    setError(null);
    try {
      setLoadingState("Выкананне OSINT-аналізу... (можа заняць да 2-х хвілін)");
      const analysisProfiles = await analyzeData(currentCaseId);
      setAnalysisResult(analysisProfiles);

      // абнаўляем кейс з backend пасля аналізу
      const updatedCase = await getFullCaseData(currentCaseId);
      if (updatedCase) {
        setFullCase(updatedCase);
      }

      setLoadingState(null);
      alert("Аналіз завершаны! Вынікі даступныя ніжэй.");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Памылка аналізу дадзеных."));
      setLoadingState(null);
    }
  }, [currentCaseId, collectedCount]);

  // дап. дапаможная функцыя: спрошчанае зліццё/дэдуп па fullName
  function dedupeProfiles(profiles: AiProfile[]) {
    const map = new Map<string, AiProfile[]>();
    for (const p of profiles) {
      const key = (p.mainData?.fullName || "unknown").toLowerCase().trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([k, arr]) => {
      const main = arr[0].mainData;
      const combinedSources = uniqueArray(arr.flatMap((x) => x.sources || []));
      const combinedContacts = {
        ...arr[0].contacts,
      };
      return {
        key: k,
        count: arr.length,
        main,
        contacts: combinedContacts,
        sources: combinedSources,
        professionalActivity: arr.flatMap(
          (x) => x.professionalActivity?.workplacePosition || []
        ),
        conclusion: arr.map((x) => x.conclusion).join(" | "),
        accuracyAssessment: arr[0].accuracyAssessment || "N/A",
      };
    });
  }

  const deduped = analysisResult ? dedupeProfiles(analysisResult) : [];

  // --- ВІЗУАЛІЗАЦЫЯ: ОСНОВНЫ КАМПАНЕНТ ---

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-teal-400">OSINT Helper App</h1>
      </header>

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Status */}
        {(loadingState || error) && (
          <div
            className={`p-3 rounded-md ${
              error ? "bg-red-900 text-red-200" : "bg-blue-900 text-blue-200"
            }`}
          >
            {error ? <div>❌ {error}</div> : <div>🔄 {loadingState}</div>}
          </div>
        )}

        {/* 1. Увод задачы / Стварэнне або загрузка кейса */}
        <section className="bg-gray-800 p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-3">
            1. Стварэнне / Загрузка Справы
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <textarea
              className="md:col-span-2 p-3 bg-gray-700 border border-gray-600 rounded text-white"
              rows={2}
              placeholder={
                "Апішыце задачу / імя для пошуку (напрыклад: Медведев Sergey Викторович, былы дырэктар ТАА &apos;Прагрэс&apos;)"
              } // escaped apostrophes
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={loadingState !== null}
            />
            <div className="space-y-2">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={loadCaseIdInput}
                  onChange={(e) => setLoadCaseIdInput(e.target.value)}
                  placeholder="Case ID (уручную)"
                  className="flex-grow p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                <button
                  onClick={() => handleViewCase(loadCaseIdInput)}
                  className="px-3 py-2 bg-gray-600 rounded"
                >
                  Загрузіць
                </button>
              </div>
              <button
                onClick={handleStartCase}
                className="w-full px-3 py-2 bg-teal-600 rounded font-medium"
              >
                Стварыць Новую Справу
              </button>
            </div>
          </div>

          {/* Паказваем паўнату Case ID і task калі кейс загружаны */}
          {currentCaseId && fullCase && (
            <div className="mt-3 p-3 bg-gray-700 rounded">
              <div className="text-sm text-gray-300">
                <strong>Case ID:</strong>{" "}
                <span className="text-green-300 break-all">
                  {currentCaseId}
                </span>
              </div>
              <div className="text-sm text-gray-300 mt-1">
                <strong>Задача:</strong> {fullCase.task}
              </div>
            </div>
          )}
        </section>

        {/* 2. Рэдагаванне запытаў */}
        <section className="bg-gray-800 p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-3">
            2. Рэдагаванне і Збор Запытаў
          </h2>

          <div className="mb-2">
            <button
              onClick={handleGenerateVariants}
              disabled={!isIdle}
              className="px-3 py-2 bg-indigo-600 rounded mr-2"
            >
              Згенераваць Варыянты
            </button>
            <button
              onClick={() => {
                setGeneratedVariants(null);
              }}
              className="px-3 py-2 bg-gray-600 rounded"
            >
              Ачысціць Варыянты
            </button>
          </div>

          <label className="block text-sm mb-1 text-gray-300">
            Рэдагуйце запыты (кожны з новага радка)
          </label>
          <textarea
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-white mb-3"
            rows={6}
            value={queries.join("\n")}
            onChange={(e) =>
              setQueries(
                e.target.value
                  .split("\n")
                  .map((q) => q.trim())
                  .filter((q) => q.length > 0)
              )
            }
          />

          {generatedVariants && (
            <div className="mb-3 p-3 bg-gray-700 rounded">
              <strong className="text-yellow-300">
                Згенераваныя варыянты (аўтаматычна дададзеныя):
              </strong>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-sm text-gray-300">Name Variants</div>
                  <ul className="list-disc ml-5 text-sm text-gray-200">
                    {generatedVariants.nameVariants.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-sm text-gray-300">Email Variants</div>
                  <ul className="list-disc ml-5 text-sm text-gray-200">
                    {generatedVariants.emailVariants.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-sm text-gray-300">Usernames</div>
                  <ul className="list-disc ml-5 text-sm text-gray-200">
                    {generatedVariants.usernameVariants.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Спецыялізаваны пошук */}
          <div className="mb-3">
            <label className="block text-sm mb-1 text-gray-300">
              Спецыялізаваны пошук (крыніцы: па радках або праз коскі)
            </label>
            <textarea
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
              rows={2}
              placeholder="Напрыклад: site:rosreestr.ru, site:zakupki.gov.ru або rosreestr.ru"
              value={specializedSourcesText}
              onChange={(e) => setSpecializedSourcesText(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Калі ўвесці крыніцы — пошук па гэтых крыніцах будзе выконвацца
              разам з асноўным пошукам.
            </p>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleCollectAll}
              disabled={!isReadyForCollection || !isIdle}
              className="px-4 py-2 bg-green-600 rounded"
            >
              Запусціць Збор ({queries.length} запытаў)
            </button>
            <button
              onClick={() => {
                setQueries([]);
                setGeneratedVariants(null);
              }}
              className="px-4 py-2 bg-gray-600 rounded"
            >
              Ачысціць Запыты
            </button>
          </div>
        </section>

        {/* 3. Аналіз */}
        <section className="bg-gray-800 p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-3">3. Аналіз</h2>
          <div className="mb-3 text-sm text-gray-300">
            Сабраных крыніц:{" "}
            <strong className="text-green-300">{collectedCount}</strong>
          </div>
          <div className="flex space-x-2 mb-4">
            <button
              onClick={handleAnalyze}
              disabled={!isReadyForAnalysis}
              className="px-4 py-2 bg-teal-600 rounded"
            >
              Запусціць Аналіз
            </button>
          </div>

          {/* Агляд аб'яднаных профіляў (дэ-дауп) */}
          {deduped.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-teal-300">
                Знойдзеныя Абекты (агрэгацыя)
              </h3>
              {deduped.map((d, idx) => (
                <div key={idx} className="p-3 bg-gray-700 rounded">
                  <div className="flex justify-between">
                    <div>
                      <div className="font-bold text-yellow-300">
                        {d.main?.fullName || "Без імя"}
                      </div>
                      <div className="text-sm text-gray-400">
                        Крыніц: {d.sources.length} • Прывязак: {d.count}
                      </div>
                    </div>
                    <div className="text-sm text-gray-300">
                      Супадзенне:{" "}
                      {Math.min(
                        100,
                        Math.round(
                          (d.sources.length / Math.max(1, collectedCount)) * 100
                        )
                      )}
                      %
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-200">
                    <div>
                      <strong>Асноўныя Дадзеныя:</strong>
                      <div>Поўнае імя: {d.main?.fullName || "N/A"}</div>
                      <div>
                        Псеўданімы:{" "}
                        {(d.main?.possibleNicknames || []).join(", ") || "N/A"}
                      </div>
                      <div>Дата нараджэння: {d.main?.dateOfBirth || "N/A"}</div>
                      <div>
                        Месца нараджэння: {d.main?.placeOfBirth || "N/A"}
                      </div>
                      <div>Грамадзянства: {d.main?.citizenship || "N/A"}</div>
                    </div>
                    <div>
                      <strong>Кантакты / Сацыяльныя сеткі:</strong>
                      <div>
                        E-mail: {(d.contacts?.email || []).join(", ") || "N/A"}
                      </div>
                      <div>
                        Тэлефон: {(d.contacts?.phone || []).join(", ") || "N/A"}
                      </div>
                      <div>
                        Адрас пражывання:{" "}
                        {d.contacts?.residenceAddress || "N/A"}
                      </div>
                      <div>
                        VK / LinkedIn / Telegram:{" "}
                        {(d.sources || []).slice(0, 5).join(", ") || "N/A"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-gray-300">
                    <strong>Высновы:</strong>
                    <div>{d.conclusion || "N/A"}</div>
                  </div>

                  <div className="mt-2">
                    <strong>Крыніцы (абмежаваны прэвю):</strong>
                    <ul className="list-disc ml-5 text-sm text-gray-200">
                      {d.sources.slice(0, 6).map((s, i) => (
                        <li key={i}>
                          <a
                            href={s}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-300 underline break-all"
                          >
                            {s}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. Табліца цёзак (кароткая) */}
        {transformToTsezka.length > 0 && (
          <section className="bg-gray-800 p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-semibold mb-3">
              Вынік Аналізу (Кароткая Табліца)
            </h2>
            <TableComponent tsezki={transformToTsezka(analysisResult || [])} />
          </section>
        )}

        {/* 5. Сырыя дадзеныя кейса */}
        {fullCase && (
          <section className="bg-gray-800 p-6 rounded-xl shadow-md">
            <h3 className="text-lg font-semibold text-white mb-3">
              Сырыя дадзеныя кейса
            </h3>
            <div className="max-h-64 overflow-auto bg-gray-700 p-3 rounded text-sm text-gray-200 whitespace-pre-wrap">
              {fullCase.collectedData.map((d: SearchQuery, i: number) => (
                <div key={i} className="mb-4 border-b border-gray-600 pb-2">
                  <div className="text-xs text-gray-400">
                    #{i + 1} — {d.title} —{" "}
                    <a
                      href={d.url}
                      className="text-blue-300 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.url}
                    </a>
                  </div>
                  <div className="mt-1 text-gray-200">{d.snippet}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="mt-10 text-center text-gray-500 text-sm">
        <p>Пабудавана на Next.js, Gemini API, Custom Search API.</p>
        <p>Кейсы захоўваюцца ў тэчцы data/cases.</p>
      </footer>
    </div>
  );
}
