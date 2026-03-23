import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      // Sync profile to free
      await supabaseAdmin.from("profiles").update({
        subscription_status: "free",
        subscription_tier: null,
        premium_expires_at: null,
      }).eq("id", user.id);

      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActive = subscriptions.data.length > 0;
    let subscriptionEnd: string | null = null;
    let tier: string | null = null;

    if (hasActive) {
      const sub = subscriptions.data[0];
      subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      const interval = sub.items.data[0]?.price?.recurring?.interval;
      tier = interval === "year" ? "annual" : "monthly";

      await supabaseAdmin.from("profiles").update({
        subscription_status: "premium",
        subscription_tier: tier,
        premium_expires_at: subscriptionEnd,
        streak_freezes_remaining: 1, // Premium gets 1 freeze per week
      }).eq("id", user.id);
    } else {
      // Check for cancelled but not yet expired
      const cancelledSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "canceled",
        limit: 1,
      });

      if (cancelledSubs.data.length > 0) {
        const sub = cancelledSubs.data[0];
        const endDate = new Date(sub.current_period_end * 1000);
        if (endDate > new Date()) {
          subscriptionEnd = endDate.toISOString();
          tier = sub.items.data[0]?.price?.recurring?.interval === "year" ? "annual" : "monthly";
          // Still active until period end
          await supabaseAdmin.from("profiles").update({
            subscription_status: "cancelled",
            subscription_tier: tier,
            premium_expires_at: subscriptionEnd,
          }).eq("id", user.id);

          return new Response(JSON.stringify({
            subscribed: true,
            tier,
            subscription_end: subscriptionEnd,
            cancelling: true,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      await supabaseAdmin.from("profiles").update({
        subscription_status: "free",
        subscription_tier: null,
        premium_expires_at: null,
      }).eq("id", user.id);
    }

    return new Response(JSON.stringify({
      subscribed: hasActive,
      tier,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error('[check-subscription] internal error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
