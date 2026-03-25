import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DealFilterState {
  tier: string;
  difficulty: string;
  ddsSource: string;
  confidence: string;
  pathDiversity: string;
  gameMode: string;
}

export const DEFAULT_FILTERS: DealFilterState = {
  tier: "all",
  difficulty: "all",
  ddsSource: "all",
  confidence: "all",
  pathDiversity: "all",
  gameMode: "all",
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
      <FilterSelect label="Tier" value={filters.tier} onChange={v => set("tier", v)} options={[
        { value: "all", label: "All Tiers" },
        { value: "starter", label: "Starter" },
        { value: "fresh", label: "Fresh" },
      ]} />
      <FilterSelect label="Difficulty" value={filters.difficulty} onChange={v => set("difficulty", v)} options={[
        { value: "all", label: "All Difficulty" },
        { value: "easy", label: "Easy" },
        { value: "medium", label: "Medium" },
        { value: "hard", label: "Hard" },
        { value: "expert", label: "Expert" },
      ]} />
      <FilterSelect label="DDS Source" value={filters.ddsSource} onChange={v => set("ddsSource", v)} options={[
        { value: "all", label: "All Sources" },
        { value: "solver", label: "Solver only (<30)" },
        { value: "blending", label: "Blending (30–100)" },
        { value: "empirical", label: "Empirical (100+)" },
      ]} />
      <FilterSelect label="Confidence" value={filters.confidence} onChange={v => set("confidence", v)} options={[
        { value: "all", label: "All Confidence" },
        { value: "below_0.7", label: "Below 0.7" },
        { value: "0.7_0.9", label: "0.7–0.9" },
        { value: "above_0.9", label: "Above 0.9" },
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
