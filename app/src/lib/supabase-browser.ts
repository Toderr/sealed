"use client";

import { createClient } from "@supabase/supabase-js";

// Browser-safe Supabase client using the anon key.
// Used only for Realtime subscriptions in client components.
// Never use this for writes — all mutations go through API routes with the service role key.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
