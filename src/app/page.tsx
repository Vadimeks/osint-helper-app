// src/app/page.tsx
"use client";

import { useState, useCallback } from "react";
import SpecializedSources from "@/app/components/SpecializedSources";
import { Tsezka, AiProfile, CaseData, SearchQuery } from "@/types/osint";
import { fetchJson } from "@/lib/http"; // typed wrapper

// Local types
interface GeneratedVariants {
  nameVariants: string[];
  emailVariants: string[];
  usernameVariants: string[];
}

// Helpers
const getErrorMessage = (error: unknown, defaultMsg = "Невядомая памылка") =>
  error instanceof Error ? error.message : defaultMsg;

const uniqueArray = (arr: string[]) =>
  Array.from(new Set(arr.map((s) => s.trim()).filter((s) => s.length > 0)));

const transformToTsezka = (profiles: AiProfile[]): Tsezka[] =>
  profiles.map((profile) => ({
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

// API wrappers (use fetchJson wrapper)
async function generateVariants(fullName: string): Promise<GeneratedVariants> {
  return fetchJson<GeneratedVariants>("/api/generate-variants", {
    method: "POST",
    body: { fullName },
  });
}

async function generateQueries(
  task: string
): Promise<{ caseId: string; queries: string[] }> {
  return fetchJson<{ caseId: string; queries: string[] }>(
    "/api/generate-queries",
    {
      method: "POST",
      body: { task },
    }
  );
}

async function collectData(
  caseId: string,
  searchQuery: string,
  specializedSources?: string[]
): Promise<{
  entriesCount: number;
  collectedCount: number;
  processedResults?: number;
  sourceUsed?: string;
}> {
  return fetchJson<{
    entriesCount: number;
    collectedCount: number;
    processedResults?: number;
    sourceUsed?: string;
  }>("/api/collect-data", {
    method: "POST",
    body: { caseId, searchQuery, specializedSources },
  });
}

// IMPORTANT: analyzeData uses an extended timeout (timeoutMs) because analysis can be long
type AnalyzeResp =
  | {
      analysisData?: AiProfile[];
      analysis?: string;
      error?: string;
    }
  | AiProfile[]
  | null;

async function analyzeData(caseId: string): Promise<AiProfile[]> {
  const resp = await fetchJson<AnalyzeResp>("/api/analyze-data", {
    method: "POST",
    body: { caseId },
    timeoutMs: 120000,
  });

  if (!resp) return [];

  if (Array.isArray(resp)) return resp as AiProfile[];

  if (resp.error) throw new Error(resp.error);
  if (Array.isArray(resp.analysisData)) return resp.analysisData!;
  if (typeof resp.analysis === "string") {
    try {
      const parsed = JSON.parse(resp.analysis);
      if (Array.isArray(parsed)) return parsed as AiProfile[];
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getFullCaseData(caseId: string): Promise<CaseData | null> {
  return fetchJson<CaseData | null>(
    `/api/case-session?caseId=${encodeURIComponent(caseId)}`
  );
}

// Configurable batch/concurrency
const QUERIES_BATCH_SIZE = 10; // split into parts of 10
const COLLECT_CONCURRENCY = 3; // how many concurrent collectData calls within a batch

export default function OsintHelperApp() {
  const [task, setTask] = useState("");
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [generatedVariants, setGeneratedVariants] =
    useState<GeneratedVariants | null>(null);
  const [specializedSources, setSpecializedSources] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AiProfile[] | null>(
    null
  );
  const [fullCase, setFullCase] = useState<CaseData | null>(null);
  const [collectedCount, setCollectedCount] = useState<number>(0);
  const [processedTotal, setProcessedTotal] = useState<number | null>(null);
  const [addedTotal, setAddedTotal] = useState<number | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // batch progress state
  const [batchIndex, setBatchIndex] = useState<number | null>(null); // current batch (0-based)
  const [totalBatches, setTotalBatches] = useState<number | null>(null);

  const isIdle = loadingState === null;
  const isReadyForCollection = Boolean(currentCaseId && queries.length > 0);
  const isReadyForAnalysis = Boolean(
    currentCaseId && collectedCount > 0 && isIdle
  );

  // Create case and load it
  const handleStartCase = useCallback(async () => {
    if (!task.trim()) {
      setError("Калі ласка, увядзіце задачу.");
      return;
    }
    setError(null);
    setLoadingState("Генерацыя першасных запытаў...");
    try {
      const { caseId, queries: gen } = await generateQueries(task);
      setCurrentCaseId(caseId);
      setQueries(uniqueArray([...(gen || [])]));
      const data = await getFullCaseData(caseId);
      if (data) {
        setFullCase(data);
        setCollectedCount(data.collectedData?.length || 0);
      }
      setGeneratedVariants(null);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Памылка генерацыі запытаў."));
    } finally {
      setLoadingState(null);
    }
  }, [task]);

  // Variant B: generate variants only previews them
  const handleGenerateVariants = useCallback(async () => {
    if (!task.trim()) {
      setError("Калі ласка, увядзіце імя/задачу для генерацыі варыянтаў.");
      return;
    }
    setError(null);
    setLoadingState("Генерацыя варыянтаў...");
    try {
      const variants = await generateVariants(task);
      setGeneratedVariants(variants);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Памылка генерацыі варыянтаў."));
    } finally {
      setLoadingState(null);
    }
  }, [task]);

  const addGeneratedVariantsToQueries = useCallback(() => {
    if (!generatedVariants) return;
    const cleaned = (generatedVariants.nameVariants || []).filter(
      (q) => typeof q === "string" && q.trim()
    );
    setQueries((prev) => uniqueArray([...prev, ...cleaned]));
  }, [generatedVariants]);

  const addEmptyQuery = useCallback(() => setQueries((p) => [...p, ""]), []);

  // helper: run limited concurrency workers over an array of tasks (simple)
  // typed to return array of R | undefined
  async function runWithConcurrency<T, R>(
    items: T[],
    worker: (it: T, idx: number) => Promise<R>,
    concurrency = 3
  ): Promise<(R | undefined)[]> {
    const results: (R | undefined)[] = [];
    let i = 0;
    async function runner() {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        try {
          const r = await worker(items[idx], idx);
          results[idx] = r;
        } catch {
          // on error store undefined
          results[idx] = undefined;
        }
      }
    }
    const workers = Array.from({ length: Math.max(1, concurrency) }).map(() =>
      runner()
    );
    await Promise.all(workers);
    return results;
  }

  // Collect flow: split queries into batches of QUERIES_BATCH_SIZE and process each batch sequentially.
  // Within a batch we use limited concurrency (COLLECT_CONCURRENCY) to avoid overwhelming CS API.
  const handleCollectAll = useCallback(async () => {
    if (!currentCaseId || queries.length === 0) {
      setError("Няма кейса або няма запытаў для збору.");
      return;
    }

    setError(null);
    setProcessedTotal(0);
    setAddedTotal(0);

    const total = queries.length;
    const batches: string[][] = [];
    for (let i = 0; i < total; i += QUERIES_BATCH_SIZE) {
      batches.push(queries.slice(i, i + QUERIES_BATCH_SIZE));
    }

    setTotalBatches(batches.length);
    setBatchIndex(0);
    setLoadingState(`Збор: 0/${batches.length} партый`); // initial

    let processedAcc = 0;
    let addedAcc = 0;

    try {
      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        setBatchIndex(bi);
        setLoadingState(
          `Збор партыі ${bi + 1}/${batches.length} (${batch.length} запытаў)...`
        );

        // Worker function for an individual query
        const worker = async (q: string) => {
          const resp = await collectData(
            currentCaseId!,
            q,
            specializedSources.length ? specializedSources : undefined
          );
          return resp;
        };

        // Execute batch with limited concurrency
        type CollectResp = Awaited<ReturnType<typeof collectData>>;
        const results = await runWithConcurrency<string, CollectResp>(
          batch,
          worker,
          COLLECT_CONCURRENCY
        );

        // Aggregate results for the batch
        for (const res of results) {
          if (!res) continue;
          const entries = Number(res.entriesCount ?? 0);
          const processed = Number(res.processedResults ?? 0);
          addedAcc += entries;
          processedAcc += processed;
        }

        // update authoritative fullCase after each batch (so UI shows growing data)
        const data = await getFullCaseData(currentCaseId);
        setFullCase(data);
        const authoritativeTotal = data ? data.collectedData.length : 0;
        setCollectedCount(authoritativeTotal);

        setProcessedTotal(processedAcc || null);
        setAddedTotal(addedAcc || null);

        // small delay between batches to reduce burst traffic (optional tweak)
        await new Promise((r) => setTimeout(r, 250));
      }

      setLoadingState(null);
      setBatchIndex(null);
      setTotalBatches(null);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Памылка збору дадзеных."));
      setLoadingState(null);
      setBatchIndex(null);
      setTotalBatches(null);
    }
  }, [currentCaseId, queries, specializedSources]);

  // Analyze
  const handleAnalyze = useCallback(async () => {
    console.log("[UI] handleAnalyze clicked", {
      currentCaseId,
      collectedCount,
      fullCase,
    });
    if (!currentCaseId) {
      setError("Немагчыма пачаць аналіз: ID сесіі не ўсталяваны.");
      return;
    }

    const hasCollectedLocal = Boolean(
      (fullCase &&
        Array.isArray(fullCase.collectedData) &&
        fullCase.collectedData.length > 0) ||
        collectedCount > 0
    );
    console.log("[UI] hasCollectedLocal:", hasCollectedLocal);
    if (!hasCollectedLocal) {
      try {
        setLoadingState("Праверка сесіі перад аналізам...");
        const serverCase = await getFullCaseData(currentCaseId);
        console.log("[UI] serverCase:", serverCase);
        if (
          !serverCase ||
          !Array.isArray(serverCase.collectedData) ||
          serverCase.collectedData.length === 0
        ) {
          setError(
            "Сэсія не мае сабраных дадзеных для аналізу. Пераканайцеся, што збор завершаны."
          );
          setLoadingState(null);
          return;
        }
        setFullCase(serverCase);
        setCollectedCount(serverCase.collectedData.length || 0);
      } catch (e) {
        console.error("[UI] памылка пры загрузцы сесіі перад аналізам:", e);
        setError(getErrorMessage(e, "Памылка праверкі сесіі перад аналізам."));
        setLoadingState(null);
        return;
      } finally {
        setLoadingState(null);
      }
    }

    setError(null);
    setLoadingState("Запускаю аналіз (можа заняць час)...");
    try {
      console.log("[UI] POST /api/analyze-data caseId=", currentCaseId);
      const profiles = await analyzeData(currentCaseId);
      console.log("[UI] analyzeData response", profiles);
      setAnalysisResult(profiles || []);
      const data = await getFullCaseData(currentCaseId);
      setFullCase(data);
      setLoadingState(null);
    } catch (e) {
      console.error("[UI] Памылка analyzeData:", e);
      setError(getErrorMessage(e, "Памылка аналізу дадзеных."));
      setLoadingState(null);
    }
  }, [currentCaseId, collectedCount, fullCase]);

  // Dedup/aggregation helper
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
      return {
        key: k,
        count: arr.length,
        main,
        sources: combinedSources,
        contacts: arr[0].contacts,
        conclusion: arr.map((x) => x.conclusion).join(" | "),
        accuracyAssessment: arr[0].accuracyAssessment || "N/A",
      };
    });
  }

  const deduped = analysisResult ? dedupeProfiles(analysisResult) : [];

  // Render
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-teal-400">OSINT Helper App</h1>
      </header>

      <div className="max-w-5xl mx-auto space-y-6">
        {(loadingState || error) && (
          <div
            className={`p-3 rounded-md ${
              error ? "bg-red-900 text-red-200" : "bg-blue-900 text-blue-200"
            }`}
          >
            {error ? <div>❌ {error}</div> : <div>🔄 {loadingState}</div>}
          </div>
        )}

        {/* 1. Create / Load Case */}
        <section className="bg-gray-800 p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-3">
            1. Стварэнне / Загрузка Справы
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <textarea
              className="md:col-span-2 p-3 bg-gray-700 border border-gray-600 rounded text-white"
              rows={2}
              placeholder={
                "Апішыце задачу / імя для пошуку (напрыклад: Медведev Sergey Viktorovich, былы дырэктар ТАА Прагрэс)"
              }
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={!isIdle}
            />
            <div className="space-y-2">
              <button
                onClick={handleStartCase}
                disabled={!isIdle || !task.trim()}
                className="w-full px-3 py-2 bg-teal-600 rounded font-medium"
              >
                Стварыць Новую Справу
              </button>
              <div>
                <input
                  type="text"
                  placeholder="Case ID (урычную)"
                  className="w-full p-2 mt-2 bg-gray-700 border border-gray-600 rounded text-white"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const target = e.target as HTMLInputElement;
                      const id = target.value.trim();
                      if (!id) return;
                      setLoadingState("Загрузка сэсіі...");
                      try {
                        const data = await getFullCaseData(id);
                        if (data) {
                          setCurrentCaseId(id);
                          setFullCase(data);
                          setCollectedCount(data.collectedData.length || 0);
                          setQueries(data.generatedQueries || []);
                          setAnalysisResult(
                            data.analysis ? JSON.parse(data.analysis) : null
                          );
                        } else {
                          setError(`Кейс ID ${id} не знойдзены.`);
                        }
                      } catch (err) {
                        setError(
                          getErrorMessage(err, "Памылка загрузкі кейса.")
                        );
                      } finally {
                        setLoadingState(null);
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

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

        {/* 2. Queries and SpecializedSources */}
        <section className="bg-gray-800 p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-3">
            2. Рэдагаванне і Збор Запытаў
          </h2>

          <div className="mb-3 flex space-x-2">
            <button
              onClick={addEmptyQuery}
              className="px-3 py-2 bg-yellow-600 rounded"
            >
              Дадаць пусты запыт
            </button>
            <button
              onClick={handleGenerateVariants}
              className="px-3 py-2 bg-indigo-600 rounded"
            >
              Згенераваць Варыянты
            </button>
            <button
              onClick={addGeneratedVariantsToQueries}
              className="px-3 py-2 bg-indigo-500 rounded"
            >
              Дадаць зген. варыянты
            </button>
            <button
              onClick={() => {
                setQueries([]);
                setGeneratedVariants(null);
              }}
              className="px-3 py-2 bg-gray-600 rounded"
            >
              Ачысціць усе
            </button>
          </div>

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
                Згенераваныя варыянты (папярэдні прагляд):
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SpecializedSources
              selected={specializedSources}
              onChange={setSpecializedSources}
            />
            <div className="flex items-end">
              <div className="w-full">
                <button
                  onClick={handleCollectAll}
                  disabled={!isReadyForCollection || !isIdle}
                  className="px-4 py-2 bg-green-600 rounded w-full"
                >
                  Запусціць Збор ({queries.length})
                </button>
                {totalBatches !== null && batchIndex !== null && (
                  <div className="text-xs text-gray-400 mt-2">
                    Партыя {batchIndex + 1} з {totalBatches}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Raw sources */}
        {fullCase &&
          fullCase.collectedData &&
          fullCase.collectedData.length > 0 && (
            <section className="bg-gray-800 p-6 rounded-xl shadow-md">
              <h3 className="text-lg font-semibold text-white mb-3">
                Сырыя дадзеныя кейса (агульна)
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
              <div className="mt-3 text-sm text-gray-300">
                <div>Апрацавана (прыбл.): {processedTotal ?? "N/A"}</div>
                <div>Дададзена новых крыніц: {addedTotal ?? "N/A"}</div>
                <div>Агульная колькасць у базе: {collectedCount}</div>
              </div>
            </section>
          )}

        {/* Aggregated profiles preview */}
        {deduped.length > 0 && (
          <section className="bg-gray-800 p-6 rounded-xl shadow-md">
            <h3 className="text-lg font-semibold text-teal-300">
              Знойдзеныя Аб-екты (агрэгацыя)
            </h3>
            {deduped.map((d, idx) => (
              <div key={idx} className="p-3 bg-gray-700 rounded mb-3">
                <div className="font-bold text-yellow-300">
                  {d.main?.fullName || "Без імя"} — {d.count} прывязак
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Крыніц: {d.sources.length}
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
                    <div>Месца нараджэння: {d.main?.placeOfBirth || "N/A"}</div>
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
                      Адрас пражывання: {d.contacts?.residenceAddress || "N/A"}
                    </div>
                    <div>
                      VK / LinkedIn / Telegram:{" "}
                      {(d.sources || []).slice(0, 5).join(", ") || "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

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
              disabled={!isReadyForAnalysis || !isIdle}
              className="px-4 py-2 bg-teal-600 rounded"
            >
              Запусціць Аналіз
            </button>
            <button
              onClick={async () => {
                if (!currentCaseId) return;
                setLoadingState("Аднаўленне дадзеных кейса...");
                try {
                  const data = await getFullCaseData(currentCaseId);
                  setFullCase(data);
                  setCollectedCount(data?.collectedData.length || 0);
                } catch (e) {
                  setError(getErrorMessage(e, "Памылка загрузкі кейса"));
                } finally {
                  setLoadingState(null);
                }
              }}
              className="px-4 py-2 bg-gray-600 rounded"
            >
              Абнавіць дадзеныя кейса
            </button>
          </div>

          {Array.isArray(analysisResult) && analysisResult.length > 0 && (
            <div className="mb-3 p-3 bg-gray-700 rounded">
              <div className="text-sm text-gray-300 mb-2">
                Вынікі аналізу: {analysisResult.length} профіляў
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysisResult.slice(0, 6).map((p, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-gray-800 rounded border border-gray-600"
                  >
                    <div className="font-semibold text-yellow-300">
                      {p.mainData?.fullName || "Без імя"}
                    </div>
                    <div className="text-xs text-gray-400">
                      Грамадзянства: {p.mainData?.citizenship || "N/A"}
                    </div>
                    <div className="text-sm text-gray-200 mt-1">
                      {(p.contacts?.email || []).slice(0, 2).join(", ") ||
                        "N/A"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Крыніц: {(p.sources || []).length}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="mt-10 text-center text-gray-500 text-sm">
        <p>Пабудавана на Next.js, Gemini API, Custom Search API.</p>
        <p>Кейсы захоўваюцца ў тэчцы data/cases.</p>
      </footer>
    </div>
  );
}
