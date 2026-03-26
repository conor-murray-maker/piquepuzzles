import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminAction } from "@/hooks/useAdminQuery";
import { useToast } from "@/hooks/use-toast";
import { KlondikeEngine } from "@/engines/KlondikeEngine";
import { FreeCellEngine } from "@/engines/FreeCellEngine";
import { RealmEngine } from "@/engines/RealmEngine";
import { PuzzleEngine } from "@/engines/PuzzleEngine";
import { generateSeed } from "@/game/deck";
import { calculateDealConfidence } from "@/lib/wilsonConfidence";
import { Database, Loader2, CheckCircle, XCircle } from "lucide-react";

interface VerifiedDeal {
  seed: number;
  game_mode: string;
  draw_mode: number;
  min_moves: number;
  dds_initial: number;
  dds_blended: number;
  simulation_count: number;
  simulation_wins: number;
  confidence: number;
  tier: string;
  is_calibration: boolean;
  reserved_for: string | null;
  unique_winning_paths: number;
  path_diversity_score: number;
}

interface Target {
  gameMode: string;
  engine: PuzzleEngine;
  simCount: number;
  band: string;
  ddsMin: number;
  ddsMax: number;
  target: number;
}

function applyPathDiversityModifier(baseDds: number, pathDiversityScore: number): number {
  let modifier = 0;
  if (pathDiversityScore < 0.1) modifier = 8;
  else if (pathDiversityScore > 0.5) modifier = -5;
  modifier = Math.max(-10, Math.min(10, modifier));
  return Math.max(0, Math.min(100, baseDds + modifier));
}

const TARGETS_BY_MODE: Record<string, Target[]> = {
  klondike: [
    { gameMode: "klondike", engine: KlondikeEngine, simCount: 200, band: "easy", ddsMin: 0, ddsMax: 25, target: 75 },
    { gameMode: "klondike", engine: KlondikeEngine, simCount: 200, band: "medium", ddsMin: 26, ddsMax: 55, target: 50 },
  ],
  freecell: [
    { gameMode: "freecell", engine: FreeCellEngine, simCount: 50, band: "easy", ddsMin: 0, ddsMax: 25, target: 75 },
    { gameMode: "freecell", engine: FreeCellEngine, simCount: 50, band: "medium", ddsMin: 26, ddsMax: 55, target: 50 },
  ],
  realm: [
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "easy", ddsMin: 0, ddsMax: 30, target: 50 },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "medium", ddsMin: 31, ddsMax: 55, target: 40 },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "hard", ddsMin: 56, ddsMax: 80, target: 30 },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "expert", ddsMin: 81, ddsMax: 100, target: 20 },
  ],
};

const MAX_CANDIDATES = 8000;

