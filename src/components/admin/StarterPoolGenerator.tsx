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
import { generateRealmPuzzleSolutionFirst, generateRealmPuzzle, type GenerationStrategy, type RealmGenOptions } from "@/game/realm";
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
  gridSizes?: number[];
  skipSpatialSurprise?: boolean;
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
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "easy", ddsMin: 0, ddsMax: 30, target: 50, gridSizes: [5], skipSpatialSurprise: true },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "medium", ddsMin: 15, ddsMax: 55, target: 40, gridSizes: [6] },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "hard", ddsMin: 30, ddsMax: 80, target: 30, gridSizes: [7, 8] },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "expert", ddsMin: 60, ddsMax: 100, target: 20, gridSizes: [9, 10] },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "master", ddsMin: 100, ddsMax: 130, target: 15, gridSizes: [10, 11] },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "grandmaster", ddsMin: 120, ddsMax: 150, target: 10, gridSizes: [11, 12] },
  ],
};

const MAX_CANDIDATES = 8000;

const DIFFICULTY_OPTIONS = [
  { value: "all", label: "All Difficulties" },
  { value: "easy", label: "Easy only" },
  { value: "medium", label: "Medium only" },
  { value: "hard", label: "Hard only" },
  { value: "expert", label: "Expert only" },
  { value: "master", label: "Master only" },
  { value: "grandmaster", label: "Grandmaster only" },
];

const TIMEOUT_OPTIONS = [
  { value: "0", label: "None" },
  { value: "1000", label: "1s" },
  { value: "2000", label: "2s (recommended)" },
  { value: "5000", label: "5s" },
  { value: "10000", label: "10s" },
];

const STRATEGY_OPTIONS: { value: GenerationStrategy; label: string; description: string }[] = [
  { value: "hybrid", label: "Hybrid (default)", description: "Solution-first for ≥10, legacy fallback" },
  { value: "solution-first", label: "Solution-first", description: "Crown-first for ≥10, legacy for <10" },
  { value: "legacy", label: "Legacy", description: "Original random-region approach for all sizes" },
];

