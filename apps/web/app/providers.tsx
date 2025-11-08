"use client";

import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PropsWithChildren, useMemo } from "react";

export default function Providers({ children }: PropsWithChildren) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  return (
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
  );
}
