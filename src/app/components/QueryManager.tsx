// src/app/components/QueryManager.tsx
"use client";

import React, { useState, useEffect } from "react";

interface QueryManagerProps {
  initialCaseId: string;
  initialQueries: string[];
  onQueriesUpdated: (queries: string[]) => void;
  onStartSearch: (queries: string[]) => void;
}

// Тып для апрацоўкі памылак API, каб пазбегнуць 'any'
type ApiError = { error?: string; message?: string };

// ❗ НОВАЯ КАНСТАНТА ДЛЯ ФІЛЬТРАЦЫІ
const isQueryValid = (q: string): boolean => {
  return (
    typeof q === "string" &&
    q.trim().length > 0 &&
    q.toLowerCase() !== "undefined" // ❗ ВЫПРАЎЛЕННЕ: Выключаем радок "undefined"
  );
};

const QueryManager: React.FC<QueryManagerProps> = ({
  initialCaseId,
  initialQueries,
  onQueriesUpdated,
  onStartSearch,
}) => {
  // ❗ АЧЫШЧАЕМ initialQueries ПРЫ ІНІЦЫЯЛІЗАЦЫІ
  const [queries, setQueries] = useState<string[]>(
    initialQueries.filter(isQueryValid)
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(""); // Абнаўляем стан queries, калі змяняюцца initialQueries (пры загрузцы новага кейса)

  useEffect(() => {
    // ❗ АЧЫШЧАЕМ initialQueries ПРЫ АБНАЎЛЕННІ
    setQueries(initialQueries.filter(isQueryValid));
  }, [initialQueries]);

  const handleQueryChange = (index: number, value: string) => {
    const newQueries = [...queries];
    newQueries[index] = value;
    setQueries(newQueries);
  };

  const handleAddQuery = () => {
    setQueries([...queries, ""]);
  };

  const handleRemoveQuery = (index: number) => {
    setQueries(queries.filter((_, i) => i !== index));
  };

  const handleSaveQueries = async () => {
    setLoading(true);
    setMessage(""); // ❗ ВЫКАРЫСТОЎВАЕМ НОВУЮ ФІЛЬТРАЦЫЮ

    const queriesToSave = queries.filter(isQueryValid);

    try {
      const response = await fetch("/api/update-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: initialCaseId,
          updatedQueries: queriesToSave,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiError; // Тыпізацыя
        throw new Error(
          errorData.error ||
            errorData.message ||
            "Памылка пры захаванні запытаў."
        );
      }

      const data = await response.json();

      setQueries(queriesToSave);
      onQueriesUpdated(queriesToSave);
      setMessage(`✅ Запыты паспяхова абноўлены (${data.updatedCount}).`);
    } catch (error) {
      // !!! ВЫПРАЎЛЕННЕ any !!!
      const errorMsg =
        error instanceof Error ? error.message : "Невядомая памылка захавання.";
      setMessage(`❌ Памылка: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }; // ❗ ВЫКАРЫСТОЎВАЕМ НОВУЮ ФІЛЬТРАЦЫЮ для перадачы ў onStartSearch

  const activeQueries = queries.filter(isQueryValid);

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-white shadow-md">
           {" "}
      <h3 className="text-xl font-bold text-blue-700">
                2. Рэдагаванне і Збор Дадзеных      {" "}
      </h3>
           {" "}
      <div className="space-y-3 max-h-60 overflow-y-auto border p-2 rounded-md bg-gray-50">
               {" "}
        {queries.map((query, index) => (
          <div key={index} className="flex items-center space-x-2">
                       {" "}
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(index, e.target.value)}
              className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder={`Запыт ${index + 1}`}
              disabled={loading}
            />
                       {" "}
            <button
              onClick={() => handleRemoveQuery(index)}
              disabled={loading}
              className="text-red-500 hover:text-red-700 p-2 disabled:opacity-50"
              aria-label="Выдаліць запыт"
            >
                           {" "}
              <span role="img" aria-label="выдаліць">
                                🗑️              {" "}
              </span>
                         {" "}
            </button>
                     {" "}
          </div>
        ))}
             {" "}
      </div>
           {" "}
      <div className="flex space-x-3">
               {" "}
        <button
          onClick={handleAddQuery}
          disabled={loading}
          className="flex-shrink-0 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:bg-gray-400"
        >
                    + Дадаць Запыт        {" "}
        </button>
               {" "}
        <button
          onClick={handleSaveQueries}
          disabled={loading}
          className="flex-shrink-0 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400"
        >
                    {loading ? "Захоўваецца..." : "💾 Захаваць змены"}       {" "}
        </button>
             {" "}
      </div>
           {" "}
      {message && (
        <p
          className={`text-sm ${
            message.startsWith("✅")
              ? "text-green-600"
              : message.startsWith("❌")
              ? "text-red-600"
              : "text-gray-600"
          } mt-2`}
        >
                    {message}       {" "}
        </p>
      )}
            <hr className="my-4" />     {" "}
      <button
        onClick={() => onStartSearch(activeQueries)}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-md text-lg font-bold hover:bg-blue-700 transition duration-150 disabled:bg-gray-400"
        disabled={loading || activeQueries.length === 0}
      >
                🚀 Пачаць збор дадзеных па {activeQueries.length} запытам      {" "}
      </button>
         {" "}
    </div>
  );
};

export default QueryManager;
