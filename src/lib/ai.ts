import Groq from "groq-sdk";

import {
  parseExtraction,
  parseComparison,
  validateContractText,
} from "@/lib/analysis-validation";
import type {
  ClauseExtractionResult,
  ComparisonResult,
} from "@/lib/analysis-validation";

function client() {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 45000,
    maxRetries: 0,
  });
}

// Groq retired llama-3.1-70b-versatile; GROQ_MODEL overrides the default without a code change
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ─── Extract Clauses from Contract Text ───────────────────────────────────────

export async function extractClausesFromText(
  text: string,
  contractName: string,
  signal?: AbortSignal,
): Promise<ClauseExtractionResult> {
  validateContractText(text);
  const completion = await client().chat.completions.create(
    {
      model: MODEL,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a legal expert specialising in contract analysis. Always respond with valid JSON only — no markdown, no code fences, no prose.",
        },
        {
          role: "user",
          content: `Extract ALL distinct clauses from the following contract text. For each clause, identify:
1. The exact original text of the clause
2. The clause type/category (e.g. "Limitation of Liability", "Indemnity", "Confidentiality", "Termination", "Governing Law", "Intellectual Property", "Payment Terms", "Force Majeure", "Warranty", "Dispute Resolution", etc.)
3. The contractual effect - choose exactly ONE from: RIGHTS_GRANT, OBLIGATION, LIMITATION, EXCLUSION, INDEMNITY, REPRESENTATION, WARRANTY, TERMINATION, GOVERNANCE, DEFINITION, BOILERPLATE, OTHER
4. Risk level - choose exactly ONE from: LOW, MEDIUM, HIGH, CRITICAL
5. Position (sequential order, starting from 1)

Contract: "${contractName}"

Contract Text:
---
${text}
---

Respond ONLY with valid JSON in this exact format:
{
  "clauses": [
    {
      "originalText": "Full text of the clause...",
      "clauseType": "Limitation of Liability",
      "contractualEffect": "LIMITATION",
      "riskLevel": "HIGH",
      "position": 1
    }
  ]
}`,
        },
      ],
    },
    { signal },
  );

  if (completion.choices[0]?.finish_reason !== "stop") {
    throw new Error("Incomplete model response");
  }
  const responseText = completion.choices[0]?.message?.content ?? "";

  return parseExtraction(responseText, text);
}

// ─── Compare Clauses of Same Type Across Contracts ────────────────────────────

export async function compareClauses(
  clauseType: string,
  contractualEffect: string,
  clauses: { contractName: string; text: string }[],
  signal?: AbortSignal,
): Promise<ComparisonResult> {
  const clauseList = clauses
    .map((c, i) => `CONTRACT ${i + 1} (${c.contractName}):\n${c.text}`)
    .join("\n\n---\n\n");

  const completion = await client().chat.completions.create(
    {
      model: MODEL,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a legal expert specialising in contract harmonisation. Always respond with valid JSON only — no markdown, no code fences, no prose.",
        },
        {
          role: "user",
          content: `Compare the following "${clauseType}" clauses (contractual effect: ${contractualEffect}) from ${clauses.length} different contracts:

${clauseList}

Provide:
1. A concise summary of the overlap/similarities between these clauses
2. A bullet list of similarities
3. A bullet list of key differences
4. A professionally drafted, balanced normalised wording that captures the best elements from all versions and resolves the differences fairly

Respond ONLY with valid JSON:
{
  "clauseType": "${clauseType}",
  "contractualEffect": "${contractualEffect}",
  "overlapSummary": "Summary of what these clauses have in common...",
  "similarities": ["Point 1", "Point 2"],
  "differences": ["Difference 1", "Difference 2"],
  "aiSuggestedWording": "Full normalised clause text..."
}`,
        },
      ],
    },
    { signal },
  );

  if (completion.choices[0]?.finish_reason !== "stop") {
    throw new Error("Incomplete model response");
  }
  const responseText = completion.choices[0]?.message?.content ?? "";

  return parseComparison(responseText, clauseType, contractualEffect);
}
