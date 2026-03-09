import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export type ClauseExtractionResult = {
  clauses: {
    originalText: string;
    clauseType: string;
    contractualEffect: string;
    riskLevel: string;
    position: number;
  }[];
};

export type ComparisonResult = {
  clauseType: string;
  contractualEffect: string;
  overlapSummary: string;
  similarities: string[];
  differences: string[];
  aiSuggestedWording: string;
};

// ─── Extract Clauses from Contract Text ───────────────────────────────────────

export async function extractClausesFromText(
  text: string,
  contractName: string
): Promise<ClauseExtractionResult> {
  const message = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022", // cheapest Claude model
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a legal expert specialising in contract analysis. 

Extract ALL distinct clauses from the following contract text. For each clause, identify:
1. The exact original text of the clause
2. The clause type/category (e.g. "Limitation of Liability", "Indemnity", "Confidentiality", "Termination", "Governing Law", "Intellectual Property", "Payment Terms", "Force Majeure", "Warranty", "Dispute Resolution", etc.)
3. The contractual effect - choose exactly ONE from: RIGHTS_GRANT, OBLIGATION, LIMITATION, EXCLUSION, INDEMNITY, REPRESENTATION, WARRANTY, TERMINATION, GOVERNANCE, DEFINITION, BOILERPLATE, OTHER
4. Risk level - choose exactly ONE from: LOW, MEDIUM, HIGH, CRITICAL
5. Position (sequential order, starting from 1)

Contract: "${contractName}"

Contract Text:
---
${text.substring(0, 15000)}
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
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    return JSON.parse(jsonMatch[0]) as ClauseExtractionResult;
  } catch {
    throw new Error(`Failed to parse AI response: ${content.text.substring(0, 200)}`);
  }
}

// ─── Compare Clauses of Same Type Across Contracts ────────────────────────────

export async function compareClauses(
  clauseType: string,
  contractualEffect: string,
  clauses: { contractName: string; text: string }[]
): Promise<ComparisonResult> {
  const clauseList = clauses
    .map((c, i) => `CONTRACT ${i + 1} (${c.contractName}):\n${c.text}`)
    .join("\n\n---\n\n");

  const message = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a legal expert specialising in contract harmonisation.

Compare the following "${clauseType}" clauses (contractual effect: ${contractualEffect}) from ${clauses.length} different contracts:

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
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");
  return JSON.parse(jsonMatch[0]) as ComparisonResult;
}
