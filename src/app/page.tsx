//src/app/page.tsx
"use client";

import { useState, useCallback } from "react";
// Калі 'Tsezka' імпартуецца з лакальнага файла, пакідаем імпарт.
// Для прастаты тыпізацыі ў асноўным кодзе будзем выкарыстоўваць "any" або мінімальны тып.
// import TableComponent from "./TableComponent"; // Выдаляем, каб не было памылак, выкарыстоўваем прамы рэндэрынг

// API Endpoints
const GENERATE_QUERIES_URL = "/api/generate-queries";
const ANALYZE_URL = "/api/analyze";

// Мінімальны тып для Tsezka (адаптаваны з нашай структуры API)
interface AnalysisResult {
  name: string;
  region: string;
  activity: string;
  certainty: string;
  url: string;
}

// Стан для паведамленняў
interface Status {
  message: string;
  type: "hidden" | "loading" | "success" | "error";
}

/**
 * Галоўны кампанент OSINT-аналізатара (Двухэтапная логіка)
 */
export default function OsintTwoStageAnalyzer() {
  // Стан UI
  const [task, setTask] = useState<string>("");
  const [queries, setQueries] = useState<string>("");
  const [status, setStatus] = useState<Status>({ message: "", type: "hidden" });
  const [tsezkiList, setTsezkiList] = useState<AnalysisResult[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Стан этапаў
  const isStage2Ready: boolean = queries.trim().length > 0;

  /**
   * Утыліта для адлюстравання статусу або памылак
   */
  const showStatus = (message: string, type: Status["type"] = "loading") => {
    setStatus({ message, type });
  };

  /**
   * Дапаможная функцыя для стыляў статусу
   */
  const getStatusClasses = (type: Status["type"]): string => {
    switch (type) {
      case "loading":
        return "bg-blue-100 text-blue-700";
      case "success":
        return "bg-green-100 text-green-700";
      case "error":
        return "bg-red-100 text-red-700";
      default:
        return "hidden";
    }
  };
  const [variants, setVariants] = useState<{
    nameVariants: string[];
    emailVariants: string[];
    usernameVariants: string[];
  } | null>(null);

  const handleGenerateVariants = useCallback(async () => {
    if (!task.trim()) {
      showStatus("Увядзіце імя для генерацыі варыянтаў.", "error");
      return;
    }

    showStatus("Генерацыя варыянтаў імя, пошты і нікаў...", "loading");
    setVariants(null);

    try {
      const response = await fetch("/api/generate-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: task.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Памылка генерацыі варыянтаў.");
      }

      setVariants(data);
      showStatus("Варыянты згенераваны.", "success");
    } catch (error: unknown) {
      console.error("Памылка генерацыі варыянтаў:", error);
      showStatus(
        `Памылка: ${
          error instanceof Error ? error.message : "Невядомая памылка"
        }`,
        "error"
      );
    }
  }, [task]);
  /**
   * Этап 1: Звяртаецца да API для генерацыі пошукавых запытаў.
   */
  const handleGenerateQueries = useCallback(async () => {
    if (!task.trim()) {
      showStatus("Калі ласка, увядзіце задачу для аналізу.", "error");
      return;
    }

    setIsGenerating(true);
    setQueries("");
    setTsezkiList([]);
    showStatus("Генерацыя аптымальнай пошукавай стратэгіі...", "loading");

    try {
      const response = await fetch(GENERATE_QUERIES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Невядомая памылка пры генерацыі запытаў."
        );
      }

      // Мадэль вяртае масіў радкоў з запытамі
      const generatedQueries: string[] = data.queries || [];

      if (generatedQueries.length > 0) {
        setQueries(generatedQueries.join("\n"));
        showStatus(
          `Згенеравана ${generatedQueries.length} запытаў. Праверце і націсніце "Запусціць Аналіз".`,
          "success"
        );
      } else {
        setQueries("");
        showStatus(
          "Штучны інтэлект не змог згенераваць запыты. Паспрабуйце ўвесці больш канкрэтную задачу.",
          "error"
        );
      }
    } catch (error: unknown) {
      console.error("Памылка Генерацыі Запытаў:", error);
      showStatus(
        `Памылка: ${
          error instanceof Error ? error.message : "Невядомая памылка"
        }`,
        "error"
      );
    } finally {
      setIsGenerating(false);
    }
  }, [task]);

  /**
   * Этап 2: Звяртаецца да API для выканання пошуку і сінтэзу дадзеных.
   */
  const handleRunAnalysis = useCallback(async () => {
    const taskOrQueries = queries.trim();

    if (!taskOrQueries) {
      showStatus("Спіс запытаў пусты. Спачатку згенеруйце іх.", "error");
      return;
    }

    setIsAnalyzing(true);
    setIsGenerating(true); // Блакуем генерацыю падчас аналізу
    showStatus(
      "Запуск комплекснага OSINT-аналізу і агрэгацыі дадзеных...",
      "loading"
    );
    setTsezkiList([]);

    try {
      const response = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Адпраўляем скарэктаваны спіс запытаў як поўную задачу/запыт для аналізу
        body: JSON.stringify({ fullName: taskOrQueries }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Невядомая памылка пры выкананні аналізу."
        );
      }

      // Прымаем вынікі
      const results: AnalysisResult[] = data.tsezki || [];
      setTsezkiList(results);
      showStatus(
        `Аналіз завершаны. Знойдзена ${results.length} унікальных профіляў.`,
        "success"
      );
    } catch (error: unknown) {
      console.error("Памылка Аналізу:", error);
      showStatus(
        `Памылка: ${
          error instanceof Error ? error.message : "Невядомая памылка"
        }`,
        "error"
      );
    } finally {
      setIsAnalyzing(false);
      setIsGenerating(false);
    }
  }, [queries]);

  return (
    <div className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center text-indigo-500">
          OSINT: Трохэтапная Стратэгія Пошуку
        </h1>

        {/* Секцыя 1: Увод Задачы і Генерацыя Запытаў */}
        <div
          id="stage1"
          className="bg-white dark:bg-gray-800 p-6 rounded-xl mb-8 border border-indigo-500/50 shadow-lg"
        >
          <h2 className="text-xl font-semibold mb-4 text-indigo-400">
            Крок 1: Генерацыя Пошукавай Стратэгіі
          </h2>

          <label htmlFor="taskInput" className="block text-sm font-medium mb-2">
            Увядзіце поўную задачу (напр., Імя, Прозвішча, Імя па бацьку,
            дадатковыя словы):
          </label>
          <textarea
            id="taskInput"
            rows={2}
            className="w-full p-3 mb-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Напрыклад: Зрабіць інфармацыйную даведку па Сіманаў Вадзім Юр'евіч"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            disabled={isGenerating || isAnalyzing}
          />

          <button
            id="generateBtn"
            onClick={handleGenerateQueries}
            disabled={isGenerating || isAnalyzing}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isGenerating
              ? "Генерацыя..."
              : "Генераваць Аптымальныя Запыты (Этап 1)"}
          </button>

          <div
            id="queriesContainer"
            className={`mt-4 ${queries.length === 0 ? "hidden" : ""}`}
          >
            <h3 className="text-lg font-medium mb-2 text-indigo-300">
              Спіс згенераваных запытаў (можна адкарэктаваць, кожны запыт з
              новага радка):
            </h3>
            <textarea
              id="queriesTextarea"
              rows={8}
              className="w-full p-3 border border-yellow-500/50 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-yellow-500 focus:border-yellow-500"
              value={queries}
              onChange={(e) => setQueries(e.target.value)}
              disabled={isAnalyzing}
            ></textarea>
          </div>
        </div>
        {/* Секцыя 2: Генераваць Варыянты Ідэнтыфікацыі */}
        <button
          onClick={handleGenerateVariants}
          disabled={isGenerating || isAnalyzing}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
        >
          Генераваць Варыянты Ідэнтыфікацыі
        </button>
        {variants && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2 text-purple-500">
              🔤 Варыянты імя:
            </h3>
            <ul className="list-disc pl-6 mb-4">
              {variants.nameVariants.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>

            <h3 className="text-lg font-semibold mb-2 text-purple-500">
              📧 Варыянты пошты:
            </h3>
            <ul className="list-disc pl-6 mb-4">
              {variants.emailVariants.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>

            <h3 className="text-lg font-semibold mb-2 text-purple-500">
              👤 Варыянты нікаў:
            </h3>
            <ul className="list-disc pl-6 mb-4">
              {variants.usernameVariants.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
        )}
        {/* Секцыя 3: Выкананне Аналізу */}
        <div
          id="stage2"
          className={`bg-white dark:bg-gray-800 p-6 rounded-xl mb-8 border border-green-500/50 shadow-lg transition duration-300 ${
            !isStage2Ready || isAnalyzing
              ? "opacity-50 pointer-events-none"
              : ""
          }`}
        >
          <h2 className="text-xl font-semibold mb-4 text-green-400">
            Крок 3: Запуск Поўнага Аналізу
          </h2>

          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Націсніце кнопку, каб запусціць поўны пошук і сінтэз дадзеных,
            выкарыстоўваючы **адкарэктаваны** спіс запытаў з поля вышэй.
          </p>

          <button
            id="analyzeBtn"
            onClick={handleRunAnalysis}
            disabled={!isStage2Ready || isAnalyzing}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isAnalyzing
              ? "Аналіз..."
              : "Запусціць Агрэгацыю і Аналіз (Этап 3)"}
          </button>
        </div>

        {/* Секцыя Статусу і Памылак */}
        <div
          id="status"
          className={`mt-4 p-4 text-center text-sm rounded-lg transition duration-300 ${
            status.type === "hidden" ? "hidden" : getStatusClasses(status.type)
          }`}
        >
          {status.message}
        </div>

        {/* Секцыя Вынікаў */}
        <div id="resultsContainer" className="mt-8">
          <h2
            className={`text-2xl font-semibold mb-4 text-center ${
              tsezkiList.length > 0 ? "" : "hidden"
            }`}
            id="resultsTitle"
          >
            Вынікі Комплекснага Аналізу
          </h2>
          <div id="tsezkiList" className="space-y-4">
            {/* Паведамленне пра пусты вынік */}
            {tsezkiList.length === 0 &&
              isAnalyzing === false &&
              status.type === "success" && (
                <div className="bg-yellow-100 dark:bg-yellow-900 border border-yellow-500 p-4 rounded-lg text-center text-yellow-700 dark:text-yellow-300">
                  Нічога не знойдзена па зададзеных запытах. Паспрабуйце
                  адкарэктаваць спіс запытаў (Крок 1) і паўтарыць.
                </div>
              )}

            {/* Вывад картак з вынікамі */}
            {tsezkiList.map((tsezka, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl"
              >
                <div className="flex justify-between items-start mb-3 border-b pb-2 border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-indigo-500">
                    {tsezka.name}{" "}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                      ({tsezka.region || "Невядомы рэгіён"})
                    </span>
                  </h3>
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300">
                    Профіль #{index + 1}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex">
                    <span className="w-32 font-semibold text-gray-600 dark:text-gray-300">
                      Дзейнасць:
                    </span>
                    <span className="flex-1 whitespace-pre-wrap">
                      {tsezka.activity || "Дадзеныя адсутнічаюць"}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-32 font-semibold text-gray-600 dark:text-gray-300">
                      Верагоднасць:
                    </span>
                    <span className="flex-1 text-green-600 dark:text-green-400">
                      {tsezka.certainty || "Не пазначана"}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-32 font-semibold text-gray-600 dark:text-gray-300">
                      Крыніца:
                    </span>
                    <a
                      href={tsezka.url}
                      target="_blank"
                      className="flex-1 text-indigo-500 hover:text-indigo-400 truncate"
                      title={tsezka.url}
                    >
                      {tsezka.url || "Не пазначана"}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {tsezkiList.length > 0 && (
            <div className="overflow-x-auto mb-8">
              <h3 className="text-xl font-semibold mb-2 text-center text-indigo-400">
                📋 Табліца вынікаў
              </h3>
              <table className="min-w-full border border-gray-300 dark:border-gray-600 text-sm">
                <thead className="bg-gray-200 dark:bg-gray-700">
                  <tr>
                    <th className="border px-2 py-1">#</th>
                    <th className="border px-2 py-1">Імя</th>
                    <th className="border px-2 py-1">Рэгіён</th>
                    <th className="border px-2 py-1">Дзейнасць</th>
                    <th className="border px-2 py-1">Верагоднасць</th>
                    <th className="border px-2 py-1">Крыніца</th>
                  </tr>
                </thead>
                <tbody>
                  {tsezkiList.map((item, index) => (
                    <tr
                      key={index}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="border px-2 py-1 text-center">
                        {index + 1}
                      </td>
                      <td className="border px-2 py-1">{item.name}</td>
                      <td className="border px-2 py-1">{item.region}</td>
                      <td className="border px-2 py-1 whitespace-pre-wrap">
                        {item.activity}
                      </td>
                      <td className="border px-2 py-1 text-green-600 dark:text-green-400">
                        {item.certainty}
                      </td>
                      <td className="border px-2 py-1">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-500 hover:text-indigo-400 truncate block"
                          title={item.url}
                        >
                          Спасылка
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
