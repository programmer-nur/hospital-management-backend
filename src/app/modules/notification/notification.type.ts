import { Document, Model, Types } from "mongoose";

/** Delivery channels. Only `email` has a real provider today. */
export type NotificationChannel = "email";

/**
 * What a notification is about. The template decides the rendered content and,
 * together with the appointment id, forms the deduplication key — so a retry
 * or a double lifecycle hook cannot queue the same reminder twice.
 */
export type NotificationTemplate =
  | "appointment_confirmation"
  | "appointment_reminder_24h"
  | "appointment_reminder_2h"
  | "appointment_cancelled";

export type NotificationStatus =
  | "pending"
  | "sent"
  | "failed"
  | "cancelled";

/** Values interpolated into the rendered message. */
export interface INotificationPayload {
  patientName?: string;
  doctorName?: string;
  specialization?: string;
  appointmentDate?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface INotification extends Document {
  _id: any;
  /** The user account being contacted. */
  recipient: Types.ObjectId;
  /** Resolved at queue time so a later profile edit cannot redirect a queued send. */
  recipientAddress: string;
  channel: NotificationChannel;
  template: NotificationTemplate;
  payload: INotificationPayload;

  /** Related appointment, when the notification is about one. */
  appointment?: Types.ObjectId;

  /** Earliest moment this may be dispatched. */
  scheduledFor: Date;
  status: NotificationStatus;
  attempts: number;
  lastError?: string;
  sentAt?: Date;

  /**
   * Unique per (appointment, template). The unique sparse index on this field
   * is what makes queueing idempotent — a duplicate lifecycle hook is rejected
   * by the database rather than producing a second message to the patient.
   */
  dedupeKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type NotificationModel = Model<INotification>;

/** Result returned by a channel provider. */
export interface ProviderResult {
  ok: boolean;
  /** Provider-side identifier, when one exists. */
  reference?: string;
  error?: string;
}

/**
 * A delivery channel implementation.
 *
 * Kept deliberately narrow so adding SMS or WhatsApp later means adding one
 * file, not touching the queueing or dispatch logic.
 */
export interface NotificationProvider {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(to: string, subject: string, body: string): Promise<ProviderResult>;
}
