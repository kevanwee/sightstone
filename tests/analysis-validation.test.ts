import { describe, expect, it } from "vitest";
import {
  parseExtraction,
  parseComparison,
  validateContractText,
  MAX_CONTRACT_CHARS,
} from "@/lib/analysis-validation";
import { getFileTypeFromName, isAcceptedFileType } from "@/lib/parser";

const clause = {
  originalText: "Payment is due in 30 days.",
  clauseType: "Payment",
  contractualEffect: "OBLIGATION",
  riskLevel: "LOW",
  position: 1,
};
const extraction = (overrides = {}) =>
  JSON.stringify({ clauses: [{ ...clause, ...overrides }] });

describe("model output validation", () => {
  it("accepts source-backed text and rejects invented clauses", () => {
    expect(
      parseExtraction(extraction(), clause.originalText).clauses,
    ).toHaveLength(1);
    expect(() => parseExtraction(extraction(), "Something else")).toThrow();
  });
  it.each([
    { contractualEffect: "MADE_UP" },
    { riskLevel: "SAFE" },
    { position: 1.5 },
    { originalText: "" },
  ])("rejects invalid fields %j", (value) => {
    expect(() =>
      parseExtraction(extraction(value), clause.originalText),
    ).toThrow();
  });
  it("rejects empty, truncated or duplicate-position extraction", () => {
    expect(() =>
      parseExtraction('{"clauses":[]}', clause.originalText),
    ).toThrow();
    expect(() =>
      parseExtraction('{"clauses":[', clause.originalText),
    ).toThrow();
    expect(() =>
      parseExtraction(
        JSON.stringify({ clauses: [clause, clause] }),
        clause.originalText,
      ),
    ).toThrow();
  });
  it("rejects oversized and empty contracts instead of silently truncating", () => {
    expect(() => validateContractText(" ")).toThrow();
    expect(() =>
      validateContractText("a".repeat(MAX_CONTRACT_CHARS + 1)),
    ).toThrow();
    expect(() =>
      validateContractText("a".repeat(MAX_CONTRACT_CHARS)),
    ).not.toThrow();
  });
  it("validates comparisons against the requested group", () => {
    const content = JSON.stringify({
      clauseType: "Payment",
      contractualEffect: "OBLIGATION",
      overlapSummary: "Both require payment",
      similarities: [],
      differences: [],
      aiSuggestedWording: clause.originalText,
    });
    expect(
      parseComparison(content, "Payment", "OBLIGATION").aiSuggestedWording,
    ).toBe(clause.originalText);
    expect(() =>
      parseComparison(content, "Termination", "TERMINATION"),
    ).toThrow();
  });
  it("does not mislabel legacy DOC as DOCX", () => {
    expect(getFileTypeFromName("contract.DOCX")).toBe("docx");
    expect(isAcceptedFileType("contract.doc")).toBe(false);
  });
});
