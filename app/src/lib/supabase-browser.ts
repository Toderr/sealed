"use client";

import { createClient } from "@supabase/supabase-js";
import { MOCK_DATA } from "./env";

// Browser-safe Supabase client using the anon key.
// Used only for Realtime subscriptions in client components.
// Never use this for writes — all mutations go through API routes with the service role key.
//
// In offline mock mode the env is blank, and createClient() throws
// "supabaseUrl is required" at import time — which crashes any page that imports
// this. ONLY in MOCK_DATA mode do we fall back to a harmless placeholder so the
// module loads (Realtime simply never connects offline). In prod, behavior is
// unchanged: a missing URL crashes loudly exactly as before.
const SUPABASE_URL = MOCK_DATA
  ? process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321"
  : process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = MOCK_DATA
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "offline-anon-key"
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
