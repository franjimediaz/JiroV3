import { forbidden } from "./apiError";
import type { CurrentUserContext } from "./getCurrentUser";

export function requireTenantAccess(ctx: CurrentUserContext, resourceTenantId?: string | null) {
  const userTenantId =
    typeof ctx.user.app_metadata?.tenant_id === "string"
      ? ctx.user.app_metadata.tenant_id
      : typeof ctx.user.user_metadata?.tenant_id === "string"
        ? ctx.user.user_metadata.tenant_id
        : null;

  if (resourceTenantId && userTenantId && resourceTenantId !== userTenantId) {
    throw forbidden();
  }
}
