export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INTERNAL";

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: "Solicitud invalida",
  UNAUTHORIZED: "No autenticado",
  FORBIDDEN: "No tienes permiso para realizar esta accion",
  NOT_FOUND: "Recurso no encontrado",
  RATE_LIMITED: "Demasiadas solicitudes",
  CONFLICT: "La operacion no se puede completar",
  INTERNAL: "Error interno",
};

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  safeMessage: string;
  retryAfter?: number;

  constructor(code: ApiErrorCode, status: number, message?: string, options?: { retryAfter?: number }) {
    super(message || DEFAULT_MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.safeMessage = message || DEFAULT_MESSAGES[code];
    this.retryAfter = options?.retryAfter;
  }
}

export function badRequest(message = DEFAULT_MESSAGES.BAD_REQUEST) {
  return new ApiError("BAD_REQUEST", 400, message);
}

export function unauthorized(message = DEFAULT_MESSAGES.UNAUTHORIZED) {
  return new ApiError("UNAUTHORIZED", 401, message);
}

export function forbidden(message = DEFAULT_MESSAGES.FORBIDDEN) {
  return new ApiError("FORBIDDEN", 403, message);
}

export function notFound(message = DEFAULT_MESSAGES.NOT_FOUND) {
  return new ApiError("NOT_FOUND", 404, message);
}

export function conflict(message = DEFAULT_MESSAGES.CONFLICT) {
  return new ApiError("CONFLICT", 409, message);
}

export function rateLimited(retryAfter: number, message = DEFAULT_MESSAGES.RATE_LIMITED) {
  return new ApiError("RATE_LIMITED", 429, message, { retryAfter });
}
