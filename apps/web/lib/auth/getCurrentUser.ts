import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { unauthorized } from "./apiError";

export type RolePerms = Record<string, Record<string, boolean> | boolean>;

export type CurrentUserContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  profile: {
    id?: string;
    uid: string;
    email?: string | null;
    role_id?: string | null;
    role?: string | null;
  };
  role: {
    id: string;
    slug?: string | null;
    perms: RolePerms;
  } | null;
};

function parsePerms(value: unknown): RolePerms {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsePerms(parsed);
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return {};
  return value as RolePerms;
}

export async function getCurrentUser(): Promise<CurrentUserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profileRow, error: profileError } = await supabase
    .from("users")
    .select("uid, email, role_id, role")
    .eq("uid", user.id)
    .maybeSingle();

  if ((profileError || !profileRow) && process.env.NODE_ENV !== "production") {
    console.warn("current user profile not resolved", {
      uid: user.id,
      error: profileError?.message,
    });
  }

  const profile = profileRow
    ? {
        uid: typeof profileRow.uid === "string" ? profileRow.uid : user.id,
        email: typeof profileRow.email === "string" ? profileRow.email : user.email,
        role_id: typeof profileRow.role_id === "string" ? profileRow.role_id : null,
        role: typeof profileRow.role === "string" ? profileRow.role : null,
      }
    : { uid: user.id, email: user.email, role_id: null, role: null };

  let role: CurrentUserContext["role"] = null;
  if (profile.role_id) {
    const { data: roleRow, error: roleError } = await supabase
      .from("rol")
      .select("id, slug, perms")
      .eq("id", profile.role_id)
      .maybeSingle();

    if ((roleError || !roleRow) && process.env.NODE_ENV !== "production") {
      console.warn("current user role not resolved", {
        uid: user.id,
        role_id: profile.role_id,
        role_slug: profile.role,
        error: roleError?.message,
      });
    }

    if (roleRow && typeof roleRow.id === "string") {
      role = {
        id: roleRow.id,
        slug: typeof roleRow.slug === "string" ? roleRow.slug : null,
        perms: parsePerms(roleRow.perms),
      };
    }
  }

  return { supabase, user, profile, role };
}

export async function requireUser() {
  const ctx = await getCurrentUser();
  if (!ctx) throw unauthorized();
  return ctx;
}
