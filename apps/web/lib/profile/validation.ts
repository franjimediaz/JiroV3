import { badRequest } from "@/lib/auth/apiError";

export type ProfileInput =
  | { action: "details"; name: string; surname: string }
  | { action: "email"; email: string }
  | { action: "finishEmail" }
  | { action: "password"; currentPassword: string; password: string };

export function parseProfileInput(value: unknown): ProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest();
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number, trim = true) => {
    if (typeof input[key] !== "string") throw badRequest(`Campo obligatorio: ${key}`);
    const result = trim ? input[key].trim() : input[key];
    if (!result || result.length > max || (trim && [...result].some(char => char.charCodeAt(0) < 32))) throw badRequest(`Campo no válido: ${key}`);
    return result;
  };
  const allowed: Record<string, string[]> = {
    details: ["action", "name", "surname"], email: ["action", "email"], finishEmail: ["action"],
    password: ["action", "currentPassword", "password", "confirmPassword"],
  };
  if (typeof input.action !== "string" || !Object.hasOwn(allowed, input.action) || Object.keys(input).some(key => !allowed[input.action as string]!.includes(key))) throw badRequest();
  switch (input.action) {
    case "details": return { action: "details", name: text("name", 100), surname: text("surname", 150) };
    case "email": {
      const email = text("email", 254).toLowerCase();
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw badRequest("Email no válido");
      return { action: "email", email };
    }
    case "finishEmail": return { action: "finishEmail" };
    case "password": {
      const currentPassword = text("currentPassword", 1024, false), password = text("password", 128, false);
      if (password.length < 12) throw badRequest("La contraseña debe tener al menos 12 caracteres");
      if (password !== input.confirmPassword) throw badRequest("Las contraseñas no coinciden");
      if (password === currentPassword) throw badRequest("La nueva contraseña debe ser diferente");
      return { action: "password", currentPassword, password };
    }
    default: throw badRequest();
  }
}
