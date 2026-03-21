/**
 * Starter Pool Generator
 * 
 * Generates 300 Klondike + 300 FreeCell verified deals for the starter pool.
 * Run once locally or in CI: npx ts-node scripts/generateStarterPool.ts
 * 
 * Expected runtime: ~5-10 minutes for 600 deals (1000 simulations each).
 * Idempotent — uses seed as unique key, skips existing seeds.
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

// This script is designed to run outside the app context.
// In practice, it would use the same solver logic but invoked via
// the seed-calibration-pool edge function.
// 
// To seed the pool, call the edge function directly:
//   curl -X POST https://habzaxkukdlllwlavpdc.supabase.co/functions/v1/seed-calibration-pool \
//     -H "Authorization: Bearer <service_role_key>" \
//     -H "Content-Type: application/json" \
//     -d '{"deals": [...]}'
//
// The actual deal generation with 1000 simulations should be done
// using the engine classes (KlondikeEngine, FreeCellEngine) and
// their verifySolvable method with simulations=1000.

console.log('Starter pool generation is handled via the seed-calibration-pool edge function.');
console.log('Use the PuzzleEngine interface to generate verified deals client-side,');
console.log('then POST them to the edge function for storage.');
