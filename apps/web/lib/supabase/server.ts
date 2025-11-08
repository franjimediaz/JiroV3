import { createServerClient, type CookieMethodsServerDeprecated } from "@supabase/ssr";
import { cookies } from "next/headers";


export async function createClient() {
  const store = await cookies();

  const cookieAdapter: CookieMethodsServerDeprecated = {
    get(name: string) {
      return store.get(name)?.value;
    },
    set(name: string, value: string, options?: any) {
      store.set?.({ name, value, ...(options ?? {}) });
    },
    remove(name: string, options?: any) {
      store.set?.({ name, value: "", ...(options ?? {}), expires: new Date(0) });
    },
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieAdapter }
  );
}
