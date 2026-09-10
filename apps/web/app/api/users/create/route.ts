import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { badRequest, forbidden } from "@/lib/auth/apiError";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { getClientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { getRequestId } from "@/lib/security/requestId";
import { parseCreateUserBody } from "@/lib/validation/users";

export const runtime = "nodejs";

type RoleRow = {
  id: string;
  slug: string;
  perms?: unknown;
};

function parsePerms(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function roleHasWildcard(role: RoleRow) {
  const perms = parsePerms(role.perms);
  const wildcard = perms["*"];
  return wildcard === true || (Boolean(wildcard) && typeof wildcard === "object");
}

function reservedRoleSlugs() {
  return (process.env.RESERVED_ROLE_SLUGS || "admin,superadmin,super-admin")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  let actorId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    const ip = getClientIp(req);
    await enforceRateLimit({ key: `user-create:${ip}`, limit: 20, windowMs: 60_000 });

    const ctx = await requirePermission("users.create");
    actorId = ctx.user.id;
    await enforceRateLimit({ key: `user-create:${ctx.user.id}`, limit: 10, windowMs: 60_000 });

    const body = parseCreateUserBody(await req.json().catch(() => null));

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from("rol")
      .select("id, slug, perms")
      .eq("id", body.roleId)
      .maybeSingle();

    if (roleError || !roleRow || typeof roleRow.slug !== "string") {
      throw badRequest("role_id invalido o no encontrado");
    }

    const targetRole = roleRow as RoleRow;
    const targetReserved = reservedRoleSlugs().includes(targetRole.slug.toLowerCase());
    if ((targetReserved || roleHasWildcard(targetRole)) && !hasPermission(ctx, "*.*")) {
      throw forbidden("No puedes asignar este rol");
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { name: body.name },
      app_metadata: { role: targetRole.slug },
    });

    if (createError || !created?.user?.id) throw badRequest("No se pudo crear el usuario");
    createdAuthUserId = created.user.id;

    const { error: insertError } = await supabaseAdmin.from("users").insert({
      uid: createdAuthUserId,
      email: body.email,
      name: body.name,
      role_id: body.roleId,
      role: targetRole.slug,
    });

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
      createdAuthUserId = null;
      throw badRequest("No se pudo crear el perfil del usuario");
    }

    await writeAuditEvent({
      actorUserId: ctx.user.id,
      action: "users.create",
      resourceType: "users",
      resourceId: createdAuthUserId,
      requestId,
      success: true,
      metadata: { roleId: body.roleId, roleSlug: targetRole.slug },
    });

    return NextResponse.json({ ok: true, uid: createdAuthUserId, requestId });
  } catch (error) {
    if (createdAuthUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
    }
    await writeAuditEvent({
      actorUserId: actorId,
      action: "users.create",
      requestId,
      success: false,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return handleApiError(error, requestId, { route: "/api/users/create", method: "POST", actorId });
  }
}
