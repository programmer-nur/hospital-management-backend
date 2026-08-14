import { Schema, model } from "mongoose";
import { IAuditLog, AuditLogModel } from "./audit.type";

const auditLogSchema = new Schema<IAuditLog, AuditLogModel>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    actorEmail: { type: String },
    actorRoles: { type: [String], default: [] },

    action: {
      type: String,
      enum: ["read", "create", "update", "delete"],
      required: true,
    },
    method: { type: String, required: true },
    path: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },

    requestBody: { type: Schema.Types.Mixed },
    query: { type: Schema.Types.Mixed },

    statusCode: { type: Number, required: true },
    success: { type: Boolean, required: true },
    durationMs: { type: Number, default: 0 },

    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

// The queries an investigation actually runs: "what did this user do",
// "who touched this record", and "what was denied".
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ success: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog, AuditLogModel>(
  "AuditLog",
  auditLogSchema
);
