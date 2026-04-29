import { createClient } from "@supabase/supabase-js";

const PROJECT_PREFIX = "sealed";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in app/.env.local"
  );
}

export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function table(name: string): string {
  return `${PROJECT_PREFIX}_${name}`;
}

export { PROJECT_PREFIX };
