import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DealFilterState {
  difficulty: string;
  ddsSource: string;
  confidence: string;
  pathDiversity: string;
  gameMode: string;
  poolAttempts: string;
}

export const DEFAULT_FILTERS: DealFilterState = {
  difficulty: "all",
  ddsSource: "all",
  confidence: "all",
  pathDiversity: "all",
  gameMode: "all",
  poolAttempts: "all",
};

interface Props {
  filters: DealFilterState;
  onChange: (filters: DealFilterState) => void;
}

export function DealFilters({ filters, onChange }: Props) {
  const set = (key: keyof DealFilterState, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap gap-3 p-4 bg-muted/50 rounded-lg border">
      <FilterSelect label="Difficulty" value={filters.difficulty} onChange={v => set("difficulty", v)} options={[
        { value: "all", label: "All Difficulty" },
        { value: "easy", label: "Easy" },
        { value: "medium", label: "Medium" },
        { value: "hard", label: "Hard" },
        { value: "expert", label: "Expert" },
      ]} />
      <FilterSelect label="Confidence" value={filters.confidence} onChange={v => set("confidence", v)} options={[
        { value: "all", label: "All Confidence" },
        { value: "high", label: "High (>0.85)" },
        { value: "medium", label: "Medium (0.7–0.85)" },
        { value: "low", label: "Low (<0.7)" },
      ]} />
      <FilterSelect label="Pool Attempts" value={filters.poolAttempts} onChange={v => set("poolAttempts", v)} options={[
        { value: "all", label: "All Attempts" },
        { value: "0", label: "Zero attempts" },
        { value: "1-10", label: "1–10" },
        { value: "11-50", label: "11–50" },
        { value: "50+", label: "50+" },
      ]} />
      <FilterSelect label="DDS Source" value={filters.ddsSource} onChange={v => set("ddsSource", v)} options={[
        { value: "all", label: "All Sources" },
        { value: "solver", label: "Solver only (<30)" },
        { value: "blending", label: "Blending (30–100)" },
        { value: "empirical", label: "Empirical (100+)" },
      ]} />
      <FilterSelect label="Path Diversity" value={filters.pathDiversity} onChange={v => set("pathDiversity", v)} options={[
        { value: "all", label: "All PD" },
        { value: "below_0.15", label: "Below 0.15" },
        { value: "0.15_0.30", label: "0.15–0.30" },
        { value: "above_0.30", label: "Above 0.30" },
      ]} />
      <FilterSelect label="Game Mode" value={filters.gameMode} onChange={v => set("gameMode", v)} options={[
        { value: "all", label: "All Modes" },
        { value: "klondike", label: "Klondike" },
        { value: "freecell", label: "FreeCell" },
        { value: "realm", label: "Realm" },
      ]} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
