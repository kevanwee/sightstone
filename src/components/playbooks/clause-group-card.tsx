"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Sparkles, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn, RISK_LEVEL_COLOURS } from "@/lib/utils";

type Clause = {
  id: string; originalText: string; clauseType: string;
  contractualEffect: string; riskLevel: string; position: number;
  contract: { id: string; name: string };
  clauseGroupId: string | null;
};

type ClauseGroup = {
  id: string; clauseType: string; contractualEffect: string;
  overlapSummary: string | null; aiSuggestedWording: string | null;
  chosenWording: string | null; harmonisationStatus: string;
  clauses: Clause[];
};

interface Props {
  group: ClauseGroup;
  onHarmonise: (
    groupId: string,
    action: "select_existing" | "use_ai" | "custom",
    preferredClauseId?: string,
    customWording?: string
  ) => Promise<void>;
}

export function ClauseGroupCard({ group, onHarmonise }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customWording, setCustomWording] = useState(group.chosenWording ?? "");
  const [saving, setSaving] = useState(false);

  const isHarmonised = ["USER_SELECTED", "AI_SUGGESTED", "FINALISED"].includes(
    group.harmonisationStatus
  );

  const hasDifferences = group.clauses.length > 1;

  async function handleAcceptAI() {
    setSaving(true);
    await onHarmonise(group.id, "use_ai");
    setSaving(false);
  }

  async function handleSelectExisting() {
    if (!selectedClauseId) return;
    setSaving(true);
    await onHarmonise(group.id, "select_existing", selectedClauseId);
    setSaving(false);
  }

  async function handleSaveCustom() {
    if (!customWording.trim()) return;
    setSaving(true);
    await onHarmonise(group.id, "custom", undefined, customWording);
    setSaving(false);
    setCustomMode(false);
  }

  return (
    <Card className={cn(
      "transition-shadow",
      isHarmonised ? "border-green-200 bg-green-50/30" : "border-slate-200"
    )}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-slate-900">{group.clauseType}</h4>
              <Badge variant="outline" className="text-xs">
                {group.clauses.length} version{group.clauses.length !== 1 ? "s" : ""}
              </Badge>
              {group.clauses[0] && (
                <Badge
                  className={cn("text-xs border", RISK_LEVEL_COLOURS[group.clauses[0].riskLevel])}
                  variant="outline"
                >
                  {group.clauses[0].riskLevel.toLowerCase()} risk
                </Badge>
              )}
              {isHarmonised && (
                <Badge className="bg-green-100 text-green-700 gap-1 text-xs" variant="secondary">
                  <CheckCircle2 className="h-3 w-3" />
                  harmonised
                </Badge>
              )}
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600"
          >
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>

        {/* Chosen wording preview */}
        {isHarmonised && group.chosenWording && (
          <div className="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
            <p className="mb-1 text-xs font-semibold text-green-700 uppercase tracking-wide">Harmonised wording</p>
            <p className="text-sm text-slate-700 line-clamp-3">{group.chosenWording}</p>
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5 border-t border-slate-100 pt-4">
          {/* ── Overlap summary ────────────────────────────────────────────── */}
          {group.overlapSummary && (
            <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="mb-1 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                Overlap summary
              </p>
              <p className="text-sm text-slate-700">{group.overlapSummary}</p>
            </div>
          )}

          {/* ── Individual contract wording ────────────────────────────────── */}
          {hasDifferences && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Contract versions — select one as preferred
              </p>
              <div className="space-y-3">
                {group.clauses.map((clause) => (
                  <div
                    key={clause.id}
                    onClick={() => setSelectedClauseId(
                      selectedClauseId === clause.id ? null : clause.id
                    )}
                    className={cn(
                      "cursor-pointer rounded-lg border p-4 transition-colors",
                      selectedClauseId === clause.id
                        ? "border-blue-400 bg-blue-50 ring-1 ring-blue-400"
                        : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        📄 {clause.contract.name}
                      </span>
                      {selectedClauseId === clause.id && (
                        <Check className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{clause.originalText}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI-suggested wording ───────────────────────────────────────── */}
          {group.aiSuggestedWording && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                  AI-suggested normalised wording
                </p>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{group.aiSuggestedWording}</p>
            </div>
          )}

          {/* ── Custom wording ─────────────────────────────────────────────── */}
          {customMode && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Custom wording
              </p>
              <Textarea
                value={customWording}
                onChange={(e) => setCustomWording(e.target.value)}
                rows={5}
                placeholder="Type your custom harmonised clause here…"
                className="text-sm"
              />
            </div>
          )}

          {/* ── Action buttons ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedClauseId && (
              <Button
                size="sm"
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSelectExisting}
                disabled={saving}
              >
                {saving ? <Loader2Size /> : <Check className="h-3.5 w-3.5" />}
                Use selected wording
              </Button>
            )}

            {group.aiSuggestedWording && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                onClick={handleAcceptAI}
                disabled={saving}
              >
                {saving ? <Loader2Size /> : <Sparkles className="h-3.5 w-3.5" />}
                Accept AI suggestion
              </Button>
            )}

            {!customMode ? (
              <Button
                size="sm"
                variant="ghost"
                className="gap-2 text-slate-600"
                onClick={() => {
                  setCustomMode(true);
                  setCustomWording(group.chosenWording ?? group.aiSuggestedWording ?? "");
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit / write custom
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-2 bg-slate-700 hover:bg-slate-900 text-white"
                  onClick={handleSaveCustom}
                  disabled={!customWording.trim() || saving}
                >
                  {saving ? <Loader2Size /> : <Check className="h-3.5 w-3.5" />}
                  Save custom wording
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCustomMode(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Loader2Size() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
