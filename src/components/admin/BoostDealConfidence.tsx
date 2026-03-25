import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAdminAction } from "@/hooks/useAdminQuery";
import { useToast } from "@/hooks/use-toast";
import { KlondikeEngine } from "@/engines/KlondikeEngine";
import { FreeCellEngine } from "@/engines/FreeCellEngine";
import { PuzzleEngine } from "@/engines/PuzzleEngine";
import { supabase } from "@/integrations/supabase/client";
import { calculateDealConfidence } from "@/lib/wilsonConfidence";
import { Zap, Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface DealRow {
  id: string;
  seed: number;
  game_mode: string;
  confidence: number;
  simulation_count: number;
  min_moves: number;
  dds_initial: number;
  dds_blended: number;
  tier: string;
  is_calibration: boolean;
  unique_winning_paths: number;
  path_diversity_score: number;
  pool_wins: number;
  pool_attempts: number;
}

function sortPriority(deal: DealRow): number {
  const dds = deal.dds_initial;
  const isStarter = deal.is_calibration;
  const isEasy = dds <= 25;
  const isMedium = dds > 25 && dds <= 55;
  if (isStarter && isEasy) return 0;
  if (isStarter && isMedium) return 1;
  if (!isStarter && isEasy) return 2;
  if (!isStarter && isMedium) return 3;
  if (dds <= 75) return 4;
  return 5;
}

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

interface PathDiversityWarning {
  dealId: string;
  seed: number;
  tier: string;
  pathDiversityScore: number;
  threshold: number;
}

export function BoostDealConfidence() {
  const action = useAdminAction();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [boosted, setBoosted] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [totalImprovement, setTotalImprovement] = useState(0);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [result, setResult] = useState<{ boosted: number; avgImprovement: number } | null>(null);
  const [warnings, setWarnings] = useState<PathDiversityWarning[]>([]);
  const abortRef = useRef(false);

  const addStatus = useCallback((line: string) => {
    setStatusLines(prev => [...prev.slice(-14), line]);
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setBoosted(0);
    setRemaining(0);
    setTotalImprovement(0);
    setStatusLines([]);
    setResult(null);
    setWarnings([]);
    abortRef.current = false;

    addStatus("Fetching deals with confidence < 0.7 (Wilson score)...");

    const { data: deals, error } = await supabase
      .from("deals")
      .select("id, seed, game_mode, confidence, simulation_count, min_moves, dds_initial, dds_blended, tier, is_calibration, unique_winning_paths, path_diversity_score, pool_wins, pool_attempts")
      .lt("confidence", 0.7)
      .order("confidence", { ascending: true });

    if (error || !deals || deals.length === 0) {
      addStatus(error ? `✗ Error: ${error.message}` : "✓ No deals below 0.7 confidence threshold");
      setRunning(false);
      return;
    }

    const sorted = (deals as unknown as DealRow[]).sort((a, b) => sortPriority(a) - sortPriority(b));
    setRemaining(sorted.length);
    addStatus(`Found ${sorted.length} deals below threshold. Starting boost with Wilson confidence...`);

    const engines: Record<string, { engine: PuzzleEngine; simCount: number }> = {
      klondike: { engine: KlondikeEngine, simCount: 200 },
      freecell: { engine: FreeCellEngine, simCount: 50 },
    };

    let boostedCount = 0;
    let totalImp = 0;
    const newWarnings: PathDiversityWarning[] = [];

    for (let i = 0; i < sorted.length; i++) {
      if (abortRef.current) {
        addStatus(`Stopped by user after boosting ${boostedCount} deals.`);
        break;
      }

      const deal = sorted[i];
      const engineInfo = engines[deal.game_mode];
      if (!engineInfo) continue;

      try {
        const generatedDeal = engineInfo.engine.generateDeal(deal.seed);
        const verifyResult = engineInfo.engine.verifySolvable(generatedDeal, engineInfo.simCount);

        const oldSims = deal.simulation_count || 0;
        const newSims = engineInfo.simCount;
        const totalSims = oldSims + newSims;

        // Combine wins: estimate old wins from pool data + new simulation wins
        const oldWins = deal.pool_wins || 0;
        const newWins = verifyResult.wins;
        // For Wilson, we need total wins across all simulation runs
        // Old confidence was win-rate based, so estimate old sim wins
        const estimatedOldSimWins = Math.round(deal.confidence * oldSims); // rough estimate
        const totalWins = estimatedOldSimWins + newWins;

        const finalMinMoves = verifyResult.solvable && verifyResult.minSolutionLength > 0
          ? Math.min(deal.min_moves > 0 ? deal.min_moves : Infinity, verifyResult.minSolutionLength)
          : deal.min_moves;

        // Recalculate DDS with path diversity modifier
        let finalDds = engineInfo.engine.getComplexityScore(finalMinMoves);
        const combinedUniquePaths = Math.max(deal.unique_winning_paths || 0, verifyResult.uniqueWinningPaths);
        const finalPathDiversity = verifyResult.pathDiversityScore;
        finalDds = applyPathDiversityModifier(finalDds, finalPathDiversity);
        const finalBlended = finalDds;

        // Calculate Wilson confidence
        const confResult = calculateDealConfidence({
          wins: totalWins,
          totalSimulations: totalSims,
          pathDiversityScore: finalPathDiversity,
          dds: finalDds,
        });

        const improvement = confResult.confidence - deal.confidence;

        // Check path diversity thresholds and flag warnings
        const diffTier = getDifficultyTier(finalDds);
        if (diffTier === "Easy" && (finalPathDiversity < 0.3 || confResult.confidence < 0.5)) {
          newWarnings.push({ dealId: deal.id, seed: deal.seed, tier: "Easy", pathDiversityScore: finalPathDiversity, threshold: 0.3 });
        } else if (diffTier === "Medium" && (finalPathDiversity < 0.15 || confResult.confidence < 0.25)) {
          newWarnings.push({ dealId: deal.id, seed: deal.seed, tier: "Medium", pathDiversityScore: finalPathDiversity, threshold: 0.15 });
        }

        await action.mutateAsync({
          action: "update_deal_confidence",
          params: {
            deal_id: deal.id,
            confidence: confResult.confidence,
            simulation_count: totalSims,
            min_moves: finalMinMoves,
            dds_initial: Math.round(finalDds * 10) / 10,
            dds_blended: Math.round(finalBlended * 10) / 10,
            unique_winning_paths: combinedUniquePaths,
            path_diversity_score: Math.round(finalPathDiversity * 1000) / 1000,
          },
        });

        boostedCount++;
        totalImp += improvement;
        setBoosted(boostedCount);
        setRemaining(sorted.length - i - 1);
        setTotalImprovement(totalImp);

        if (boostedCount % 5 === 0 || i === sorted.length - 1) {
          const avgImp = boostedCount > 0 ? (totalImp / boostedCount * 100).toFixed(1) : "0";
          addStatus(`[${boostedCount}/${sorted.length}] ${deal.game_mode} seed ${deal.seed}: conf ${(deal.confidence * 100).toFixed(0)}% → ${(confResult.confidence * 100).toFixed(0)}% [${(confResult.wilsonLower * 100).toFixed(0)}–${(confResult.wilsonUpper * 100).toFixed(0)}% WR] | PD: ${(finalPathDiversity * 100).toFixed(0)}%`);
        }
      } catch (e: any) {
        addStatus(`✗ Failed deal ${deal.seed}: ${e.message}`);
      }

      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    setWarnings(newWarnings);
    const avgImp = boostedCount > 0 ? (totalImp / boostedCount * 100).toFixed(1) : "0";
    setResult({ boosted: boostedCount, avgImprovement: parseFloat(avgImp) });
    addStatus(`✓ Boosted ${boostedCount} deals. Average confidence improvement: +${avgImp}%`);
    if (newWarnings.length > 0) {
      addStatus(`⚠ ${newWarnings.length} deals flagged with low path diversity for their tier`);
    }
    toast({ title: "Confidence boost complete", description: `${boostedCount} deals boosted (+${avgImp}% avg)` });
    setRunning(false);
  }, [action, addStatus, toast]);

  const progress = remaining + boosted > 0 ? (boosted / (remaining + boosted)) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Boost Deal Confidence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Runs additional MCTS simulations on deals with Wilson confidence below 0.7.
          Confidence = 50% Wilson interval width + 30% DDS tier stability + 20% path diversity.
          Below 30 sims: capped at 0.4. Below 10 sims: capped at 0.2. Never downgrades.
        </p>

        <div className="flex gap-2">
          <Button onClick={run} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {running ? "Boosting..." : "Boost Low-Confidence Deals"}
          </Button>

          {running && (
            <Button variant="outline" size="sm" onClick={() => { abortRef.current = true; }}>
              Stop
            </Button>
          )}
        </div>

        {(running || result) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Boosted: {boosted}</span>
              <span className="text-muted-foreground">
                Remaining: {remaining} | Avg: +{boosted > 0 ? (totalImprovement / boosted * 100).toFixed(1) : "0"}%
              </span>
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
                ) : line.startsWith("✗") ? (
                  <span className="text-destructive">{line}</span>
                ) : line.startsWith("⚠") ? (
                  <span className="text-yellow-600">{line}</span>
                ) : (
                  line
                )}
              </p>
            ))}
          </div>
        )}

        {result && (
          <div className="flex items-center gap-2 text-sm">
            {result.boosted > 0 ? (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span>Boosted {result.boosted} deals (avg +{result.avgImprovement}% confidence)</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <span>No deals needed boosting</span>
              </>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="border border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/20 rounded p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              {warnings.length} deals flagged — low path diversity for tier
            </div>
            <div className="max-h-32 overflow-y-auto">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs font-mono text-yellow-600 dark:text-yellow-500">
                  Seed {w.seed} ({w.tier}): PD {(w.pathDiversityScore * 100).toFixed(0)}% &lt; {(w.threshold * 100).toFixed(0)}% threshold
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
