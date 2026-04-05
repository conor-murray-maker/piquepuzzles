import { useState, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useAdminAction } from "@/hooks/useAdminQuery";
import { useToast } from "@/hooks/use-toast";
import { KlondikeEngine } from "@/engines/KlondikeEngine";
import { FreeCellEngine } from "@/engines/FreeCellEngine";
import { RealmEngine } from "@/engines/RealmEngine";
import { PuzzleEngine } from "@/engines/PuzzleEngine";
import { generateSeed } from "@/game/deck";
import { type RealmGenOptions } from "@/game/realm";
import { calculateDealConfidence } from "@/lib/wilsonConfidence";
import { Database, Loader2, CheckCircle, XCircle, Zap, ChevronDown, AlertTriangle } from "lucide-react";

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
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "expert", ddsMin: 60, ddsMax: 100, target: 20, gridSizes: [9] },
    { gameMode: "realm", engine: RealmEngine, simCount: 1, band: "master", ddsMin: 75, ddsMax: 100, target: 15, gridSizes: [10] },
  ],
};

const ALL_MODES = [
  { value: "klondike", label: "Klondike" },
  { value: "freecell", label: "FreeCell" },
  { value: "realm", label: "Realm" },
];

const ALL_DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "expert", label: "Expert" },
  { value: "master", label: "Master" },
];

/** Which difficulties are valid for each mode */
const VALID_DIFFICULTIES: Record<string, string[]> = {
  klondike: ["easy", "medium"],
  freecell: ["easy", "medium"],
  realm: ["easy", "medium", "hard", "expert", "master"],
};

const MAX_CANDIDATES = 8000;

const TIMEOUT_OPTIONS = [
  { value: "0", label: "None" },
  { value: "1000", label: "1s" },
  { value: "2000", label: "2s (recommended)" },
  { value: "5000", label: "5s" },
  { value: "10000", label: "10s" },
  { value: "30000", label: "30s (Master)" },
];
const BATCH_SIZE_OPTIONS = [
  { value: "1", label: "1× (default)" },
  { value: "2", label: "2× targets" },
  { value: "5", label: "5× targets" },
  { value: "10", label: "10× targets" },
  { value: "20", label: "20× targets" },
];

/** Fill All batch definitions */
interface FillAllBatch {
  mode: string;
  band: string;
  timeoutMs: number;
}

const FILL_ALL_BATCHES: FillAllBatch[] = [
  { mode: "realm", band: "easy", timeoutMs: 2000 },
  { mode: "realm", band: "medium", timeoutMs: 2000 },
  { mode: "realm", band: "hard", timeoutMs: 2000 },
  { mode: "realm", band: "expert", timeoutMs: 2000 },
  { mode: "realm", band: "master", timeoutMs: 5000 },
  { mode: "klondike", band: "easy", timeoutMs: 2000 },
  { mode: "klondike", band: "medium", timeoutMs: 2000 },
  { mode: "freecell", band: "easy", timeoutMs: 2000 },
  { mode: "freecell", band: "medium", timeoutMs: 2000 },
];

