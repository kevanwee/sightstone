import { ContractualEffect, RiskLevel } from "@prisma/client";
import { z } from "zod";

export const MAX_CONTRACT_CHARS = 15000;
export const MAX_ANALYSIS_CONTRACTS = 5;
export const ANALYSIS_TIMEOUT_MS = 45000;
export const ANALYSIS_LEASE_MS = 90000;

const ClauseSchema = z.object({
  originalText: z.string().min(1).max(MAX_CONTRACT_CHARS),
  clauseType: z.string().trim().min(1).max(150),
  contractualEffect: z.nativeEnum(ContractualEffect),
  riskLevel: z.nativeEnum(RiskLevel),
  position: z.number().int().positive(),
});
const ExtractionSchema = z.object({
  clauses: z.array(ClauseSchema).min(1).max(100),
});
const ComparisonSchema = z.object({
  clauseType: z.string().min(1),
  contractualEffect: z.nativeEnum(ContractualEffect),
  overlapSummary: z.string().trim().min(1).max(12000),
  similarities: z.array(z.string()).max(100),
  differences: z.array(z.string()).max(100),
  aiSuggestedWording: z.string().trim().min(1).max(20000),
});
export type ClauseExtractionResult = z.infer<typeof ExtractionSchema>;
export type ComparisonResult = z.infer<typeof ComparisonSchema>;

export function validateContractText(text: string) {
  if (!text.trim()) {
    throw new Error("Contract has no extractable text");
  }
  if (text.length > MAX_CONTRACT_CHARS) {
    throw new Error("Contract exceeds the analysis text limit");
  }
}

export function parseExtraction(
  content: string,
  source: string,
): ClauseExtractionResult {
  const result = ExtractionSchema.parse(JSON.parse(content));
  const positions = new Set<number>();
  for (const clause of result.clauses) {
    if (
      !source.includes(clause.originalText) ||
      positions.has(clause.position)
    ) {
      throw new Error(
        "Extraction does not match source text or repeats a position",
      );
    }
    positions.add(clause.position);
  }
  return result;
}

export function parseComparison(
  content: string,
  type: string,
  effect: string,
): ComparisonResult {
  const result = ComparisonSchema.parse(JSON.parse(content));
  if (result.clauseType !== type || result.contractualEffect !== effect) {
    throw new Error("Comparison returned a different clause group");
  }
  return result;
}
