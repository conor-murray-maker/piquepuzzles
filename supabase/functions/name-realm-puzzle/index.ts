import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { regions, size } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fallback naming
      return new Response(JSON.stringify({ name: `${size}×${size} Puzzle` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const regionDesc = regions.map((cells: number[], i: number) => {
      const coords = cells.map((idx: number) => `(${Math.floor(idx / size)},${idx % size})`).join(", ");
      return `Region ${i + 1}: ${coords}`;
    }).join("\n");

    const prompt = `Here is a ${size}x${size} Realm puzzle grid. The regions are defined as follows:\n${regionDesc}\nLooking at the shapes these regions form, suggest a single short evocative name for this puzzle (2-4 words maximum). The name should feel like it refers to something the shapes visually resemble or suggest — like a place, object, or concept. Avoid generic names like 'Puzzle' or 'Grid'. Reply with only the name, nothing else.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify({ name: `${size}×${size} Puzzle` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let name = data.choices?.[0]?.message?.content?.trim() || "";

    // Validate name quality
    const genericNames = ["puzzle", "grid", "board", "game", "layout"];
    if (!name || name.length > 40 || name.split(" ").length > 4 ||
        genericNames.some(g => name.toLowerCase() === g)) {
      name = `${size}×${size} Puzzle`;
    }

    return new Response(JSON.stringify({ name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("name-realm-puzzle error:", e);
    return new Response(JSON.stringify({ name: "Unnamed Realm" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
