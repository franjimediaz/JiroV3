import { asRecord, requiredString, requiredUuid, optionalString } from "./common";
import { badRequest } from "@/lib/auth/apiError";

export function parseCreateUserBody(value: unknown) {
  const body = asRecord(value);
  const password = requiredString(body.password, "password", 200);
  if (password.length < 12) throw badRequest("password debe tener al menos 12 caracteres");
  return {
    email: requiredString(body.email, "email", 320).toLowerCase(),
    password,
    name: optionalString(body.name, "name", 160) ?? null,
    roleId: requiredUuid(body.role_id, "role_id"),
  };
}

export function parseUpdateUserRoleBody(value: unknown) {
  const body = asRecord(value);
  return {
    userId: requiredUuid(body.userId, "userId"),
    roleId: requiredUuid(body.roleId, "roleId"),
  };
}
