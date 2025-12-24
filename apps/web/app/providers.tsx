"use client";

import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PropsWithChildren, useMemo } from "react";
import { PermisosProvider } from "@/lib/perms";

export default function Providers({ children }: PropsWithChildren) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  return (
    <PermisosProvider>
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
    </PermisosProvider>
  );
}
