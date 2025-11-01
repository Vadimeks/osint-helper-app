//src/app/components/TableComponent.tsx
"use client";
import React, { FC } from "react";
import { Tsezka } from "@/types/osint";

interface TableProps {
  tsezki: Tsezka[];
}

const TableComponent: FC<TableProps> = ({ tsezki }) => {
  if (tsezki.length === 0) {
    return (
      <p className="text-center text-gray-500">
        Няма дадзеных для адлюстравання.
      </p>
    );
  }

  const mapCertainty = (c: string) => {
    const s = (c || "").toLowerCase();
    if (s.includes("high") || s.includes("высок") || s.includes("высока"))
      return "High";
    if (s.includes("medium") || s.includes("сред") || s.includes("сярэд"))
      return "Medium";
    return "Low";
  };

  return (
    <div className="overflow-x-auto shadow-lg rounded-lg">
      <table className="min-w-full bg-white border border-gray-200">
        <thead className="bg-blue-600 text-white">
          <tr>
            <th className="py-3 px-4 text-left font-semibold border-b">
              Профіль (Цёзка)
            </th>
            <th className="py-3 px-4 text-left font-semibold border-b">
              Рэгіён / Лакацыя
            </th>
            <th className="py-3 px-4 text-left font-semibold border-b">
              Дзейнасць / Роля
            </th>
            <th className="py-3 px-4 text-left font-semibold border-b">
              Ацэнка Дакладнасці
            </th>
            <th className="py-3 px-4 text-left font-semibold border-b">
              Спасылка
            </th>
          </tr>
        </thead>
        <tbody>
          {tsezki.map((t, index) => {
            const certainty = mapCertainty(t.certainty);
            return (
              <tr
                key={index}
                className="hover:bg-gray-50 border-b border-gray-200"
              >
                <td className="py-3 px-4 text-gray-600">{t.name}</td>
                <td className="py-3 px-4 text-sm text-gray-600">{t.region}</td>
                <td className="py-3 px-4 text-sm text-gray-600">
                  {t.activity}
                </td>
                <td className="py-3 px-4 text-sm text-gray-600">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      certainty === "High"
                        ? "bg-green-100 text-green-800"
                        : certainty === "Medium"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {certainty}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline text-sm"
                  >
                    Крыніца
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TableComponent;
