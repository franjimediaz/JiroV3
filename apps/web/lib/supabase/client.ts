import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@repo/types";

export const supabaseBrowser = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

   if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
   if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
   
  return createBrowserClient(url, anonKey);
}