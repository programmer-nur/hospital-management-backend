import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import sendResponse from "../../shared/sendResponse";
import ForbiddenError from "../../errors/forbidden";
import { User } from "../user/user.model";
import { Patient } from "../patient/patient.model";
import { Doctor } from "../doctor/doctor.model";
import { Appointment } from "../appointment/appointment.model";

// Get comprehensive dashboard statistics (admin only)
const getDashboardStats = async (req: Request, res: Response) => {
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Check if current user is admin
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  if (!isAdmin) {
    throw new ForbiddenError("Only admins can view dashboard statistics");
  }

  try {
    // Get all statistics in parallel for better performance
    const [
      totalUsers,
      totalPatients,
      totalDoctors,
      activeUsers,
      pendingUsers,
      blockedUsers,
      totalAppointments,
      scheduledAppointments,
      completedAppointments,
      cancelledAppointments,
      todayAppointments,
      upcomingAppointments,
    ] = await Promise.all([
      // User statistics
      User.countDocuments(),
      Patient.countDocuments(),
      Doctor.countDocuments(),
      User.countDocuments({ status: "approved" }),
      User.countDocuments({ status: "pending" }),
      User.countDocuments({ status: "blocked" }),

      // Appointment statistics
      Appointment.countDocuments(),
      Appointment.countDocuments({ status: "scheduled" }),
      Appointment.countDocuments({ status: "completed" }),
      Appointment.countDocuments({ status: "cancelled" }),

      // Today's appointments
      Appointment.countDocuments({
        appointmentDate: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
        status: { $in: ["scheduled", "confirmed", "in_progress"] },
      }),

      // Upcoming appointments (tomorrow onwards)
      Appointment.countDocuments({
        appointmentDate: {
          $gte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
        status: { $in: ["scheduled", "confirmed"] },
      }),
    ]);

    // Calculate additional metrics
    const userEngagementRate =
      totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
    const appointmentSuccessRate =
      totalAppointments > 0
        ? Math.round((completedAppointments / totalAppointments) * 100)
        : 0;
    const systemUtilizationRate =
      totalAppointments > 0
        ? Math.round((scheduledAppointments / totalAppointments) * 100)
        : 0;

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Dashboard statistics retrieved successfully",
      data: {
        users: {
          total: totalUsers,
          patients: totalPatients,
          doctors: totalDoctors,
          active: activeUsers,
          pending: pendingUsers,
          blocked: blockedUsers,
          engagementRate: userEngagementRate,
        },
        appointments: {
          total: totalAppointments,
          scheduled: scheduledAppointments,
          completed: completedAppointments,
          cancelled: cancelledAppointments,
          today: todayAppointments,
          upcoming: upcomingAppointments,
          successRate: appointmentSuccessRate,
          utilizationRate: systemUtilizationRate,
        },
        system: {
          health:
            userEngagementRate > 80 && appointmentSuccessRate > 70
              ? "excellent"
              : userEngagementRate > 60 && appointmentSuccessRate > 50
              ? "good"
              : "needs_attention",
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    sendResponse(res, {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      success: false,
      message: "Failed to retrieve dashboard statistics",
      data: null,
    });
  }
};

export const AdminController = {
  getDashboardStats,
};
