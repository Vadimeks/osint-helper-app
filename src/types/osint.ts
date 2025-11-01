// src/types/osint.ts

// --- ДАНЫЯ ЗБОРУ (SearchQuery) ---
export interface SearchQuery {
  query: string;
  url: string;
  snippet: string;
  title: string;
  sourceAPI: "CS_API" | "GEMINI";
  timestamp: string;
}

// --- АНАЛІЗ (Tsezka) ---
export interface Tsezka {
  name: string; // Поўнае імя знойдзенага чалавека
  region: string; // Рэгіён або горад
  activity: string; // Прафесія, роля, ці вядомая дзейнасць
  certainty: string; // Ацэнка верагоднасці супадзення (з дадатковай інфармацыяй)
  url: string; // Спасылка на крыніцу
}

// --- ПОЎНАЯ СТРУКТУРА AI-ПРОФІЛЯ ---
export interface AiProfile {
  description: string;
  mainData: {
    fullName: string;
    possibleNicknames: string[];
    dateOfBirth: string;
    placeOfBirth: string;
    citizenship: string;
    photoLink: string;
  };
  contacts: {
    email: string[];
    phone: string[];
    residenceAddress: string;
  };
  socialMedia: {
    VK: string;
    Facebook: string;
    LinkedIn: string;
    Telegram: string;
    other: string[];
  };
  professionalActivity: {
    education: string[];
    workplacePosition: string[];
    legalEntityInvolvement: string[];
  };
  mediaMentions: {
    courtRecords: string[];
    mediaMentions: string[];
    dataBreaches: string;
    achievements: string[];
  };
  conclusion: string;
  accuracyAssessment: string; // Напрыклад, "ВЫСОКАЯ" або "СРЭДНЯЯ"
  additionalInfo: string;
  sources: string[];
}

// --- CASE DATA ---
export interface CaseData {
  caseId: string;
  task: string;
  generatedQueries: string[];
  collectedData: SearchQuery[];
  analysis: string | null;
  createdAt: number;
  updatedAt: number;
}