export function StarterPoolGenerator() {
  const action = useAdminAction();
  const { toast } = useToast();
  const [selectedMode, setSelectedMode] = useState<string>("klondike");
  const [running, setRunning] = useState(false);
  const [candidatesTried, setCandidatesTried] = useState(0);
  const [starterFound, setStarterFound] = useState(0);
  const [totalBanked, setTotalBanked] = useState(0);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; total: number } | null>(null);
  const abortRef = useRef(false);

  const addStatus = useCallback((line: string) => {
    setStatusLines(prev => [...prev.slice(-14), line]);
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setCandidatesTried(0);
    setStarterFound(0);
    setTotalBanked(0);
    setStatusLines([]);
    setResult(null);
    abortRef.current = false;

    const targets = TARGETS_BY_MODE[selectedMode];
    const collected: VerifiedDeal[] = [];
    const counts: Record<string, number> = {};
    for (const t of targets) counts[t.band] = 0;

    const totalTarget = targets.reduce((s, t) => s + t.target, 0);
    let totalTried = 0;
    let starterCount = 0;
    let bankedCount = 0;

    const isRealm = selectedMode === "realm";
    addStatus(`Starting ${selectedMode} deal generation...`);
    addStatus(`Targets: ${targets.map(t => `${t.target} ${t.band}`).join(", ")} (${totalTarget} total)`);

    const engine = targets[0].engine;
    const simCount = targets[0].simCount;
    const startTime = Date.now();

    while (totalTried < MAX_CANDIDATES && !abortRef.current) {
      const allMet = targets.every(t => counts[t.band] >= t.target);
      if (allMet) {
        addStatus("✓ All targets met!");
        break;
      }

      for (let b = 0; b < 5 && totalTried < MAX_CANDIDATES && !abortRef.current; b++) {
        totalTried++;
        const seed = generateSeed();

        try {
          const deal = engine.generateDeal(seed);
          const verifyResult = engine.verifySolvable(deal, simCount);

          if (!verifyResult.solvable || verifyResult.minSolutionLength <= 0) continue;

          let dds = verifyResult.complexityScore;
          const pathDiv = verifyResult.pathDiversityScore;
          const uniquePaths = verifyResult.uniqueWinningPaths;

          if (!isRealm) {
            dds = applyPathDiversityModifier(dds, pathDiv);
          }

          // Confidence: Realm is binary, others use Wilson
          let confidence: number;
          if (isRealm) {
            confidence = 1.0; // unique solution verified by engine
          } else {
            const confResult = calculateDealConfidence({
              wins: verifyResult.wins,
              totalSimulations: verifyResult.simulations,
              dds,
            });
            confidence = confResult.confidence;
          }

          let isStarter = false;
          let reservedFor: string | null = null;

          for (const t of targets) {
            if (dds >= t.ddsMin && dds <= t.ddsMax && counts[t.band] < t.target) {
              if (isRealm) {
                isStarter = t.band === "easy" || t.band === "medium";
              } else {
                isStarter = true;
              }
              counts[t.band]++;
              if (t.band === "easy") reservedFor = "onboarding";
              break;
            }
          }

          collected.push({
            seed,
            game_mode: selectedMode,
            draw_mode: isRealm ? 0 : 3,
            min_moves: verifyResult.minSolutionLength,
            dds_initial: dds,
            dds_blended: dds,
            simulation_count: isRealm ? 1 : verifyResult.simulations,
            simulation_wins: isRealm ? 0 : verifyResult.wins,
            confidence,
            tier: isStarter ? "starter" : "fresh",
            is_calibration: isStarter,
            reserved_for: reservedFor,
            unique_winning_paths: isRealm ? 1 : uniquePaths,
            path_diversity_score: isRealm ? 0 : Math.round(pathDiv * 1000) / 1000,
          });

          bankedCount++;
          if (isStarter) starterCount++;
        } catch {
          // Skip failed attempt
        }
      }

      setCandidatesTried(totalTried);
      setStarterFound(starterCount);
      setTotalBanked(bankedCount);

      if (totalTried % 5 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = totalTried > 0 ? ((bankedCount / totalTried) * 100).toFixed(1) : "0";
        const remaining = bankedCount > 0
          ? ((totalTarget - starterCount) / (starterCount / (Date.now() - startTime)) / 1000).toFixed(0)
          : "?";
        const parts = targets.map(t => `${t.band}: ${counts[t.band]}/${t.target}`);
        addStatus(`[${totalTried}] ${elapsed}s | Rate: ${rate}% | ETA: ${remaining}s — ${parts.join(", ")}`);
      }

      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (collected.length === 0) {
      addStatus(`✗ No verified deals found after ${totalTried} candidates (${elapsed}s)`);
      setRunning(false);
      return;
    }

    addStatus(`Found ${bankedCount} deals (${starterCount} starter) in ${elapsed}s. Inserting...`);

    let totalInserted = 0;
    for (let i = 0; i < collected.length; i += 50) {
      const batch = collected.slice(i, i + 50);
      try {
        const res = await action.mutateAsync({
          action: "seed_starter_pool",
          params: { deals: batch },
        });
        totalInserted += res.inserted || 0;
        addStatus(`Batch ${Math.floor(i / 50) + 1}: inserted ${res.inserted} deals`);
      } catch (e: any) {
        addStatus(`✗ Batch ${Math.floor(i / 50) + 1} failed: ${e.message}`);
      }
    }

    setResult({ inserted: totalInserted, total: collected.length });
    addStatus(`✓ Total inserted: ${totalInserted} deals (${starterCount} starter)`);
    toast({ title: `${selectedMode} pool seeded`, description: `${totalInserted} verified deals inserted` });

    setRunning(false);
  }, [action, addStatus, toast, selectedMode]);

  const targets = TARGETS_BY_MODE[selectedMode];
  const totalTarget = targets.reduce((s, t) => s + t.target, 0);
  const progress = Math.min(100, (starterFound / totalTarget) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4" />
          Starter Pool Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Generates solver-verified deals per game mode. Select a mode and generate.
        </p>

        <div className="flex items-center gap-3">
          <Select value={selectedMode} onValueChange={setSelectedMode} disabled={running}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="klondike">Klondike</SelectItem>
              <SelectItem value="freecell">FreeCell</SelectItem>
              <SelectItem value="realm">Realm</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={run} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {running ? "Generating..." : "Generate"}
          </Button>

          {running && (
            <Button variant="outline" size="sm" onClick={() => { abortRef.current = true; }}>
              Stop
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {selectedMode === "realm"
            ? "Realm: 50 Easy (6×6), 40 Medium (7-8×), 30 Hard (8-9×), 20 Expert (9-10×). Confidence=1.0 (unique solution)."
            : `${selectedMode}: 75 Easy + 50 Medium starter deals with Wilson confidence scoring.`}
        </p>

        {(running || result) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Starter: {starterFound} / {totalTarget}</span>
              <span className="text-muted-foreground">Banked: {totalBanked} | {candidatesTried} tried</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {statusLines.length > 0 && (
          <div className="bg-muted/50 rounded border p-3 max-h-64 overflow-y-auto">
            {statusLines.map((line, i) => (
              <p key={i} className="text-xs font-mono leading-relaxed">
                {line.startsWith("✓") ? (
                  <span className="text-emerald-600">{line}</span>
                ) : line.startsWith("✗") || line.startsWith("⚠") ? (
                  <span className="text-destructive">{line}</span>
                ) : (
                  line
                )}
              </p>
            ))}
          </div>
        )}

        {result && (
          <div className="flex items-center gap-2 text-sm">
            {result.inserted > 0 ? (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span>Inserted {result.inserted} verified deals ({starterFound} starter)</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span>No deals were inserted</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
