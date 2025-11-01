// src/app/components/CaseManager.tsx
"use client";

import React, { useState } from "react";
// ❗ ВЫПРАЎЛЕННЕ ІМПАРТУ ТЫПАЎ: CaseData і Tsezka імпартуюцца з types/osint
import { CaseData, Tsezka } from "@/types/osint";
// ❗ ВЫПРАЎЛЕННЕ ІМПАРТУ КАМПАНЕНТАЎ: Адносныя шляхі ў межах /app/components
import QueryManager from "./QueryManager";
import TableComponent from "./TableComponent";

// Пашыраем CaseData, каб мець JSON-разбор для аналізу
interface CaseDataWithParsedAnalysis extends CaseData {
  parsedAnalysis: Tsezka[] | null;
}

// Тып для апрацоўкі памылак API, каб пазбегнуць 'any'
type ApiError = { message: string };

const CaseManager: React.FC = () => {
  const [caseData, setCaseData] = useState<CaseDataWithParsedAnalysis | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [taskInput, setTaskInput] = useState(""); // ❗ ВЫПРАЎЛЕННЕ 404 (ЗАГРУЗКА СТАРЫХ КЕЙСАЎ): Ініцыялізуем як пусты радок
  const [caseIdInput, setCaseIdInput] = useState("");
  const [message, setMessage] = useState("");

  const handleError = (error: unknown, defaultMessage: string) => {
    const errorMsg = error instanceof Error ? error.message : defaultMessage;
    setMessage(`❌ Памылка: ${errorMsg}`);
  }; // --- Функцыі Case ID ---
  const handleLoadCase = async () => {
    // ❗ ВЫПРАЎЛЕННЕ 404 (ЗАГРУЗКА СТАРЫХ КЕЙСАЎ): Праверка на пусты caseIdInput перад выклікам API
    if (!caseIdInput || caseIdInput.trim().length === 0) {
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/case-session?caseId=${caseIdInput}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Кейс ID ${caseIdInput} не знойдзены.`);
        }
        throw new Error("Памылка пры загрузцы кейса.");
      }

      const data: CaseData = await response.json(); // Разбор JSON-аналізу пры загрузцы

      let parsedAnalysis: Tsezka[] | null = null;
      if (data.analysis) {
        try {
          parsedAnalysis = JSON.parse(data.analysis) as Tsezka[];
        } catch (e) {
          console.error("Памылка разбору analysis JSON:", e);
        }
      }

      setCaseData({ ...data, parsedAnalysis });
      setMessage(
        `✅ Кейс ${data.caseId} паспяхова загружаны. Задача: ${data.task}`
      );
    } catch (error) {
      handleError(error, "Невядомая памылка загрузкі.");
      setCaseData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCase = async () => {
    if (!taskInput) {
      setMessage("Увядзіце першапачатковы запыт/задачу.");
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/generate-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskInput }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiError; // Тыпізацыя
        throw new Error(
          errorData.message || "Памылка пры стварэнні новага кейса."
        );
      }

      const data: Partial<CaseData> & { caseId: string; queries: string[] } =
        await response.json(); // ❗ ВЫПРАЎЛЕННЕ 400 ERROR: Фільтрацыя генераваных запытаў пры стварэнні

      const cleanQueries = data.queries.filter(
        (q) =>
          typeof q === "string" &&
          q.trim().length > 0 &&
          q.toLowerCase() !== "undefined" // Адхіляем радок "undefined"
      );

      const newCaseData: CaseDataWithParsedAnalysis = {
        caseId: data.caseId,
        task: taskInput,
        generatedQueries: cleanQueries, // <-- Выкарыстоўваем ачышчаны масіў
        collectedData: [],
        analysis: null,
        parsedAnalysis: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setCaseData(newCaseData);
      setCaseIdInput(data.caseId);
      setMessage(
        `🎉 Новы кейс ID ${data.caseId} створаны. Гатовы да рэдагавання запытаў.`
      );
    } catch (error) {
      handleError(error, "Невядомая памылка стварэння.");
    } finally {
      setLoading(false);
    }
  }; // --- Функцыі Дзеянняў ---
  const handleQueriesUpdated = (updatedQueries: string[]) => {
    if (caseData) {
      setCaseData((prev) =>
        prev ? { ...prev, generatedQueries: updatedQueries } : null
      );
    }
  };

  const handleStartSearch = async (queriesToRun: string[]) => {
    // ❗ ВЫПРАЎЛЕННЕ 400 ERROR: Пашыраная фільтрацыя запытаў
    const validQueries = queriesToRun.filter(
      (q) =>
        typeof q === "string" &&
        q.trim().length > 0 &&
        q.toLowerCase() !== "undefined"
    );

    if (!caseData) return;

    if (validQueries.length === 0) {
      setMessage(
        "Спіс запытаў для запуску пусты або нясапраўдны. Праверце QueryManager."
      );
      return;
    }

    setLoading(true);
    setMessage(
      `🔄 Пачатак збору дадзеных па ${validQueries.length} запытам...`
    );

    const currentCaseId = caseData.caseId;

    try {
      for (let i = 0; i < validQueries.length; i++) {
        const currentQuery = validQueries[i];
        setMessage(
          `🔄 Пошук ${i + 1}/${validQueries.length}: "${currentQuery}"`
        );
        const response = await fetch("/api/collect-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: currentCaseId,
            searchQuery: currentQuery, // Выкарыстоўваем адфільтраваны, непусты запыт
          }),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as ApiError; // Тыпізацыя
          throw new Error(
            errorData.message || `Памылка збору дадзеных для запыту ${i + 1}.`
          );
        }
      } // Паўторна загружаем кейс, каб атрымаць актуальную колькасць сабраных дадзеных

      setCaseIdInput(currentCaseId);
      await handleLoadCase(); // handleLoadCase ужо абнаўляе message, але пакажам канчатковае паведамленне
      setMessage(
        `✅ Збор дадзеных завершаны. Праверце табліцу для новай колькасці крыніц.`
      );
    } catch (error) {
      handleError(error, "Невядомая памылка збору.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartAnalysis = async () => {
    if (!caseData || caseData.collectedData.length === 0) {
      setMessage("Немагчыма пачаць аналіз: няма сабраных дадзеных.");
      return;
    }

    setLoading(true);
    setMessage("🧠 Аналіз сабраных дадзеных... Гэта можа заняць да хвіліны.");

    try {
      const response = await fetch("/api/analyze-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: caseData.caseId }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiError; // Тыпізацыя
        throw new Error(errorData.message || "Памылка пры выкананні аналізу.");
      }

      const result = await response.json(); // Вынік ад API analysis-data цяпер будзе ў result.analysisData
      const parsedAnalysis = result.analysisData as Tsezka[]; // Абнаўляем стан UI

      setCaseData((prev) =>
        prev
          ? {
              ...prev,
              analysis: JSON.stringify(parsedAnalysis),
              parsedAnalysis,
            }
          : null
      );
      setMessage("✅ Аналіз паспяхова завершаны!");
    } catch (error) {
      handleError(error, "Невядомая памылка аналізу.");
    } finally {
      setLoading(false);
    }
  }; // --- UI Адлюстраванне ---
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 bg-gray-50 rounded-xl shadow-2xl">
                       {" "}
      <h1 className="text-3xl font-bold text-blue-700">🔎 OSINT-Памочнік</h1>   
              {/* Блок паведамленняў і статусу */}           {" "}
      {message && (
        <div
          className={`p-3 rounded-lg font-medium ${
            message.startsWith("✅")
              ? "bg-green-100 text-green-700"
              : message.startsWith("❌")
              ? "bg-red-100 text-red-700"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
                              {loading ? `Загрузка... ${message}` : message}   
                     {" "}
        </div>
      )}
                 {" "}
      {/* Блок ініцыялізацыі кейса (паказваем, калі няма caseData) */}         
               {" "}
      {!caseData && (
        <div className="space-y-4 p-5 border border-gray-200 bg-white rounded-lg">
                                       {" "}
          <h2 className="text-xl font-semibold text-gray-800">
                                    1. Стварыць або Загрузіць Справу            
                   {" "}
          </h2>
                              {/* Стварыць Новы */}                   {" "}
          <div className="border-b pb-4">
                                               {" "}
            <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Новы пошук (Задача/Імя)              
                       {" "}
            </label>
                                               {" "}
            <div className="flex space-x-2">
                                                       {" "}
              <input
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="Напрыклад: Сіманаў Вадзім Юр'евіч"
                className="flex-grow p-2 border border-blue-300 rounded-md"
                disabled={loading}
              />
                                                       {" "}
              <button
                onClick={handleCreateCase}
                disabled={loading || !taskInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                                                СТВАРЫЦЬ І ПАЧАЦЬ              {" "}
                             {" "}
              </button>
                                                   {" "}
            </div>
                                           {" "}
          </div>
                              {/* Дадаць да Існуючага */}                   {" "}
          <div>
                                               {" "}
            <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Дадаць інфу да існуючага Case ID      
                               {" "}
            </label>
                                               {" "}
            <div className="flex space-x-2">
                                                       {" "}
              <input
                type="text"
                value={caseIdInput}
                onChange={(e) => setCaseIdInput(e.target.value)}
                placeholder="Увядзіце case-id-xxxx"
                className="flex-grow p-2 border border-gray-300 rounded-md"
                disabled={loading}
              />
                                                       {" "}
              <button
                onClick={handleLoadCase}
                disabled={loading || !caseIdInput.trim()}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400"
              >
                                                ЗАГРУЗІЦЬ КЕЙС                  
                         {" "}
              </button>
                                                   {" "}
            </div>
                                           {" "}
          </div>
                                   {" "}
        </div>
      )}
                       {" "}
      {/* Блок асноўнага працоўнага працэсу (паказваем, калі ёсць caseData) */} 
                     {" "}
      {caseData && (
        <div className="space-y-6">
                                       {" "}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                               {" "}
            <h3 className="text-xl font-bold text-blue-800">
                                          Кейс ID: {caseData.caseId}           {" "}
                         {" "}
            </h3>
                                               {" "}
            <p className="text-md text-gray-700">Задача: {caseData.task}</p>   
                                           {" "}
            <p className="text-sm text-gray-500">
                                          Сабрана крыніц:{" "}
              {caseData.collectedData.length}                                   
               {" "}
            </p>
                                           {" "}
          </div>
                              {/* 2. Кіраванне Запытамі і Збор */}             
               {" "}
          <QueryManager
            initialCaseId={caseData.caseId}
            initialQueries={caseData.generatedQueries}
            onQueriesUpdated={handleQueriesUpdated}
            onStartSearch={handleStartSearch}
          />
                              {/* 3. Аналіз і Вынік */}                   {" "}
          <div className="p-4 border rounded-lg bg-white space-y-4 shadow-md">
                                               {" "}
            <h2 className="text-xl font-semibold text-gray-800">
                                          3. Аналіз дадзеных                    
                 {" "}
            </h2>
                                               {" "}
            <div className="mt-2 text-gray-600">
                                                       {" "}
              {caseData.collectedData.length === 0
                ? "Сабраных дадзеных няма. Спачатку запусціце збор."
                : `Знойдзена ${caseData.collectedData.length} крыніц. Гатова да аналізу.`}
                                                   {" "}
            </div>
                                               {" "}
            <button
              onClick={handleStartAnalysis}
              disabled={loading || caseData.collectedData.length === 0}
              className="w-full px-4 py-3 bg-red-600 text-white rounded-md text-lg font-bold hover:bg-red-700 transition duration-150 disabled:bg-gray-400"
            >
                                         {" "}
              {loading ? "Аналізуецца..." : "🧠 ЗАПУСЦІЦЬ АНАЛІЗ"}             
                                     {" "}
            </button>
                                    {/* Адлюстраванне Табліцы */}               
                   {" "}
            {caseData.parsedAnalysis && (
              <div className="mt-6">
                                                               {" "}
                <h3 className="text-lg font-bold text-green-700 mb-4">
                                                      ✅ Вынік Аналізу (Цёзкі)  
                                               {" "}
                </h3>
                                                               {" "}
                <TableComponent tsezki={caseData.parsedAnalysis} />             {" "}
                             {" "}
              </div>
            )}
                                           {" "}
          </div>
                                   {" "}
        </div>
      )}
                   {" "}
    </div>
  );
};

export default CaseManager;
