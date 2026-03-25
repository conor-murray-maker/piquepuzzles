import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAdminAction } from "@/hooks/useAdminQuery";
import { useToast } from "@/hooks/use-toast";
import { KlondikeEngine } from "@/engines/KlondikeEngine";
import { FreeCellEngine } from "@/engines/FreeCellEngine";
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
  band: "easy" | "medium";
  ddsMin: number;
  ddsMax: number;
  target: number;
}

/** Apply path diversity modifier to base DDS. Cap ±10 points. */
function applyPathDiversityModifier(baseDds: number, pathDiversityScore: number): number {
  let modifier = 0;
  if (pathDiversityScore < 0.1) modifier = 8;
  else if (pathDiversityScore > 0.5) modifier = -5;
  modifier = Math.max(-10, Math.min(10, modifier));
  return Math.max(0, Math.min(100, baseDds + modifier));
}

function getDifficultyTier(dds: number): string {
  if (dds <= 25) return "Easy";
  if (dds <= 55) return "Medium";
  if (dds <= 80) return "Hard";
  return "Expert";
}

const TARGETS: Target[] = [
  { gameMode: "klondike", engine: KlondikeEngine, simCount: 200, band: "easy", ddsMin: 0, ddsMax: 25, target: 75 },
  { gameMode: "klondike", engine: KlondikeEngine, simCount: 200, band: "medium", ddsMin: 26, ddsMax: 55, target: 50 },
  { gameMode: "freecell", engine: FreeCellEngine, simCount: 50, band: "easy", ddsMin: 0, ddsMax: 25, target: 75 },
  { gameMode: "freecell", engine: FreeCellEngine, simCount: 50, band: "medium", ddsMin: 26, ddsMax: 55, target: 50 },
];

const MAX_CANDIDATES = 8000;

export function StarterPoolGenerator() {
  const action = useAdminAction();
  const { toast } = useToast();
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

    const collected: VerifiedDeal[] = [];
    const counts: Record<string, number> = {};
    for (const t of TARGETS) {
      counts[`${t.gameMode}-${t.band}`] = 0;
    }

    let totalTried = 0;
    let starterCount = 0;
    let bankedCount = 0;

    addStatus("Starting solver-verified deal generation (Wilson confidence)...");
    addStatus(`Targets: 75 Easy + 50 Medium per mode (300 starter), bank all solvable`);

    const engines: Record<string, { engine: PuzzleEngine; simCount: number }> = {
      klondike: { engine: KlondikeEngine, simCount: 200 },
      freecell: { engine: FreeCellEngine, simCount: 50 },
    };

    const startTime = Date.now();

    while (totalTried < MAX_CANDIDATES && !abortRef.current) {
      const allStarterMet = TARGETS.every(t => counts[`${t.gameMode}-${t.band}`] >= t.target);
      if (allStarterMet) {
        addStatus("✓ All starter targets met!");
        break;
      }

      for (let b = 0; b < 5 && totalTried < MAX_CANDIDATES && !abortRef.current; b++) {
        totalTried++;
        const seed = generateSeed();

        for (const [gameMode, { engine, simCount }] of Object.entries(engines)) {
          try {
            const deal = engine.generateDeal(seed);
            const verifyResult = engine.verifySolvable(deal, simCount);

            if (!verifyResult.solvable || verifyResult.minSolutionLength <= 0) continue;

            // Base DDS from calibration curve
            let dds = verifyResult.complexityScore;
            const pathDiv = verifyResult.pathDiversityScore;
            const uniquePaths = verifyResult.uniqueWinningPaths;

            // Apply path diversity modifier to DDS
            dds = applyPathDiversityModifier(dds, pathDiv);

            // Calculate Wilson confidence
            const confResult = calculateDealConfidence({
              wins: verifyResult.wins,
              totalSimulations: verifyResult.simulations,
              pathDiversityScore: pathDiv,
              dds,
            });

            // Determine if this is a starter deal (Easy or Medium)
            let isStarter = false;
            let reservedFor: string | null = null;

            for (const t of TARGETS) {
              if (t.gameMode !== gameMode) continue;
              if (dds >= t.ddsMin && dds <= t.ddsMax && counts[`${t.gameMode}-${t.band}`] < t.target) {
                isStarter = true;
                counts[`${t.gameMode}-${t.band}`]++;
                if (t.band === "easy") reservedFor = "onboarding";
                break;
              }
            }

            collected.push({
              seed,
              game_mode: gameMode,
              draw_mode: 3,
              min_moves: verifyResult.minSolutionLength,
              dds_initial: dds,
              dds_blended: dds,
              simulation_count: verifyResult.simulations,
              confidence: confResult.confidence,
              tier: isStarter ? "starter" : "fresh",
              is_calibration: isStarter,
              reserved_for: reservedFor,
              unique_winning_paths: uniquePaths,
              path_diversity_score: Math.round(pathDiv * 1000) / 1000,
            });

            bankedCount++;
            if (isStarter) starterCount++;
          } catch {
            // Skip failed attempt
          }
        }
      }

      setCandidatesTried(totalTried);
      setStarterFound(starterCount);
      setTotalBanked(bankedCount);

      if (bankedCount % 10 < 5 && totalTried % 5 === 0) {
        const rate = totalTried > 0 ? ((bankedCount / (totalTried * 2)) * 100).toFixed(1) : "0";
        const parts = TARGETS.map(t => `${t.gameMode} ${t.band}: ${counts[`${t.gameMode}-${t.band}`]}/${t.target}`);
        addStatus(`[${totalTried}] Starter: ${starterCount}/300, Banked: ${bankedCount}, Rate: ${rate}% — ${parts.join(", ")}`);
      }

      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (collected.length === 0) {
      addStatus(`✗ No verified deals found after ${totalTried} candidates (${elapsed}s)`);
      setRunning(false);
      return;
    }

    addStatus(`Found ${starterCount} starter + ${bankedCount - starterCount} bonus deals in ${elapsed}s. Inserting in batches...`);

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
    addStatus(`✓ Total inserted: ${totalInserted} deals (${starterCount} starter, ${totalInserted - starterCount} bonus)`);
    toast({ title: "Starter pool seeded", description: `${totalInserted} verified deals inserted (${starterCount} starter)` });

    setRunning(false);
  }, [action, addStatus, toast]);

  const totalTarget = TARGETS.reduce((s, t) => s + t.target, 0);
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
          Generates solver-verified solvable deals with Wilson score confidence intervals and path diversity scoring.
          Target: 75 Easy + 50 Medium per game mode (300 starter).
          Confidence = 50% Wilson interval + 30% tier stability + 20% path diversity.
          Up to {MAX_CANDIDATES.toLocaleString()} candidates.
        </p>

        <Button onClick={run} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {running ? "Generating..." : "Generate Verified Starter Pool"}
        </Button>

        {running && (
          <Button variant="outline" size="sm" onClick={() => { abortRef.current = true; }}>
            Stop
          </Button>
        )}

        {(running || result) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Starter: {starterFound} / {totalTarget}</span>
              <span className="text-muted-foreground">Total banked: {totalBanked} | {candidatesTried} candidates</span>
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
                <span>Inserted {result.inserted} verified deals ({starterFound} starter, {result.inserted - starterFound} bonus)</span>
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
