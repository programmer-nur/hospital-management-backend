import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import sendResponse from "../../shared/sendResponse";
import { AuditLog } from "./audit.model";

/**
 * Query the audit trail.
 *
 * The filters mirror the questions an investigation actually asks: what did
 * this actor do, who touched this record, and what was denied.
 */
const getAuditLogs = async (req: Request, res: Response) => {
  const {
    actor,
    resource,
    resourceId,
    action,
    success,
    dateFrom,
    dateTo,
    page = 1,
    limit = 25,
  } = req.query as any;

  const currentPage = Number(page);
  const pageSize = Number(limit);

  const filter: any = {};
  if (actor) filter.actor = actor;
  if (resource) filter.resource = resource;
  if (resourceId) filter.resourceId = resourceId;
  if (action) filter.action = action;
  if (success !== undefined) filter.success = success === "true";
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((currentPage - 1) * pageSize)
    .limit(pageSize);

  const total = await AuditLog.countDocuments(filter);
  const totalPages = Math.ceil(total / pageSize);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Audit logs retrieved successfully",
    meta: {
      currentPage,
      totalPages,
      total,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    } as any,
    data: logs,
  });
};

/** Everything recorded against one record — the "who touched this" question. */
const getResourceTrail = async (req: Request, res: Response) => {
  const { resource, resourceId } = req.params;

  const logs = await AuditLog.find({ resource, resourceId })
    .sort({ createdAt: -1 })
    .limit(100);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Resource trail retrieved successfully",
    data: logs,
  });
};

export const AuditController = { getAuditLogs, getResourceTrail };
