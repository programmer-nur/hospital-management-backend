import { Notification } from "./notification.model";
import { getProvider } from "./notification.providers";
import {
  INotificationPayload,
  NotificationTemplate,
} from "./notification.type";

/** Attempts before a notification is abandoned as failed. */
const MAX_ATTEMPTS = 3;

/** How many due notifications one dispatcher tick will handle. */
const BATCH_SIZE = 25;

/**
 * Rendered message per template.
 *
 * Plain text deliberately: it renders everywhere, degrades well, and avoids
 * shipping an HTML templating dependency for four messages.
 */
function render(
  template: NotificationTemplate,
  payload: INotificationPayload
): { subject: string; body: string } {
  const doctor = payload.doctorName ?? "your doctor";
  const date = payload.appointmentDate ?? "";
  const time = payload.startTime ?? "";
  const patient = payload.patientName ?? "there";

  switch (template) {
    case "appointment_confirmation":
      return {
        subject: `Appointment confirmed — ${date} at ${time}`,
        body:
          `Hi ${patient},\n\n` +
          `Your appointment with ${doctor} is confirmed for ${date} at ${time}.\n\n` +
          `If you need to cancel, please do so as early as possible so the ` +
          `slot can be offered to someone else.`,
      };

    case "appointment_reminder_24h":
      return {
        subject: `Reminder: appointment tomorrow at ${time}`,
        body:
          `Hi ${patient},\n\n` +
          `This is a reminder of your appointment with ${doctor} tomorrow, ` +
          `${date}, at ${time}.`,
      };

    case "appointment_reminder_2h":
      return {
        subject: `Reminder: appointment today at ${time}`,
        body:
          `Hi ${patient},\n\n` +
          `Your appointment with ${doctor} is today at ${time}. ` +
          `Please arrive a few minutes early.`,
      };

    case "appointment_cancelled":
      return {
        subject: `Appointment cancelled — ${date} at ${time}`,
        body:
          `Hi ${patient},\n\n` +
          `Your appointment with ${doctor} on ${date} at ${time} has been ` +
          `cancelled.`,
      };
  }
}

export interface QueueInput {
  recipient: any;
  recipientAddress: string;
  template: NotificationTemplate;
  payload: INotificationPayload;
  appointment?: any;
  scheduledFor: Date;
}

/**
 * Queue one notification.
 *
 * Idempotent per (appointment, template) via the unique sparse index — a
 * duplicate hook is swallowed rather than producing a second message. Queueing
 * never throws into the caller: failing to record a reminder must not fail the
 * booking that triggered it.
 */
export async function queueNotification(
  input: QueueInput
): Promise<void> {
  const dedupeKey = input.appointment
    ? `${input.appointment}:${input.template}`
    : undefined;

  try {
    await Notification.create({
      recipient: input.recipient,
      recipientAddress: input.recipientAddress,
      channel: "email",
      template: input.template,
      payload: input.payload,
      appointment: input.appointment,
      scheduledFor: input.scheduledFor,
      status: "pending",
      dedupeKey,
    });
  } catch (error: any) {
    // 11000 is the duplicate-key error: this notification is already queued,
    // which is the desired outcome, not a failure.
    if (error?.code === 11000) return;
    console.error("[notifications] failed to queue:", error?.message);
  }
}

/**
 * Cancel pending notifications for an appointment.
 *
 * Called when an appointment is cancelled so a reminder for a visit that is no
 * longer happening never reaches the patient. Already-sent rows are left
 * untouched — they are a delivery record, not a to-do list.
 */
export async function cancelPendingForAppointment(
  appointmentId: any
): Promise<number> {
  const result = await Notification.updateMany(
    { appointment: appointmentId, status: "pending" },
    { $set: { status: "cancelled" } }
  );
  return result.modifiedCount ?? 0;
}

/**
 * Dispatch everything currently due.
 *
 * Each row is claimed with a conditional update before sending, so two
 * overlapping ticks cannot both send the same message. Returns a summary so
 * the caller — cron or a test — can assert on what happened.
 */
export async function dispatchDueNotifications(now: Date = new Date()): Promise<{
  claimed: number;
  sent: number;
  failed: number;
}> {
  const due = await Notification.find({
    status: "pending",
    scheduledFor: { $lte: now },
  })
    .sort({ scheduledFor: 1 })
    .limit(BATCH_SIZE);

  const provider = getProvider();
  let claimed = 0;
  let sent = 0;
  let failed = 0;

  for (const item of due) {
    // Claim: only proceed if this row is still pending. A concurrent tick that
    // already claimed it gets modifiedCount 0 and skips.
    const claim = await Notification.updateOne(
      { _id: item._id, status: "pending" },
      { $inc: { attempts: 1 } }
    );
    if (!claim.modifiedCount) continue;
    claimed += 1;

    const { subject, body } = render(item.template, item.payload ?? {});
    const result = await provider.send(item.recipientAddress, subject, body);

    if (result.ok) {
      await Notification.updateOne(
        { _id: item._id },
        { $set: { status: "sent", sentAt: new Date() }, $unset: { lastError: 1 } }
      );
      sent += 1;
      continue;
    }

    // Give up only after MAX_ATTEMPTS; otherwise leave it pending to retry.
    const attempts = (item.attempts ?? 0) + 1;
    await Notification.updateOne(
      { _id: item._id },
      {
        $set: {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          lastError: result.error ?? "unknown error",
        },
      }
    );
    failed += 1;
  }

  return { claimed, sent, failed };
}
