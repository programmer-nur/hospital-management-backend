import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import sendResponse from "../../shared/sendResponse";
import { Notification } from "./notification.model";
import { dispatchDueNotifications } from "./notification.service";

/**
 * Delivery log.
 *
 * Without this, a notification system fails silently — the whole point is that
 * an admin can see what was sent, what is queued, and what failed.
 */
const getNotifications = async (req: Request, res: Response) => {
  const { status, template, page = 1, limit = 20 } = req.query as any;
  const currentPage = Number(page);
  const pageSize = Number(limit);

  const filter: any = {};
  if (status) filter.status = status;
  if (template) filter.template = template;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip((currentPage - 1) * pageSize)
    .limit(pageSize);

  const total = await Notification.countDocuments(filter);
  const totalPages = Math.ceil(total / pageSize);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Notifications retrieved successfully",
    meta: {
      currentPage,
      totalPages,
      total,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    } as any,
    data: notifications,
  });
};

/** Counts by status — the number an admin actually watches is `failed`. */
const getNotificationStats = async (_req: Request, res: Response) => {
  const [pending, sent, failed, cancelled] = await Promise.all([
    Notification.countDocuments({ status: "pending" }),
    Notification.countDocuments({ status: "sent" }),
    Notification.countDocuments({ status: "failed" }),
    Notification.countDocuments({ status: "cancelled" }),
  ]);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Notification stats retrieved successfully",
    data: { pending, sent, failed, cancelled },
  });
};

/** Requeue a failed notification, resetting its attempt count. */
const retryNotification = async (req: Request, res: Response) => {
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, status: "failed" },
    { $set: { status: "pending", attempts: 0, scheduledFor: new Date() } },
    { new: true }
  );

  sendResponse(res, {
    statusCode: notification ? StatusCodes.OK : StatusCodes.NOT_FOUND,
    success: !!notification,
    message: notification
      ? "Notification requeued"
      : "No failed notification found with that id",
    data: notification,
  });
};

/**
 * Run the dispatcher immediately.
 *
 * The cron tick is every minute; this exists so an admin (or a test) does not
 * have to wait for it.
 */
const runDispatcher = async (_req: Request, res: Response) => {
  const result = await dispatchDueNotifications();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Dispatcher run complete",
    data: result,
  });
};

export const NotificationController = {
  getNotifications,
  getNotificationStats,
  retryNotification,
  runDispatcher,
};
