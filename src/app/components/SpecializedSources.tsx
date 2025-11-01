//src/app/components/SpecializedSources.tsx
"use client";

import React, { FC, useState, useEffect } from "react";

interface Props {
  // initial list of available specialized sources (domains or site: expressions)
  initialAvailable?: string[];
  // currently selected sources (controlled)
  selected?: string[];
  // callback when selected list changes
  onChange: (selected: string[]) => void;
  // allow user to add custom sources
  allowAdd?: boolean;
}

const defaultSources = [
  "rosreestr.ru",
  "zakupki.gov.ru",
  "fedresurs.ru",
  "kad.arbitr.ru",
  "russian-torturers.com",
  "egov.kz",
  "opendatabot.ua",
  "findface.ru",
  "spb.sledcom.ru",
  "gov.ru",
];

const normalize = (s: string) => s.trim();

const SpecializedSources: FC<Props> = ({
  initialAvailable = defaultSources,
  selected = [],
  onChange,
  allowAdd = true,
}) => {
  const [available, setAvailable] = useState<string[]>(
    Array.from(new Set(initialAvailable.map(normalize).filter(Boolean)))
  );
  const [localSelected, setLocalSelected] = useState<string[]>(
    Array.from(new Set(selected.map(normalize).filter(Boolean)))
  );
  const [newSource, setNewSource] = useState("");

  useEffect(() => {
    // if parent updates selected prop, sync local state
    setLocalSelected(
      Array.from(new Set(selected.map(normalize).filter(Boolean)))
    );
  }, [selected]);

  const toggle = (src: string) => {
    const s = normalize(src);
    setLocalSelected((prev) => {
      const next = prev.includes(s)
        ? prev.filter((x) => x !== s)
        : [...prev, s];
      onChange(next);
      return next;
    });
  };

  const selectAll = () => {
    const all = Array.from(new Set(available.map(normalize).filter(Boolean)));
    setLocalSelected(all);
    onChange(all);
  };

  const clearAll = () => {
    setLocalSelected([]);
    onChange([]);
  };

  const addCustom = () => {
    const s = normalize(newSource);
    if (!s) return;
    if (!available.includes(s)) {
      setAvailable((prev) => [...prev, s]);
    }
    if (!localSelected.includes(s)) {
      const next = [...localSelected, s];
      setLocalSelected(next);
      onChange(next);
    }
    setNewSource("");
  };

  const removeAvailable = (s: string) => {
    const norm = normalize(s);
    setAvailable((prev) => prev.filter((x) => x !== norm));
    setLocalSelected((prev) => {
      const next = prev.filter((x) => x !== norm);
      onChange(next);
      return next;
    });
  };

  return (
    <div className="p-3 bg-gray-700 rounded">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-gray-200">Спецыялізаваныя крыніцы</div>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={selectAll}
            className="px-2 py-1 bg-indigo-600 rounded text-sm"
          >
            Выбраць усе
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="px-2 py-1 bg-gray-600 rounded text-sm"
          >
            Ачысціць
          </button>
        </div>
      </div>

      <div className="max-h-48 overflow-auto mb-3">
        <ul className="space-y-2">
          {available.map((src, i) => (
            <li key={src + i} className="flex items-center justify-between">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={localSelected.includes(src)}
                  onChange={() => toggle(src)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-200 break-all">{src}</span>
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => toggle(src)}
                  className="text-xs px-2 py-1 bg-blue-600 rounded"
                  aria-label={`Toggle ${src}`}
                >
                  {localSelected.includes(src) ? "Выключыць" : "Уключыць"}
                </button>
                <button
                  type="button"
                  onClick={() => removeAvailable(src)}
                  className="text-xs px-2 py-1 bg-red-600 rounded"
                >
                  Выдаліць
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {allowAdd && (
        <div className="mt-2">
          <div className="flex space-x-2">
            <input
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="Дадаць крыніцу (напрыклад: site:rosreestr.ru або rosreestr.ru)"
              className="flex-grow p-2 rounded bg-gray-800 text-white border border-gray-600"
            />
            <button
              type="button"
              onClick={addCustom}
              className="px-3 py-2 bg-green-600 rounded"
            >
              Дадаць
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Можна ўводзіць дамен або выражэнні з site:. Новая крыніца
            аўтаматычна становіцца абранай.
          </p>
        </div>
      )}
    </div>
  );
};

export default SpecializedSources;