/** Generate deals for a single target band, returning inserted count */
async function generateBatch(
  target: Target,
  timeoutMs: number,
  needed: number,
  abortRef: React.MutableRefObject<boolean>,
  addStatus: (line: string) => void,
  insertDeals: (deals: VerifiedDeal[]) => Promise<number>,
): Promise<number> {
  const isRealm = target.gameMode === "realm";
  const engine = target.engine;
  const simCount = target.simCount;
  const collected: VerifiedDeal[] = [];
  let tried = 0;
  const maxTries = Math.min(MAX_CANDIDATES, needed * 100);

  while (tried < maxTries && collected.length < needed && !abortRef.current) {
    for (let b = 0; b < 5 && tried < maxTries && collected.length < needed && !abortRef.current; b++) {
      tried++;
      const seed = generateSeed();

      try {
        let realmGridSize: number | undefined;
        let realmSkipSurprise = false;

        if (isRealm && target.gridSizes) {
          realmGridSize = target.gridSizes[Math.floor(Math.random() * target.gridSizes.length)];
          realmSkipSurprise = target.skipSpatialSurprise ?? false;
        }

        let deal;
        if (isRealm) {
          deal = engine.generateDeal(seed, { gridSize: realmGridSize, skipSpatialSurprise: realmSkipSurprise, timeoutMs: timeoutMs > 0 ? timeoutMs : undefined });
        } else {
          deal = engine.generateDeal(seed);
        }

        const verifyResult = engine.verifySolvable(deal, simCount);
        if (!verifyResult.solvable || verifyResult.minSolutionLength <= 0) continue;

        let dds = verifyResult.complexityScore;
        const pathDiv = verifyResult.pathDiversityScore;
        const uniquePaths = verifyResult.uniqueWinningPaths;

        if (!isRealm) dds = applyPathDiversityModifier(dds, pathDiv);

        if (dds < target.ddsMin || dds > target.ddsMax) continue;

        let confidence: number;
        if (isRealm) {
          confidence = 1.0;
        } else {
          const confResult = calculateDealConfidence({ wins: verifyResult.wins, totalSimulations: verifyResult.simulations, dds });
          confidence = confResult.confidence;
        }

        collected.push({
          seed,
          game_mode: target.gameMode,
          draw_mode: isRealm ? 0 : 3,
          min_moves: verifyResult.minSolutionLength,
          dds_initial: dds,
          dds_blended: dds,
          simulation_count: isRealm ? 1 : verifyResult.simulations,
          simulation_wins: isRealm ? 0 : verifyResult.wins,
          confidence,
          tier: "fresh",
          is_calibration: false,
          reserved_for: target.band === "easy" ? "onboarding" : null,
          unique_winning_paths: isRealm ? 1 : uniquePaths,
          path_diversity_score: isRealm ? 0 : Math.round(pathDiv * 1000) / 1000,
        });
      } catch {
        // skip
      }
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  if (collected.length === 0) return 0;
  addStatus(`  Generated ${collected.length} deals, inserting...`);
  return insertDeals(collected);
}

/* ─── Multi-select dropdown component ─── */
function MultiSelect({
  options,
  selected,
  onChange,
  disabled,
  allLabel,
  width = "w-48",
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  disabled?: boolean;
  allLabel: string;
  width?: string;
}) {
  const summary = selected.length === options.length
    ? allLabel
    : selected.length === 0
      ? "None"
      : options.filter(o => selected.includes(o.value)).map(o => o.label).join(", ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className={`${width} justify-between text-sm font-normal`}>
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onChange([...selected, opt.value]);
                } else {
                  onChange(selected.filter(v => v !== opt.value));
                }
              }}
            />
            {opt.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function StarterPoolGenerator() {
  const action = useAdminAction();
  const { toast } = useToast();
  const [selectedModes, setSelectedModes] = useState<string[]>(["klondike", "freecell", "realm"]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>(["easy", "medium", "hard", "expert", "master"]);
  const [selectedTimeout, setSelectedTimeout] = useState<string>("2000");
  const [selectedBatchMultiplier, setSelectedBatchMultiplier] = useState<string>("1");
  const [running, setRunning] = useState(false);
  const [candidatesTried, setCandidatesTried] = useState(0);
  const [starterFound, setStarterFound] = useState(0);
  const [totalBanked, setTotalBanked] = useState(0);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [result, setResult] = useState<{ inserted: number; total: number } | null>(null);
  const [fillAllRunning, setFillAllRunning] = useState(false);
  const abortRef = useRef(false);

  const addStatus = useCallback((line: string) => {
    setStatusLines(prev => [...prev.slice(-29), line]);
  }, []);

  // Filter difficulty options to those valid for at least one selected mode
  const availableDifficulties = useMemo(() => {
    const validSet = new Set<string>();
    for (const mode of selectedModes) {
      for (const d of (VALID_DIFFICULTIES[mode] ?? [])) validSet.add(d);
    }
    return ALL_DIFFICULTIES.filter(d => validSet.has(d.value));
  }, [selectedModes]);

  // Show Master timeout warning
  const showMasterWarning = selectedDifficulties.includes("master") &&
    selectedModes.includes("realm") &&
    parseInt(selectedTimeout) < 30000;

  const insertDeals = useCallback(async (deals: VerifiedDeal[]): Promise<number> => {
    let totalInserted = 0;
    for (let i = 0; i < deals.length; i += 50) {
      const batch = deals.slice(i, i + 50);
      try {
        const res = await action.mutateAsync({
          action: "seed_starter_pool",
          params: { deals: batch },
        });
        totalInserted += res.inserted || 0;
      } catch (e: any) {
        addStatus(`✗ Insert batch failed: ${e.message}`);
      }
    }
    return totalInserted;
  }, [action, addStatus]);

  const fillAll = useCallback(async () => {
    setFillAllRunning(true);
    setRunning(true);
    setStatusLines([]);
    setResult(null);
    abortRef.current = false;

    addStatus("Fetching current pool counts...");

    let poolCounts: Record<string, Record<string, number>> = {};
    try {
      poolCounts = await action.mutateAsync({ action: "pool_counts" });
    } catch (e: any) {
      addStatus(`✗ Failed to fetch pool counts: ${e.message}`);
      setFillAllRunning(false);
      setRunning(false);
      return;
    }

    const batchesToRun: { batch: FillAllBatch; target: Target; needed: number }[] = [];
    for (const batch of FILL_ALL_BATCHES) {
      const targets = TARGETS_BY_MODE[batch.mode];
      const target = targets?.find(t => t.band === batch.band);
      if (!target) continue;

      const current = poolCounts[batch.mode]?.[batch.band] ?? 0;
      const needed = target.target - current;
      if (needed > 0) {
        batchesToRun.push({ batch, target, needed });
      }
    }

    if (batchesToRun.length === 0) {
      addStatus("✓ All pools are at or above target. Nothing to generate.");
      toast({ title: "All pools full", description: "No generation needed." });
      setFillAllRunning(false);
      setRunning(false);
      return;
    }

    addStatus(`${batchesToRun.length} pool(s) below threshold. Starting sequential fill...`);
    let totalDealsAdded = 0;
    let batchesCompleted = 0;

    for (let i = 0; i < batchesToRun.length; i++) {
      if (abortRef.current) {
        addStatus("⚠ Fill All stopped by user.");
        break;
      }

      const { batch, target, needed } = batchesToRun[i];
      const label = `${batch.mode} ${batch.band}`;
      addStatus(`[${i + 1}/${batchesToRun.length}] Filling ${label} (need ${needed})...`);

      const inserted = await generateBatch(
        target, batch.timeoutMs, needed,
        abortRef, addStatus, insertDeals,
      );

      totalDealsAdded += inserted;
      batchesCompleted++;
      addStatus(`[${i + 1}/${batchesToRun.length}] ${label}... done (${inserted} deals added)`);
    }

    const summary = abortRef.current
      ? `Stopped early. ${batchesCompleted} batches completed, ${totalDealsAdded} deals added.`
      : `All critical pools filled. ${batchesCompleted} batches completed, ${totalDealsAdded} deals added.`;
    addStatus(`✓ ${summary}`);
    setResult({ inserted: totalDealsAdded, total: totalDealsAdded });
    toast({ title: "Fill All complete", description: summary });

    setFillAllRunning(false);
    setRunning(false);
  }, [action, addStatus, insertDeals, toast]);

  const run = useCallback(async () => {
    if (selectedModes.length === 0 || selectedDifficulties.length === 0) {
      toast({ title: "Nothing selected", description: "Select at least one mode and difficulty." });
      return;
    }

    setRunning(true);
    setCandidatesTried(0);
    setStarterFound(0);
    setTotalBanked(0);
    setStatusLines([]);
    setResult(null);
    abortRef.current = false;

    const batchMultiplier = parseInt(selectedBatchMultiplier, 10);
    const timeoutMs = parseInt(selectedTimeout, 10);

    // Build list of (mode, target) combos to run sequentially
    const combos: { mode: string; target: Target }[] = [];
    for (const mode of selectedModes) {
      const allTargets = TARGETS_BY_MODE[mode] ?? [];
      for (const t of allTargets) {
        if (selectedDifficulties.includes(t.band)) {
          combos.push({ mode, target: { ...t, target: t.target * batchMultiplier } });
        }
      }
    }

    if (combos.length === 0) {
      addStatus("✗ No valid mode/difficulty combinations selected.");
      setRunning(false);
      return;
    }

    const totalTarget = combos.reduce((s, c) => s + c.target.target, 0);
    addStatus(`Starting generation: ${combos.length} batch(es), ${totalTarget} total target deals.`);
    addStatus(`Timeout: ${timeoutMs > 0 ? `${timeoutMs}ms` : 'none'} | Batch multiplier: ${batchMultiplier}×`);

    let grandTotalInserted = 0;
    let grandTotalStarter = 0;
    let grandTotalTried = 0;
    let grandTotalBanked = 0;

    for (let ci = 0; ci < combos.length; ci++) {
      if (abortRef.current) {
        addStatus("⚠ Stopped by user.");
        break;
      }

      const { mode, target } = combos[ci];
      const isRealm = mode === "realm";
      const label = `${mode} ${target.band}${target.gridSizes ? ` (${target.gridSizes.join('/')}×)` : ''}`;
      addStatus(`\n━━━ [${ci + 1}/${combos.length}] ${label} — target: ${target.target} ━━━`);

      const engine = target.engine;
      const simCount = target.simCount;
      const collected: VerifiedDeal[] = [];
      let tried = 0;
      let starterCount = 0;
      const startTime = Date.now();
      const maxCandidates = MAX_CANDIDATES * batchMultiplier;

      while (tried < maxCandidates && collected.length < target.target && !abortRef.current) {
        for (let b = 0; b < 5 && tried < maxCandidates && collected.length < target.target && !abortRef.current; b++) {
          tried++;
          const seed = generateSeed();

          try {
            let realmGridSize: number | undefined;
            let realmSkipSurprise = false;

            if (isRealm && target.gridSizes) {
              realmGridSize = target.gridSizes[Math.floor(Math.random() * target.gridSizes.length)];
              realmSkipSurprise = target.skipSpatialSurprise ?? false;
            }

            let deal;
            if (isRealm) {
              deal = engine.generateDeal(seed, {
                gridSize: realmGridSize,
                skipSpatialSurprise: realmSkipSurprise,
                timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
              });
            } else {
              deal = engine.generateDeal(seed);
            }

            const verifyResult = engine.verifySolvable(deal, simCount);
            if (!verifyResult.solvable || verifyResult.minSolutionLength <= 0) continue;

            let dds = verifyResult.complexityScore;
            const pathDiv = verifyResult.pathDiversityScore;
            const uniquePaths = verifyResult.uniqueWinningPaths;

            if (!isRealm) dds = applyPathDiversityModifier(dds, pathDiv);

            // For Realm, skip DDS range check — grid size determines difficulty
            if (!isRealm && (dds < target.ddsMin || dds > target.ddsMax)) continue;

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

            collected.push({
              seed,
              game_mode: mode,
              draw_mode: isRealm ? 0 : 3,
              min_moves: verifyResult.minSolutionLength,
              dds_initial: dds,
              dds_blended: dds,
              simulation_count: isRealm ? 1 : verifyResult.simulations,
              simulation_wins: isRealm ? 0 : verifyResult.wins,
              confidence,
              tier: "fresh",
              is_calibration: false,
              reserved_for: target.band === "easy" ? "onboarding" : null,
              unique_winning_paths: isRealm ? 1 : uniquePaths,
              path_diversity_score: isRealm ? 0 : Math.round(pathDiv * 1000) / 1000,
            });

            starterCount++;
          } catch {
            // skip
          }
        }

        grandTotalTried = grandTotalTried - (grandTotalTried % 1) + tried; // approx update
        setCandidatesTried(prev => prev + 0); // trigger re-render via status lines

        if (tried % 5 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = tried > 0 ? ((collected.length / tried) * 100).toFixed(1) : "0";
          addStatus(`  [${tried}] ${elapsed}s | ${collected.length}/${target.target} | Rate: ${rate}%`);
        }

        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (collected.length > 0) {
        addStatus(`  Found ${collected.length} deals in ${elapsed}s. Inserting...`);
        const inserted = await insertDeals(collected);
        grandTotalInserted += inserted;
        grandTotalBanked += collected.length;
        grandTotalStarter += starterCount;
        addStatus(`  ✓ ${label}: ${inserted} inserted`);
      } else {
        addStatus(`  ✗ ${label}: No deals found after ${tried} candidates (${elapsed}s)`);
      }

      // Update counters
      setCandidatesTried(prev => prev + tried);
      setStarterFound(prev => prev + starterCount);
      setTotalBanked(prev => prev + collected.length);
    }

    setResult({ inserted: grandTotalInserted, total: grandTotalBanked });
    const finalMsg = abortRef.current
      ? `Stopped early. ${grandTotalInserted} deals inserted across completed batches.`
      : `Done. ${grandTotalInserted} deals inserted across ${combos.length} batches.`;
    addStatus(`\n✓ ${finalMsg}`);
    toast({ title: "Generation complete", description: finalMsg });

    setRunning(false);
  }, [addStatus, toast, selectedModes, selectedDifficulties, selectedTimeout, selectedBatchMultiplier, insertDeals]);

  // Compute total target for progress bar
  const totalTarget = useMemo(() => {
    const batchMultiplier = parseInt(selectedBatchMultiplier, 10);
    let total = 0;
    for (const mode of selectedModes) {
      const allTargets = TARGETS_BY_MODE[mode] ?? [];
      for (const t of allTargets) {
        if (selectedDifficulties.includes(t.band)) {
          total += t.target * batchMultiplier;
        }
      }
    }
    return total;
  }, [selectedModes, selectedDifficulties, selectedBatchMultiplier]);

  const progress = Math.min(100, totalTarget > 0 ? (starterFound / totalTarget) * 100 : 0);

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
          Generates solver-verified deals per game mode. Select modes and difficulties to generate, or fill all pools at once.
        </p>

        {/* Fill All Pools */}
        <div className="flex items-center gap-3 pb-2 border-b">
          <Button onClick={fillAll} disabled={running} variant="default" className="gap-2">
            {fillAllRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {fillAllRunning ? "Filling All Pools..." : "Fill All Pools"}
          </Button>
          <p className="text-xs text-muted-foreground">Auto-fills every mode/difficulty below target. Bypasses selectors.</p>
        </div>

        {/* Manual controls */}
        <div className="flex flex-wrap items-center gap-3">
          <MultiSelect
            options={ALL_MODES}
            selected={selectedModes}
            onChange={setSelectedModes}
            disabled={running}
            allLabel="All Modes"
            width="w-40"
          />

          <MultiSelect
            options={availableDifficulties}
            selected={selectedDifficulties.filter(d => availableDifficulties.some(ad => ad.value === d))}
            onChange={setSelectedDifficulties}
            disabled={running}
            allLabel="All Difficulties"
            width="w-52"
          />

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

          <Select value={selectedBatchMultiplier} onValueChange={setSelectedBatchMultiplier} disabled={running}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Batch size" />
            </SelectTrigger>
            <SelectContent>
              {BATCH_SIZE_OPTIONS.map(b => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={run} disabled={running || selectedModes.length === 0 || selectedDifficulties.length === 0} className="gap-2">
            {running && !fillAllRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {running && !fillAllRunning ? "Generating..." : "Generate"}
          </Button>

          {running && (
            <Button variant="outline" size="sm" onClick={() => { abortRef.current = true; }}>
              Stop
            </Button>
          )}
        </div>

        {showMasterWarning && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Master (10×10) selected — 30s timeout recommended for reliable generation.
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Target: {totalTarget} deals across {selectedModes.length} mode(s), {selectedDifficulties.filter(d => availableDifficulties.some(ad => ad.value === d)).length} difficulty(ies).
        </p>

        {(running || result) && !fillAllRunning && (
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
                <span>Inserted {result.inserted} verified deals</span>
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