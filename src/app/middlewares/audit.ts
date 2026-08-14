import { NextFunction, Request, Response } from "express";

import { AuditLog } from "../modules/audit/audit.model";
import { AuditAction } from "../modules/audit/audit.type";

/**
 * Never store these, in any casing, at any nesting level.
 *
 * An audit log that captures request bodies would otherwise become the single
 * best place in the system to harvest credentials.
 */
const REDACTED_KEYS = [
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "secret",
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.includes(key.toLowerCase())
      ? "[redacted]"
      : redact(val, depth + 1);
  }
  return out;
}

const ACTION_BY_METHOD: Record<string, AuditAction> = {
  GET: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/**
 * The module being touched, e.g. "/api/v1/users/123/status" -> "users".
 *
 * The version prefix is stripped first. Reading `req.baseUrl` instead recorded
 * "api" for every single request, because this middleware is mounted on the
 * parent router whose baseUrl is "/api/v1" — which made the resource field
 * useless for filtering.
 */
function resourceFromPath(path: string): string {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  // Drop a leading "api" and any "vN" version segment.
  if (segments[0] === "api") segments.shift();
  if (/^v\d+$/.test(segments[0] ?? "")) segments.shift();
  return segments[0] ?? "root";
}

/**
 * The record id, taken from the path rather than `req.params`.
 *
 * `req.params` is scoped to the router that matched it. This middleware sits on
 * the parent router, so a child route's `:id` never appears there — reading it
 * silently produced no resourceId at all, which broke the "who touched this
 * record" query entirely. Matching an ObjectId in the path is scope-independent.
 */
function resourceIdFromPath(path: string): string | undefined {
  const match = path.split("?")[0].match(/\/([0-9a-fA-F]{24})(?:\/|$)/);
  return match?.[1];
}

/**
 * Records every authenticated API request.
 *
 * Two design choices worth stating:
 *
 * 1. **Reads are logged, not just writes.** In healthcare the compliance
 *    question is usually "who *looked at* this patient's record", which a
 *    write-only log cannot answer.
 *
 * 2. **The write happens after the response is sent** and its failure is
 *    swallowed. Auditing must not add latency to, or be able to fail, the
 *    request it is observing. The tradeoff is that a crash between responding
 *    and writing loses that one entry; durable auditing would need an outbox.
 *
 * Mounted after `auth` so `req.user` is populated, which is what makes an
 * entry attributable.
 */
export function auditLog(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    // Fire and forget: the response has already gone out.
    void (async () => {
      try {
        const action = ACTION_BY_METHOD[req.method];
        // Unknown verbs (OPTIONS, HEAD) are not interesting.
        if (!action) return;

        await AuditLog.create({
          actor: req.user?._id,
          actorEmail: req.user?.email,
          actorRoles: req.user?.roles ?? [],
          action,
          method: req.method,
          path: req.originalUrl.split("?")[0],
          resource: resourceFromPath(req.originalUrl),
          resourceId: resourceIdFromPath(req.originalUrl),
          requestBody:
            req.body && Object.keys(req.body).length
              ? (redact(req.body) as Record<string, unknown>)
              : undefined,
          query:
            req.query && Object.keys(req.query).length
              ? (redact(req.query) as Record<string, unknown>)
              : undefined,
          statusCode: res.statusCode,
          success: res.statusCode < 400,
          durationMs: Date.now() - startedAt,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch (error: any) {
        console.error("[audit] failed to record request:", error?.message);
      }
    })();
  });

  next();
}

export default auditLog;
