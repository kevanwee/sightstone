import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(d);
}

export const CONTRACTUAL_EFFECT_LABELS: Record<string, string> = {
  RIGHTS_GRANT: "Rights Grant",
  OBLIGATION: "Obligation",
  LIMITATION: "Limitation",
  EXCLUSION: "Exclusion",
  INDEMNITY: "Indemnity",
  REPRESENTATION: "Representation",
  WARRANTY: "Warranty",
  TERMINATION: "Termination",
  GOVERNANCE: "Governance",
  DEFINITION: "Definition",
  BOILERPLATE: "Boilerplate",
  OTHER: "Other",
};

export const CONTRACTUAL_EFFECT_ORDER: Record<string, number> = {
  INDEMNITY: 1,
  LIMITATION: 2,
  EXCLUSION: 3,
  OBLIGATION: 4,
  RIGHTS_GRANT: 5,
  WARRANTY: 6,
  REPRESENTATION: 7,
  TERMINATION: 8,
  GOVERNANCE: 9,
  DEFINITION: 10,
  BOILERPLATE: 11,
  OTHER: 12,
};

export const RISK_LEVEL_COLOURS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200",
  LOW: "bg-green-100 text-green-800 border-green-200",
};

export const STATUS_COLOURS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ANALYSING: "bg-blue-100 text-blue-700",
  REVIEW: "bg-purple-100 text-purple-700",
  HARMONISED: "bg-green-100 text-green-700",
};