export function StarterPoolGenerator() {
  const action = useAdminAction();
  const { toast } = useToast();
  const [selectedMode, setSelectedMode] = useState<string>("klondike");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedTimeout, setSelectedTimeout] = useState<string>("2000");
  const [selectedStrategy, setSelectedStrategy] = useState<GenerationStrategy>("hybrid");
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

    const allTargets = TARGETS_BY_MODE[selectedMode];
    const targets = selectedDifficulty === "all"
      ? allTargets
      : allTargets.filter(t => t.band === selectedDifficulty);

    if (targets.length === 0) {
      addStatus(`✗ No targets for ${selectedMode} ${selectedDifficulty}`);
      setRunning(false);
      return;
    }

    const collected: VerifiedDeal[] = [];
    const counts: Record<string, number> = {};
    for (const t of targets) counts[t.band] = 0;

    const totalTarget = targets.reduce((s, t) => s + t.target, 0);
    let totalTried = 0;
    let starterCount = 0;
    let bankedCount = 0;
    const timeoutMs = parseInt(selectedTimeout, 10);

    const isRealm = selectedMode === "realm";
    addStatus(`Starting ${selectedMode} deal generation (${selectedDifficulty})...`);
    addStatus(`Strategy: ${isRealm ? selectedStrategy : 'n/a (card game)'}`);
    addStatus(`Targets: ${targets.map(t => `${t.target} ${t.band}${t.gridSizes ? ` (${t.gridSizes.join('/')}×)` : ''}`).join(", ")} (${totalTarget} total)`);
    if (timeoutMs > 0) addStatus(`Timeout per candidate: ${timeoutMs}ms`);

    const engine = targets[0].engine;
    const simCount = targets[0].simCount;
    const startTime = Date.now();
    let timeoutDiscards = 0;

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
          // For Realm, pick a random target band that still needs deals to determine grid size
          let realmGridSize: number | undefined;
          let realmSkipSurprise = false;
          let targetBand: Target | undefined;

          if (isRealm) {
            // Pick a random unfilled target
            const unfilled = targets.filter(t => counts[t.band] < t.target);
            if (unfilled.length === 0) continue;
            targetBand = unfilled[Math.floor(Math.random() * unfilled.length)];
            if (targetBand.gridSizes) {
              realmGridSize = targetBand.gridSizes[Math.floor(Math.random() * targetBand.gridSizes.length)];
            }
            realmSkipSurprise = targetBand.skipSpatialSurprise ?? false;
          }

          const candidateStart = performance.now();
          let deal;
          if (isRealm) {
            const genOpts: RealmGenOptions = {
              gridSize: realmGridSize,
              skipSpatialSurprise: realmSkipSurprise,
              timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
            };
            const useLargeGridStrategy = realmGridSize && realmGridSize >= 10;

            if (useLargeGridStrategy && selectedStrategy === 'solution-first') {
              // Solution-first only
              const puzzle = generateRealmPuzzleSolutionFirst(seed, genOpts);
              deal = { seed, gameMode: 'realm' as const, data: puzzle };
            } else if (useLargeGridStrategy && selectedStrategy === 'hybrid') {
              // Try solution-first, fall back to legacy
              let puzzle = generateRealmPuzzleSolutionFirst(seed, genOpts);
              if (!puzzle) {
                puzzle = generateRealmPuzzle(seed, genOpts);
              }
              deal = { seed, gameMode: 'realm' as const, data: puzzle };
            } else {
              // Legacy for all sizes, or small grids
              deal = engine.generateDeal(seed, genOpts);
            }
          } else {
            deal = engine.generateDeal(seed);
          }

          const verifyResult = engine.verifySolvable(deal, simCount);

          if (!verifyResult.solvable || verifyResult.minSolutionLength <= 0) continue;

          let dds = verifyResult.complexityScore;
          const pathDiv = verifyResult.pathDiversityScore;
          const uniquePaths = verifyResult.uniqueWinningPaths;

          if (!isRealm) {
            dds = applyPathDiversityModifier(dds, pathDiv);
          }

          let confidence: number;
          if (isRealm) {
            confidence = 1.0;
          } else {
            const confResult = calculateDealConfidence({
              wins: verifyResult.wins,
              totalSimulations: verifyResult.simulations,
              dds,
            });
            confidence = confResult.confidence;
          }

          let reservedFor: string | null = null;

          for (const t of targets) {
            if (dds >= t.ddsMin && dds <= t.ddsMax && counts[t.band] < t.target) {
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
            tier: "fresh",
            is_calibration: false,
            reserved_for: reservedFor,
            unique_winning_paths: isRealm ? 1 : uniquePaths,
            path_diversity_score: isRealm ? 0 : Math.round(pathDiv * 1000) / 1000,
          });

          bankedCount++;
          // Count deals that matched a target band
          const matchedTarget = targets.some(t => dds >= t.ddsMin && dds <= t.ddsMax && counts[t.band] <= t.target);
          if (matchedTarget) starterCount++;
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
        const remaining = starterCount > 0
          ? ((totalTarget - starterCount) / (starterCount / (Date.now() - startTime)) / 1000).toFixed(0)
          : "?";
        const parts = targets.map(t => `${t.band}: ${counts[t.band]}/${t.target}`);
        const timeoutStr = timeoutDiscards > 0 ? ` Timeout=${timeoutDiscards}` : "";
        addStatus(`[${totalTried}] ${elapsed}s | Rate: ${rate}% | ETA: ${remaining}s — ${parts.join(", ")}${timeoutStr}`);
      }

      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (collected.length === 0) {
      addStatus(`✗ No verified deals found after ${totalTried} candidates (${elapsed}s)`);
      setRunning(false);
      return;
    }

    addStatus(`Found ${bankedCount} deals in ${elapsed}s. Inserting...`);
    if (timeoutDiscards > 0) addStatus(`⚠ ${timeoutDiscards} candidates timed out`);

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
    addStatus(`✓ Total inserted: ${totalInserted} deals`);
    toast({ title: `${selectedMode} pool seeded`, description: `${totalInserted} verified deals inserted` });

    setRunning(false);
  }, [action, addStatus, toast, selectedMode, selectedDifficulty, selectedTimeout]);

  const allTargets = TARGETS_BY_MODE[selectedMode];
  const targets = selectedDifficulty === "all"
    ? allTargets
    : allTargets.filter(t => t.band === selectedDifficulty);
  const totalTarget = targets.reduce((s, t) => s + t.target, 0);
  const progress = Math.min(100, totalTarget > 0 ? (starterFound / totalTarget) * 100 : 0);

  const difficultyOptions = selectedMode === "realm"
    ? DIFFICULTY_OPTIONS
    : DIFFICULTY_OPTIONS.filter(d => d.value === "all" || d.value === "easy" || d.value === "medium");

  const modeDescription = () => {
    if (selectedMode === "realm") {
      if (selectedDifficulty === "all") return "Realm: 50 Easy (5×), 40 Medium (6×), 30 Hard (7-8×), 20 Expert (9-10×), 15 Master (10-11×), 10 Grandmaster (11-12×).";
      const t = targets[0];
      if (!t) return "";
      return `Realm ${t.band}: ${t.target} deals${t.gridSizes ? ` (${t.gridSizes.join('/')}×)` : ''}. Confidence=1.0 (unique solution).`;
    }
    return `${selectedMode}: ${targets.map(t => `${t.target} ${t.band}`).join(" + ")} starter deals with Wilson confidence scoring.`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4" />
          Pool Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Generates solver-verified deals per game mode. Select a mode and generate.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedMode} onValueChange={(v) => { setSelectedMode(v); setSelectedDifficulty("all"); }} disabled={running}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="klondike">Klondike</SelectItem>
              <SelectItem value="freecell">FreeCell</SelectItem>
              <SelectItem value="realm">Realm</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty} disabled={running}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {difficultyOptions.map(d => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedTimeout} onValueChange={setSelectedTimeout} disabled={running}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Timeout" />
            </SelectTrigger>
            <SelectContent>
              {TIMEOUT_OPTIONS.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedMode === "realm" && (
            <Select value={selectedStrategy} onValueChange={(v) => setSelectedStrategy(v as GenerationStrategy)} disabled={running}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Strategy" />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {running ? "Generating..." : "Generate"}
          </Button>

          {running && (
            <Button variant="outline" size="sm" onClick={() => { abortRef.current = true; }}>
              Stop
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{modeDescription()}</p>

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
