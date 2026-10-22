import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiError } from "@/types/common";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string[]>) =>
  new HttpError(400, "bad_request", message, fields);
export const unauthorized = (message = "Not logged in") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Not allowed") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

/** Parses `data` with `schema` or throws a 400 with per-field messages. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  throw badRequest("Validation failed", fields);
}

/**
 * CSRF guard. The session cookie is SameSite=Strict, and on top of that every mutating request must carry
 * the `X-WickedHome` header, which a cross-site form or image cannot set.
 */
export const requireAppHeader: RequestHandler = (req, _res, next) => {
  const safe = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (safe || req.get("x-wickedhome") === "1") return next();
  next(forbidden("Missing X-WickedHome header"));
};

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound("No such endpoint"));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.retryAfterSeconds !== undefined) res.setHeader("Retry-After", String(err.retryAfterSeconds));
    const body: ApiError = { error: { code: err.code, message: err.message, fields: err.fields } };
    res.status(err.status).json(body);
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "bad_json", message: "Malformed JSON body" } } satisfies ApiError);
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal", message: "Something went wrong" } } satisfies ApiError);
};
