import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAdminAction } from "@/hooks/useAdminQuery";
import { useToast } from "@/hooks/use-toast";
import { KlondikeEngine } from "@/engines/KlondikeEngine";
import { FreeCellEngine } from "@/engines/FreeCellEngine";
import { PuzzleEngine, VerificationResult } from "@/engines/PuzzleEngine";
import { generateSeed } from "@/game/deck";
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
}

interface Target {
  gameMode: string;
  engine: PuzzleEngine;
  band: "easy" | "medium";
  ddsMin: number;
  ddsMax: number;
  target: number;
}

const TARGETS: Target[] = [
  { gameMode: "klondike", engine: KlondikeEngine, band: "easy", ddsMin: 0, ddsMax: 25, target: 30 },
  { gameMode: "klondike", engine: KlondikeEngine, band: "medium", ddsMin: 26, ddsMax: 55, target: 20 },
  { gameMode: "freecell", engine: FreeCellEngine, band: "easy", ddsMin: 0, ddsMax: 25, target: 30 },
  { gameMode: "freecell", engine: FreeCellEngine, band: "medium", ddsMin: 26, ddsMax: 55, target: 20 },
];

const MAX_CANDIDATES = 2000;
const SIMS_PER_DEAL = 50;

export function StarterPoolGenerator() {
  const action = useAdminAction();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [candidatesTried, setCandidatesTried] = useState(0);
  const [found, setFound] = useState(0);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; total: number } | null>(null);
  const abortRef = useRef(false);

  const addStatus = useCallback((line: string) => {
    setStatusLines(prev => [...prev.slice(-9), line]);
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setCandidatesTried(0);
    setFound(0);
    setStatusLines([]);
    setResult(null);
    abortRef.current = false;

    const collected: Record<string, VerifiedDeal[]> = {};
    const counts: Record<string, number> = {};
    for (const t of TARGETS) {
      const key = `${t.gameMode}-${t.band}`;
      collected[key] = [];
      counts[key] = 0;
    }

    let totalTried = 0;
    let totalFound = 0;

    addStatus("Starting solver-verified deal generation...");

    const processBatch = async (batchSize: number): Promise<boolean> => {
      for (let i = 0; i < batchSize; i++) {
        if (abortRef.current) return false;

        const allMet = TARGETS.every(t => counts[`${t.gameMode}-${t.band}`] >= t.target);
        if (allMet) return false;

        totalTried++;
        const seed = generateSeed();

        for (const t of TARGETS) {
          const key = `${t.gameMode}-${t.band}`;
          if (counts[key] >= t.target) continue;

          const deal = t.engine.generateDeal(seed);
          const result: VerificationResult = t.engine.verifySolvable(deal, SIMS_PER_DEAL);

          if (!result.solvable) continue;

          const dds = result.complexityScore;
          if (dds < t.ddsMin || dds > t.ddsMax) continue;

          const confidence = Math.min(1, result.simulations / 50);

          collected[key].push({
            seed,
            game_mode: t.gameMode,
            draw_mode: 3,
            min_moves: result.minSolutionLength,
            dds_initial: dds,
            dds_blended: dds,
            simulation_count: result.simulations,
            confidence,
            tier: "fresh",
            is_calibration: true,
            reserved_for: t.band === "easy" ? "onboarding" : null,
          });

          counts[key]++;
          totalFound++;
          break;
        }
      }
      return true;
    };

    const startTime = Date.now();
    while (totalTried < MAX_CANDIDATES && !abortRef.current) {
      const allMet = TARGETS.every(t => counts[`${t.gameMode}-${t.band}`] >= t.target);
      if (allMet) break;

      await new Promise<void>(resolve => {
        setTimeout(async () => {
          await processBatch(10);
          resolve();
        }, 0);
      });

      setCandidatesTried(totalTried);
      setFound(totalFound);

      if (totalTried % 100 === 0) {
        const parts = TARGETS.map(t => {
          const key = `${t.gameMode}-${t.band}`;
          return `${t.gameMode} ${t.band}: ${counts[key]}/${t.target}`;
        });
        addStatus(`Tried ${totalTried} seeds — ${parts.join(", ")}`);
      }

      if (Date.now() - startTime > 120000) {
        addStatus("⚠ Timeout reached (120s), saving what we have...");
        break;
      }
    }

    const allDeals = Object.values(collected).flat();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (allDeals.length === 0) {
      addStatus(`✗ No verified deals found after ${totalTried} candidates (${elapsed}s)`);
      setRunning(false);
      return;
    }

    addStatus(`Found ${allDeals.length} verified deals in ${elapsed}s. Inserting...`);

    try {
      const res = await action.mutateAsync({
        action: "seed_starter_pool",
        params: { deals: allDeals },
      });
      setResult({ inserted: res.inserted, total: allDeals.length });
      addStatus(`✓ Inserted ${res.inserted} deals into the pool`);
      toast({ title: "Starter pool seeded", description: `${res.inserted} verified deals inserted` });
    } catch (e: any) {
      addStatus(`✗ Insert failed: ${e.message}`);
      toast({ title: "Insert failed", description: e.message, variant: "destructive" });
    }

    setRunning(false);
  }, [action, addStatus, toast]);

  const totalTarget = TARGETS.reduce((s, t) => s + t.target, 0);
  const progress = Math.min(100, (found / totalTarget) * 100);

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
          Generates solver-verified solvable deals for new player onboarding.
          Target: 30 Easy + 20 Medium per game mode (100 total). Each deal is
          verified with {SIMS_PER_DEAL} MCTS simulations.
        </p>

        <Button onClick={run} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {running ? "Generating..." : "Generate Verified Starter Pool"}
        </Button>

        {running && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { abortRef.current = true; }}
          >
            Stop
          </Button>
        )}

        {(running || result) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Found {found} / {totalTarget} verified deals</span>
              <span className="text-muted-foreground">{candidatesTried} candidates tried</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {statusLines.length > 0 && (
          <div className="bg-muted/50 rounded border p-3 max-h-48 overflow-y-auto">
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
                <span>Successfully inserted {result.inserted} verified deals</span>
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
