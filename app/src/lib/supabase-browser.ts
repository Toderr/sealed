"use client";

import { createClient } from "@supabase/supabase-js";

// Browser-safe Supabase client using the anon key.
// Used only for Realtime subscriptions in client components.
// Never use this for writes — all mutations go through API routes with the service role key.
//
// In offline/mock mode (or when env is unset) the URL is blank, and
// createClient() throws "supabaseUrl is required" at import time — which crashes
// any page that imports this. Fall back to a harmless localhost placeholder so
// the module loads; Realtime simply never connects offline.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "offline-anon-key";

export const supabaseBrowser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
