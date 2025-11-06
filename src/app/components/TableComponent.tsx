//src/app/components/TableComponent.tsx
"use client";
import React, { FC } from "react";
import { Tsezka } from "@/types/osint";

/**
 * Detailed TableComponent — renders each Tsezka as a readable card
 * with the major fields. This component expects Tsezka to hold
 * at least: name, region, activity, certainty, url.
 *
 * For a full "TsezkaReport" viewer we recommend a separate DetailedProfile component.
 */

interface TableProps {
  tsezki: Tsezka[];
}

const TableComponent: FC<TableProps> = ({ tsezki }) => {
  if (!Array.isArray(tsezki) || tsezki.length === 0) {
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
    <div className="space-y-3">
      {tsezki.map((t, i) => {
        const certainty = mapCertainty(t.certainty || "");
        return (
          <div
            key={i}
            className="p-4 bg-gray-700 rounded-lg border border-gray-600"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-yellow-300">
                  {t.name}
                </div>
                <div className="text-sm text-gray-300">{t.activity}</div>
                <div className="text-xs text-gray-400 mt-1">{t.region}</div>
              </div>
              <div className="text-right">
                <div
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    certainty === "High"
                      ? "bg-green-100 text-green-800"
                      : certainty === "Medium"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {certainty}
                </div>
                <div className="text-sm mt-2">
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 underline"
                  >
                    Крыніца
                  </a>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TableComponent;
