import { Document, Model, Types } from "mongoose";

/**
 * What happened. Derived from the HTTP method rather than declared per route,
 * so a new endpoint is captured without anyone remembering to annotate it.
 */
export type AuditAction = "read" | "create" | "update" | "delete";

export interface IAuditLog extends Document {
  /** Absent for unauthenticated requests, which are still worth recording. */
  actor?: Types.ObjectId;
  actorEmail?: string;
  actorRoles: string[];

  action: AuditAction;
  method: string;
  path: string;

  /** The module touched, e.g. "patients" — derived from the path. */
  resource: string;
  /** The specific record, when the route carries an id. */
  resourceId?: string;

  /** Request body with secrets redacted. */
  requestBody?: Record<string, unknown>;
  query?: Record<string, unknown>;

  statusCode: number;
  /** Whether the request was allowed through, derived from the status. */
  success: boolean;
  durationMs: number;

  ip?: string;
  userAgent?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type AuditLogModel = Model<IAuditLog>;
