import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import type { HistogramBucket } from "./dealFilterUtils";

interface Props {
  ddsHistogram: HistogramBucket[];
  confidenceHistogram: HistogramBucket[];
  pathDiversityHistogram: HistogramBucket[];
  winRateHistogram: HistogramBucket[];
  simCountHistogram: HistogramBucket[];
}

export function DealHistograms({ ddsHistogram, confidenceHistogram, pathDiversityHistogram, winRateHistogram, simCountHistogram }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <HistogramCard title="DDS Distribution" data={ddsHistogram} color="hsl(var(--primary))" />
      <HistogramCard title="Confidence Distribution" data={confidenceHistogram} colorFn={(_, i) => i < 4 ? 'hsl(0, 72%, 51%)' : i < 7 ? 'hsl(45, 93%, 47%)' : 'hsl(142, 71%, 45%)'} />
      <HistogramCard title="Path Diversity Distribution" data={pathDiversityHistogram} color="hsl(280, 65%, 55%)" />
      <HistogramCard title="Win Rate Distribution (≥10 attempts)" data={winRateHistogram} color="hsl(200, 70%, 50%)" />
      <HistogramCard title="Simulation Count Distribution" data={simCountHistogram} color="hsl(30, 80%, 55%)" />
    </div>
  );
}

function HistogramCard({ title, data, color, colorFn }: {
  title: string;
  data: HistogramBucket[];
  color?: string;
  colorFn?: (entry: HistogramBucket, index: number) => string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <RechartsTooltip content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload as HistogramBucket;
                return (
                  <div className="bg-background border rounded-lg p-2 text-xs shadow-lg space-y-0.5">
                    <p className="font-medium">Range: {d.range}</p>
                    <p>{d.count} deals ({d.pct.toFixed(1)}% of filtered)</p>
                    <p>Avg confidence: {d.avgConfidence.toFixed(2)}</p>
                  </div>
                );
              }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={colorFn ? colorFn(entry, i) : color || 'hsl(var(--primary))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
