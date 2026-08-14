import { Schema, model } from "mongoose";
import { INotification, NotificationModel } from "./notification.type";

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient is required"],
    },
    // Snapshotted at queue time: if the patient later changes their email, a
    // message already queued must still go where it was addressed.
    recipientAddress: {
      type: String,
      required: [true, "Recipient address is required"],
      trim: true,
    },
    channel: {
      type: String,
      enum: ["email"],
      default: "email",
    },
    template: {
      type: String,
      enum: [
        "appointment_confirmation",
        "appointment_reminder_24h",
        "appointment_reminder_2h",
        "appointment_cancelled",
      ],
      required: [true, "Template is required"],
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    appointment: {
      type: Schema.Types.ObjectId,
      ref: "Appointment",
    },
    scheduledFor: {
      type: Date,
      required: [true, "scheduledFor is required"],
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "cancelled"],
      default: "pending",
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: { type: String },
    sentAt: { type: Date },
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

// The dispatcher's hot path: pending work that is now due.
notificationSchema.index({ status: 1, scheduledFor: 1 });
notificationSchema.index({ appointment: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

/**
 * Idempotency, enforced by the database rather than by application checks.
 *
 * Sparse so notifications without a dedupe key are unaffected. A duplicate
 * lifecycle hook — a retried request, a double-submit — hits a duplicate key
 * error instead of sending the patient a second copy.
 */
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, sparse: true }
);

export const Notification = model<INotification, NotificationModel>(
  "Notification",
  notificationSchema
);
