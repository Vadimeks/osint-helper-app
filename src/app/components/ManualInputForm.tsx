// src/app/components/ManualInputForm.tsx
"use client";

import React, { FC, useState } from "react";

// Інтэрфейс для ўзаемадзеяння з бацькоўскім кампанентам (page.tsx)
interface ManualInputFormProps {
  caseId: string | null;
  isLoading: boolean;
  // showStatus - функцыя, якая паказвае паведамленні аб стане ў page.tsx
  showStatus: (
    message: string,
    type: "loading" | "success" | "error" | "hidden"
  ) => void;
}

const MANUAL_INPUT_URL = "/api/manual-input";

const ManualInputForm: FC<ManualInputFormProps> = ({
  caseId,
  isLoading,
  showStatus,
}) => {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");

  const handleSaveInput = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!caseId) {
      showStatus(
        "Няма актыўнай справы (Case ID). Спачатку сгенеруйце запыты.",
        "error"
      );
      return;
    }
    if (name.trim() === "" || content.trim() === "") {
      showStatus("Палі 'Назва' і 'Змест' не могуць быць пустымі.", "error");
      return;
    }

    showStatus("Захаванне ручных дадзеных...", "loading");

    try {
      const response = await fetch(MANUAL_INPUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          name: name.trim(),
          content: content.trim(),
          url: url.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Апрацоўка памылак, якія могуць прыйсці з dataStore (напрыклад, caseId не знойдзены)
        throw new Error(data.error || "Невядомая памылка пры захаванні.");
      }

      // Паспяховае захаванне
      showStatus(
        `✅ Інфармацыя "${name
          .trim()
          .substring(0, 30)}..." паспяхова дададзена да справы ID: ${caseId}.`,
        "success"
      );

      // Ачыстка формы
      setName("");
      setContent("");
      setUrl("");
    } catch (error) {
      console.error("Памылка Ручнога Ўводу:", error);
      showStatus(
        `Памылка захавання: ${
          error instanceof Error ? error.message : "Невядомая памылка"
        }`,
        "error"
      );
    }
  };

  // Форма актыўная толькі калі ёсць caseId і няма глабальнай загрузкі
  const isFormDisabled = isLoading || !caseId;

  return (
    <form
      onSubmit={handleSaveInput}
      className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-yellow-500/50 shadow-lg mt-8"
    >
      <h2 className="text-xl font-semibold mb-4 text-yellow-500">
        Крок 1.5: Ручны Ўвод Знойдзеных Дадзеных (Дадаткова)
      </h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Дадайце інфармацыю, знойдзеную ўручную або па-за аўтаматычным пошукам.
        Яна будзе ўключана ў фінальны сінтэз. (Case ID: {caseId || "Няма"})
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-1">
          <label
            htmlFor="manualName"
            className="block text-sm font-medium mb-1"
          >
            Назва / Крыніца (Напр: Профіль LinkedIn){" "}
            {/* <-- Заменена на адзінарныя двукоссі */}
          </label>
          <input
            id="manualName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="Крыніца дадзеных"
            disabled={isFormDisabled}
            required
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="manualUrl" className="block text-sm font-medium mb-1">
            URL / Спасылка (Неабавязкова)
          </label>
          <input
            id="manualUrl"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="https://..."
            disabled={isFormDisabled}
          />
        </div>
      </div>

      <label htmlFor="manualContent" className="block text-sm font-medium mb-1">
        Змест (Асноўныя факты)
      </label>
      <textarea
        id="manualContent"
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full p-2 mb-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-yellow-500 focus:border-yellow-500"
        placeholder="Увядзіце поўнае імя, даты, пасады, кампаніі, месцы жыхарства і г.д."
        disabled={isFormDisabled}
        required
      />

      <button
        type="submit"
        disabled={isFormDisabled || name.trim() === "" || content.trim() === ""}
        className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
      >
        {isLoading ? "Загрузка..." : "Захаваць Дадзеныя"}
      </button>
    </form>
  );
};

export default ManualInputForm;
