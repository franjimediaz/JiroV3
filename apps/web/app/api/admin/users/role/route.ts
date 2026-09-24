import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission, hasPermission } from "@/lib/auth/requirePermission";
import { handleApiError } from "@/lib/auth/handleApiError";
import { badRequest, forbidden, notFound } from "@/lib/auth/apiError";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { getClientIp, enforceRateLimit } from "@/lib/security/rateLimit";
import { getRequestId } from "@/lib/security/requestId";
import { parseUpdateUserRoleBody } from "@/lib/validation/users";

export const runtime = "nodejs";

function reservedRoleSlugs() {
  return (process.env.RESERVED_ROLE_SLUGS || "admin,superadmin,super-admin")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function roleIsPrivileged(role: { slug?: unknown; perms?: unknown }) {
  const slug = typeof role.slug === "string" ? role.slug.toLowerCase() : "";
  if (reservedRoleSlugs().includes(slug)) return true;
  if (!role.perms || typeof role.perms !== "object" || Array.isArray(role.perms)) return false;
  const wildcard = (role.perms as Record<string, unknown>)["*"];
  return wildcard === true || (Boolean(wildcard) && typeof wildcard === "object");
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  let actorId: string | null = null;

  try {
    const ip = getClientIp(req);
    await enforceRateLimit({ key: `role-update:${ip}`, limit: 30, windowMs: 60_000 });

    const ctx = await requirePermission("users.roles.update");
    actorId = ctx.user.id;
    await enforceRateLimit({ key: `role-update:${ctx.user.id}`, limit: 20, windowMs: 60_000 });

    const body = parseUpdateUserRoleBody(await req.json().catch(() => null));
    if (body.userId === ctx.profile.id || body.userId === ctx.user.id) throw forbidden("No puedes cambiar tu propio rol");

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("users")
      .select("id, uid, role_id, role")
      .eq("id", body.userId)
      .maybeSingle();
    if (targetError) throw new Error("Target user lookup failed");
    if (!targetUser) throw notFound("Usuario no encontrado");

    const { data: targetRole, error: roleError } = await supabaseAdmin
      .from("rol")
      .select("id, slug, perms")
      .eq("id", body.roleId)
      .maybeSingle();
    if (roleError) throw new Error("Role lookup failed");
    if (!targetRole || typeof targetRole.slug !== "string") throw badRequest("Rol no encontrado");

    if (roleIsPrivileged(targetRole) && !hasPermission(ctx, "*.*")) {
      throw forbidden("No puedes asignar este rol");
    }

    const { error } = await supabaseAdmin.from("users").update({ role_id: body.roleId, role: targetRole.slug }).eq("id", body.userId);
    if (error) throw new Error("Role update failed");

    const targetUid = typeof targetUser.uid === "string" ? targetUser.uid : null;
    if (targetUid) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUid, {
        app_metadata: { role: targetRole.slug },
      });
      if (authError) {
        console.error("auth_role_metadata_update_failed", { requestId, targetUserId: body.userId });
      }
    }

    await writeAuditEvent({
      actorUserId: ctx.user.id,
      action: "users.roles.update",
      resourceType: "users",
      resourceId: body.userId,
      requestId,
      success: true,
      metadata: { roleId: body.roleId, roleSlug: targetRole.slug },
    });

    return NextResponse.json({ ok: true, requestId }, { status: 200 });
  } catch (error) {
    await writeAuditEvent({
      actorUserId: actorId,
      action: "users.roles.update",
      requestId,
      success: false,
      metadata: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return handleApiError(error, requestId, { route: "/api/admin/users/role", method: "POST", actorId });
  }
}
