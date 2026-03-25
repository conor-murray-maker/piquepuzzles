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
import { Zap, Loader2, CheckCircle, XCircle } from "lucide-react";

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
}

// Priority: starter Easy, starter Medium, fresh Easy, fresh Medium, Hard, Expert
function sortPriority(deal: DealRow): number {
  const dds = deal.dds_initial;
  const isStarter = deal.is_calibration;
  const isEasy = dds <= 25;
  const isMedium = dds > 25 && dds <= 55;

  if (isStarter && isEasy) return 0;
  if (isStarter && isMedium) return 1;
  if (!isStarter && isEasy) return 2;
  if (!isStarter && isMedium) return 3;
  if (dds <= 75) return 4; // Hard
  return 5; // Expert
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
    abortRef.current = false;

    addStatus("Fetching deals with confidence < 0.7...");

    // Fetch all low-confidence deals
    const { data: deals, error } = await supabase
      .from("deals")
      .select("id, seed, game_mode, confidence, simulation_count, min_moves, dds_initial, dds_blended, tier, is_calibration")
      .lt("confidence", 0.7)
      .order("confidence", { ascending: true });

    if (error || !deals || deals.length === 0) {
      addStatus(error ? `✗ Error: ${error.message}` : "✓ No deals below 0.7 confidence threshold");
      setRunning(false);
      return;
    }

    // Sort by priority
    const sorted = (deals as DealRow[]).sort((a, b) => sortPriority(a) - sortPriority(b));
    setRemaining(sorted.length);
    addStatus(`Found ${sorted.length} deals below threshold. Starting boost...`);

    const engines: Record<string, { engine: PuzzleEngine; simCount: number }> = {
      klondike: { engine: KlondikeEngine, simCount: 200 },
      freecell: { engine: FreeCellEngine, simCount: 50 },
    };

    let boostedCount = 0;
    let totalImp = 0;

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

        // Combine old and new simulation data
        const oldSims = deal.simulation_count || 0;
        const newSims = engineInfo.simCount;
        const totalSims = oldSims + newSims;

        // Compute new confidence from combined data
        // Old winning sims estimated from old confidence * old sims
        const oldWins = deal.confidence * oldSims;
        const newWins = verifyResult.confidence * newSims;
        const combinedConfidence = Math.min(1, Math.max(0, (oldWins + newWins) / totalSims));

        // Only improve — never downgrade
        const finalConfidence = Math.max(deal.confidence, combinedConfidence);

        // Update min_moves if new result is better
        const finalMinMoves = verifyResult.solvable && verifyResult.minSolutionLength > 0
          ? Math.min(deal.min_moves > 0 ? deal.min_moves : Infinity, verifyResult.minSolutionLength)
          : deal.min_moves;

        // Recalculate DDS if changed by more than 5 points
        const newDds = engineInfo.engine.getComplexityScore(finalMinMoves);
        const ddsChanged = Math.abs(newDds - deal.dds_initial) > 5;
        const finalDds = ddsChanged ? newDds : deal.dds_initial;
        const finalBlended = ddsChanged ? newDds : deal.dds_blended;

        const improvement = finalConfidence - deal.confidence;

        // Write back via admin action
        await action.mutateAsync({
          action: "update_deal_confidence",
          params: {
            deal_id: deal.id,
            confidence: Math.round(finalConfidence * 1000) / 1000,
            simulation_count: totalSims,
            min_moves: finalMinMoves,
            dds_initial: Math.round(finalDds * 10) / 10,
            dds_blended: Math.round(finalBlended * 10) / 10,
          },
        });

        boostedCount++;
        totalImp += improvement;
        setBoosted(boostedCount);
        setRemaining(sorted.length - i - 1);
        setTotalImprovement(totalImp);

        if (boostedCount % 5 === 0 || i === sorted.length - 1) {
          const avgImp = boostedCount > 0 ? (totalImp / boostedCount * 100).toFixed(1) : "0";
          addStatus(`[${boostedCount}/${sorted.length}] ${deal.game_mode} seed ${deal.seed}: ${(deal.confidence * 100).toFixed(0)}% → ${(finalConfidence * 100).toFixed(0)}% | Avg improvement: +${avgImp}%`);
        }
      } catch (e: any) {
        addStatus(`✗ Failed deal ${deal.seed}: ${e.message}`);
      }

      // Yield to UI
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    const avgImp = boostedCount > 0 ? (totalImp / boostedCount * 100).toFixed(1) : "0";
    setResult({ boosted: boostedCount, avgImprovement: parseFloat(avgImp) });
    addStatus(`✓ Boosted ${boostedCount} deals. Average confidence improvement: +${avgImp}%`);
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
          Runs additional MCTS simulations on deals with confidence below 0.7. 
          Klondike: 200 sims, FreeCell: 50 sims. Priority: starter Easy → Medium → fresh Easy → Medium → Hard → Expert.
          Never downgrades confidence. Client-side, no time limit.
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
      </CardContent>
    </Card>
  );
}
