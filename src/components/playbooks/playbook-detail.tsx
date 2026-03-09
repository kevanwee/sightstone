"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft, Upload, FileText, Trash2, Sparkles, Loader2,
  GitMerge, CheckCircle2, Download, AlertCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ClauseGroupCard } from "@/components/playbooks/clause-group-card";
import {
  cn, formatDate, STATUS_COLOURS, CONTRACTUAL_EFFECT_ORDER, CONTRACTUAL_EFFECT_LABELS,
} from "@/lib/utils";

// ─── Types (mirroring Prisma shape) ───────────────────────────────────────────
type Contract = {
  id: string; name: string; fileType: string; status: string;
  createdAt: string; _count: { clauses: number };
};

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

type Playbook = {
  id: string; name: string; description: string | null; status: string;
  createdAt: string; contracts: Contract[]; clauseGroups: ClauseGroup[];
  organisation: { id: string; name: string };
};

// ─── Component ────────────────────────────────────────────────────────────────
export function PlaybookDetail({ playbook: initial }: { playbook: Playbook }) {
  const router = useRouter();
  const [playbook, setPlaybook] = useState<Playbook>(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysing, setAnalysing] = useState(initial.status === "ANALYSING");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<string>(
    initial.status === "REVIEW" || initial.status === "HARMONISED" ? "harmonise" : "contracts"
  );

  // Poll analysis status while ANALYSING
  useEffect(() => {
    if (!analysing) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/playbooks/${playbook.id}/analyse`);
      const data = await res.json();
      if (data.status !== "ANALYSING") {
        setAnalysing(false);
        router.refresh();
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [analysing, playbook.id, router]);

  // ── File drop ──────────────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setError("");
    setUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      acceptedFiles.forEach((f) => formData.append("files", f));
      setUploadProgress(40);

      const res = await fetch(`/api/playbooks/${playbook.id}/contracts`, {
        method: "POST",
        body: formData,
      });
      setUploadProgress(80);

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      setUploadProgress(100);
      router.refresh();

      // Update local state
      setPlaybook((prev) => ({
        ...prev,
        contracts: [
          ...prev.contracts,
          ...data.contracts.map((c: Contract) => ({
            ...c, _count: { clauses: 0 }, createdAt: new Date().toISOString(),
          })),
        ],
      }));
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setTimeout(() => { setUploading(false); setUploadProgress(0); }, 1000);
    }
  }, [playbook.id, router]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    multiple: true,
    disabled: uploading,
  });

  // ── Delete contract ────────────────────────────────────────────────────────
  async function deleteContract(contractId: string) {
    try {
      await fetch(
        `/api/playbooks/${playbook.id}/contracts?contractId=${contractId}`,
        { method: "DELETE" }
      );
      setPlaybook((prev) => ({
        ...prev,
        contracts: prev.contracts.filter((c) => c.id !== contractId),
      }));
    } catch {
      setError("Failed to delete contract");
    }
  }

  // ── Start analysis ─────────────────────────────────────────────────────────
  async function startAnalysis() {
    setError("");
    try {
      const res = await fetch(`/api/playbooks/${playbook.id}/analyse`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start analysis");
        return;
      }
      setAnalysing(true);
      setPlaybook((prev) => ({ ...prev, status: "ANALYSING" }));
    } catch {
      setError("Failed to start analysis");
    }
  }

  // ── Harmonise selection ────────────────────────────────────────────────────
  async function harmoniseGroup(
    groupId: string,
    action: "select_existing" | "use_ai" | "custom",
    preferredClauseId?: string,
    customWording?: string
  ) {
    try {
      const res = await fetch(`/api/playbooks/${playbook.id}/harmonise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, action, preferredClauseId, customWording }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save selection");
        return;
      }
      // Update local state
      setPlaybook((prev) => ({
        ...prev,
        status: data.allHarmonised ? "HARMONISED" : prev.status,
        clauseGroups: prev.clauseGroups.map((g) =>
          g.id === groupId ? { ...g, ...data.group } : g
        ),
      }));
    } catch {
      setError("Failed to save selection");
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const processedContracts = playbook.contracts.filter((c) => c.status === "PROCESSED");
  const canAnalyse = processedContracts.length >= 2 && !analysing;

  const sortedGroups = [...playbook.clauseGroups].sort((a, b) => {
    const orderA = CONTRACTUAL_EFFECT_ORDER[a.contractualEffect] ?? 99;
    const orderB = CONTRACTUAL_EFFECT_ORDER[b.contractualEffect] ?? 99;
    return orderA - orderB;
  });

  const harmonisedCount = playbook.clauseGroups.filter((g) =>
    ["USER_SELECTED", "AI_SUGGESTED", "FINALISED"].includes(g.harmonisationStatus)
  ).length;

  const totalGroups = playbook.clauseGroups.length;
  const harmonisedPct = totalGroups > 0 ? Math.round((harmonisedCount / totalGroups) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link href="/dashboard/playbooks">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{playbook.name}</h1>
            <Badge className={cn(STATUS_COLOURS[playbook.status], "capitalize")}>
              {playbook.status.toLowerCase().replace("_", " ")}
            </Badge>
          </div>
          {playbook.description && (
            <p className="mt-1 text-sm text-slate-500">{playbook.description}</p>
          )}
          <p className="mt-0.5 text-xs text-slate-400">{playbook.organisation.name} · Created {formatDate(playbook.createdAt)}</p>
        </div>
        {playbook.status === "HARMONISED" && (
          <a href={`/api/playbooks/${playbook.id}/export`} download>
            <Button variant="outline" className="gap-2 flex-shrink-0">
              <Download className="h-4 w-4" />
              Export playbook
            </Button>
          </a>
        )}
      </div>

      {/* ── Analysis banner ────────────────────────────────────────────────── */}
      {analysing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <p className="font-medium text-blue-900">AI is analysing your contracts…</p>
          </div>
          <p className="mb-3 text-sm text-blue-700">
            Extracting clauses, grouping by type, comparing wording, and generating normalised suggestions.
            This can take 1–2 minutes per contract.
          </p>
          <Progress value={undefined} className="h-2 bg-blue-100 [&>div]:animate-pulse" />
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="contracts" className="gap-2">
              <FileText className="h-4 w-4" />
              Contracts ({playbook.contracts.length})
            </TabsTrigger>
            <TabsTrigger value="harmonise" className="gap-2" disabled={playbook.clauseGroups.length === 0}>
              <GitMerge className="h-4 w-4" />
              Harmonise ({totalGroups})
            </TabsTrigger>
          </TabsList>

          {activeTab === "contracts" && canAnalyse && (
            <Button
              onClick={startAnalysis}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Sparkles className="h-4 w-4" />
              Analyse contracts
            </Button>
          )}

          {activeTab === "contracts" && !canAnalyse && processedContracts.length < 2 && (
            <p className="text-sm text-slate-500">Upload at least 2 contracts to analyse</p>
          )}

          {activeTab === "harmonise" && !analysing && (
            <Button
              onClick={startAnalysis}
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!canAnalyse}
            >
              <RefreshCw className="h-4 w-4" />
              Re-analyse
            </Button>
          )}
        </div>

        {/* ── Contracts Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="contracts" className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors",
              isDragActive
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 hover:border-blue-300 hover:bg-slate-50",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              {uploading ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                  <p className="font-medium text-slate-700">Uploading & parsing…</p>
                  <Progress value={uploadProgress} className="h-2 w-48" />
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50">
                    <Upload className="h-7 w-7 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">
                      {isDragActive ? "Drop your contracts here" : "Drag & drop contracts here"}
                    </p>
                    <p className="text-sm text-slate-400">or click to browse — PDF, DOCX, TXT supported</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Contract list */}
          {playbook.contracts.length > 0 && (
            <div className="space-y-2">
              {playbook.contracts.map((contract) => (
                <Card key={contract.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <FileText className="h-5 w-5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{contract.name}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="uppercase">{contract.fileType}</span>
                        <span>·</span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs",
                            contract.status === "PROCESSED" && "bg-green-100 text-green-700",
                            contract.status === "PROCESSING" && "bg-blue-100 text-blue-700",
                            contract.status === "ERROR" && "bg-red-100 text-red-700",
                            contract.status === "PENDING" && "bg-slate-100 text-slate-600"
                          )}
                        >
                          {contract.status === "PROCESSED" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {contract.status === "PROCESSING" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {contract.status.toLowerCase()}
                        </Badge>
                        {contract._count.clauses > 0 && (
                          <>
                            <span>·</span>
                            <span>{contract._count.clauses} clauses extracted</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 text-slate-400 hover:text-red-500"
                      onClick={() => deleteContract(contract.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* CTA for analysis */}
          {processedContracts.length >= 2 && !analysing && (
            <Card className="border-blue-100 bg-blue-50/50">
              <CardContent className="flex items-center justify-between py-5">
                <div>
                  <p className="font-medium text-slate-900">
                    {processedContracts.length} contracts ready for analysis
                  </p>
                  <p className="text-sm text-slate-500">
                    AI will extract & compare clauses, then group by contractual effect.
                  </p>
                </div>
                <Button
                  onClick={startAnalysis}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                >
                  <Sparkles className="h-4 w-4" />
                  Analyse now
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Harmonise Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="harmonise" className="space-y-6">
          {playbook.clauseGroups.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <GitMerge className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                <h3 className="font-medium text-slate-700">No clause groups yet</h3>
                <p className="text-sm text-slate-400">Upload contracts and run analysis to see clauses here.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Progress header */}
              <Card>
                <CardContent className="py-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">Harmonisation progress</p>
                      <p className="text-sm text-slate-500">
                        {harmonisedCount} of {totalGroups} clause groups harmonised
                      </p>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">{harmonisedPct}%</span>
                  </div>
                  <Progress value={harmonisedPct} className="h-2" />
                </CardContent>
              </Card>

              {/* Group by contractual effect */}
              {Object.entries(
                sortedGroups.reduce<Record<string, ClauseGroup[]>>((acc, g) => {
                  const key = CONTRACTUAL_EFFECT_LABELS[g.contractualEffect] ?? g.contractualEffect;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(g);
                  return acc;
                }, {})
              ).map(([effectLabel, groups]) => (
                <div key={effectLabel}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    {effectLabel}
                  </h3>
                  <div className="space-y-4">
                    {groups.map((group) => (
                      <ClauseGroupCard
                        key={group.id}
                        group={group}
                        onHarmonise={harmoniseGroup}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* All harmonised banner */}
              {playbook.status === "HARMONISED" && (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                      <div>
                        <CardTitle className="text-green-900">Playbook harmonised!</CardTitle>
                        <CardDescription className="text-green-700">
                          All clause groups have been harmonised. Export your playbook below.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <a href={`/api/playbooks/${playbook.id}/export`} download>
                      <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                        <Download className="h-4 w-4" />
                        Download harmonised playbook
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
