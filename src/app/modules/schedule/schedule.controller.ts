import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Schedule } from "./schedule.model";
import { Doctor } from "../doctor/doctor.model";
import { ScheduleGenerationService } from "./schedule-generation.service";
import sendResponse from "../../shared/sendResponse";
import {
  validateCreateSchedule,
  validateUpdateSchedule,
  validateScheduleId,
  validateDoctorId,
  validateDate,
} from "./schedule.validation";
import CustomAPIError from "../../errors/custom-api";
import NotFoundError from "../../errors/not-found";

// Create a new schedule
const createSchedule = async (req: Request, res: Response) => {
  const scheduleData = req.body;

  // Validate request data
  const validationErrors = validateCreateSchedule(scheduleData);
  if (validationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: validationErrors },
    });
  }

  // Check if doctor exists
  const doctor = await Doctor.findById(scheduleData.doctor);
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Check if schedule already exists for this doctor and date
  const existingSchedule = await Schedule.findByDoctorAndDate(
    scheduleData.doctor,
    new Date(scheduleData.date)
  );

  if (existingSchedule) {
    throw new CustomAPIError(
      "Schedule already exists for this doctor and date",
      StatusCodes.CONFLICT
    );
  }

  // Create new schedule
  const newSchedule = new Schedule({
    ...scheduleData,
    date: new Date(scheduleData.date),
  });

  const savedSchedule = await newSchedule.save();

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Schedule created successfully",
    data: savedSchedule,
  });
};

// Get all schedules
const getAllSchedules = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, doctor, date, isActive } = req.query;

  const filter: any = {};
  if (doctor) filter.doctor = doctor;
  if (date) filter.date = new Date(date as string);
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const schedules = await Schedule.find(filter)
    .populate("doctor", "firstName lastName specialization")
    .sort({ date: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));

  const total = await Schedule.countDocuments(filter);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedules retrieved successfully",
    data: schedules,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPage: Math.ceil(total / Number(limit)),
    },
  });
};

// Get schedule by ID
const getScheduleById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const validationErrors = validateScheduleId({ id });
  if (validationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: validationErrors },
    });
  }

  const schedule = await Schedule.findById(id).populate(
    "doctor",
    "firstName lastName specialization"
  );

  if (!schedule) {
    throw new NotFoundError("Schedule not found");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedule retrieved successfully",
    data: schedule,
  });
};

// Get current doctor's schedules
const getMySchedules = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { page = 1, limit = 10, date, isActive } = req.query;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  const filter: any = { doctor: doctor._id };
  if (date) filter.date = new Date(date as string);
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const schedules = await Schedule.find(filter)
    .sort({ date: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));

  const total = await Schedule.countDocuments(filter);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedules retrieved successfully",
    data: schedules,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPage: Math.ceil(total / Number(limit)),
    },
  });
};

// Check if schedule exists for a specific date
const checkScheduleExists = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { date } = req.params;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Check if schedule exists for this doctor and date (including inactive schedules)
  // Parse date in UTC to match how dates are stored in the database
  const targetDate = new Date(date + "T00:00:00.000Z");

  console.log(
    `Checking schedule for doctor: ${
      doctor._id
    }, date: ${date}, targetDate: ${targetDate.toISOString()}`
  );

  const schedule = await Schedule.findOne({
    doctor: doctor._id.toString(),
    date: targetDate,
  });

  console.log(
    `Schedule found:`,
    schedule
      ? { id: schedule._id, isActive: schedule.isActive, date: schedule.date }
      : "null"
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: schedule ? "Schedule exists" : "No schedule found",
    data: {
      exists: !!schedule,
      schedule: schedule || null,
      date: date,
      doctorId: doctor._id.toString(),
    },
  });
};

// Create my schedule (doctor only)
const createMySchedule = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const scheduleData = req.body;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Validate request data
  const validationErrors = validateCreateSchedule(scheduleData);
  if (validationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: validationErrors },
    });
  }

  // Check if schedule already exists for this doctor and date
  const existingSchedule = await Schedule.findByDoctorAndDate(
    doctor._id.toString(),
    new Date(scheduleData.date)
  );

  if (existingSchedule) {
    throw new CustomAPIError(
      "Schedule already exists for this date",
      StatusCodes.CONFLICT
    );
  }

  // Create new schedule with doctor ID
  const newSchedule = new Schedule({
    ...scheduleData,
    doctor: doctor._id.toString(),
    date: new Date(scheduleData.date),
  });

  const savedSchedule = await newSchedule.save();

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Schedule created successfully",
    data: savedSchedule,
  });
};

// Update my schedule (doctor only - own schedules)
const updateMySchedule = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { id } = req.params;
  const updateData = req.body;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Find the schedule and verify ownership
  const schedule = await Schedule.findById(id);
  if (!schedule) {
    throw new NotFoundError("Schedule not found");
  }

  // Check if the schedule belongs to the current doctor
  if (schedule.doctor.toString() !== doctor._id.toString()) {
    throw new CustomAPIError(
      "You don't have permission to update this schedule",
      StatusCodes.FORBIDDEN
    );
  }

  // Update the schedule
  const updatedSchedule = await Schedule.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedule updated successfully",
    data: updatedSchedule,
  });
};

// Update schedule (admin only - any schedule)
const updateSchedule = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  const validationErrors = validateScheduleId({ id });
  if (validationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: validationErrors },
    });
  }

  const updateValidationErrors = validateUpdateSchedule(updateData);
  if (updateValidationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: updateValidationErrors },
    });
  }

  const schedule = await Schedule.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!schedule) {
    throw new NotFoundError("Schedule not found");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedule updated successfully",
    data: schedule,
  });
};

// Delete my schedule (doctor only - own schedules)
const deleteMySchedule = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { id } = req.params;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Find the schedule and verify ownership
  const schedule = await Schedule.findById(id);
  if (!schedule) {
    throw new NotFoundError("Schedule not found");
  }

  // Check if the schedule belongs to the current doctor
  if (schedule.doctor.toString() !== doctor._id.toString()) {
    throw new CustomAPIError(
      "You don't have permission to delete this schedule",
      StatusCodes.FORBIDDEN
    );
  }

  // Delete the schedule
  await Schedule.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedule deleted successfully",
    data: null,
  });
};

// Delete schedule (admin only - any schedule)
const deleteSchedule = async (req: Request, res: Response) => {
  const { id } = req.params;

  const validationErrors = validateScheduleId({ id });
  if (validationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: validationErrors },
    });
  }

  const schedule = await Schedule.findByIdAndDelete(id);

  if (!schedule) {
    throw new NotFoundError("Schedule not found");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedule deleted successfully",
    data: null,
  });
};

// Get available slots for a specific doctor and date
const getAvailableSlots = async (req: Request, res: Response) => {
  const { doctorId, date } = req.params;

  // Validate parameters
  const doctorValidationErrors = validateDoctorId({ doctorId });
  if (doctorValidationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: doctorValidationErrors },
    });
  }

  const dateValidationErrors = validateDate({ date });
  if (dateValidationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: dateValidationErrors },
    });
  }

  // Validate date format
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new CustomAPIError("Invalid date format", StatusCodes.BAD_REQUEST);
  }

  // Check if doctor exists
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  const availableSlots = await Schedule.getAvailableSlots(doctorId, date);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Available slots retrieved successfully",
    data: {
      doctor: {
        id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
      },
      date,
      availableSlots,
    },
  });
};

// Get current doctor's available slots
const getMyAvailableSlots = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { date } = req.params;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Validate date
  const dateValidationErrors = validateDate({ date });
  if (dateValidationErrors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors: dateValidationErrors },
    });
  }

  // Validate date format
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new CustomAPIError("Invalid date format", StatusCodes.BAD_REQUEST);
  }

  // Get available slots
  const availableSlots = await Schedule.getAvailableSlots(
    doctor._id.toString(),
    date
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Available slots retrieved successfully",
    data: {
      doctor: {
        id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
      },
      date,
      availableSlots,
    },
  });
};

// Get schedule analytics for current doctor
const getScheduleAnalytics = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { dateFrom, dateTo, period = "7d" } = req.query as any;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Calculate date range based on period
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  switch (period) {
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  // Override with custom date range if provided
  if (dateFrom) startDate = new Date(dateFrom);
  if (dateTo) endDate = new Date(dateTo);

  // Get schedules in date range
  const schedules = await Schedule.find({
    doctor: doctor._id,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });

  // Get appointments for the same period
  const { Appointment } = await import("../appointment/appointment.model");
  const appointments = await Appointment.find({
    doctor: doctor._id,
    appointmentDate: { $gte: startDate, $lte: endDate },
  })
    .populate("patient", "firstName lastName")
    .sort({ appointmentDate: 1, startTime: 1 });

  // Calculate analytics
  const analytics = {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days: Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ),
    },
    schedules: {
      total: schedules.length,
      active: schedules.filter((s) => s.isActive).length,
      totalSlots: schedules.reduce((acc, s) => acc + s.timeSlots.length, 0),
      availableSlots: schedules.reduce(
        (acc, s) => acc + s.timeSlots.filter((slot) => slot.isAvailable).length,
        0
      ),
    },
    appointments: {
      total: appointments.length,
      completed: appointments.filter((a) => a.status === "completed").length,
      cancelled: appointments.filter((a) => a.status === "cancelled").length,
      scheduled: appointments.filter((a) => a.status === "scheduled").length,
      confirmed: appointments.filter((a) => a.status === "confirmed").length,
      noShow: appointments.filter((a) => a.status === "no_show").length,
    },
    utilization: {
      overall: 0,
      completionRate: 0,
      cancellationRate: 0,
      noShowRate: 0,
    },
    dailyStats: [] as any[],
    timeSlotStats: [] as any[],
    dayOfWeekStats: [] as any[],
  };

  // Calculate utilization rates
  if (analytics.schedules.totalSlots > 0) {
    analytics.utilization.overall = Math.round(
      (analytics.appointments.total / analytics.schedules.totalSlots) * 100
    );
  }

  if (analytics.appointments.total > 0) {
    analytics.utilization.completionRate = Math.round(
      (analytics.appointments.completed / analytics.appointments.total) * 100
    );
    analytics.utilization.cancellationRate = Math.round(
      (analytics.appointments.cancelled / analytics.appointments.total) * 100
    );
    analytics.utilization.noShowRate = Math.round(
      (analytics.appointments.noShow / analytics.appointments.total) * 100
    );
  }

  // Generate daily stats
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const daySchedules = schedules.filter(
      (s) => s.date.toISOString().split("T")[0] === dateStr
    );
    const dayAppointments = appointments.filter(
      (a) => a.appointmentDate.toISOString().split("T")[0] === dateStr
    );

    const totalSlots = daySchedules.reduce(
      (acc, s) => acc + s.timeSlots.filter((slot) => slot.isAvailable).length,
      0
    );
    const bookedSlots = dayAppointments.length;

    analytics.dailyStats.push({
      date: dateStr,
      day: currentDate.toLocaleDateString("en-US", { weekday: "short" }),
      totalSlots,
      bookedSlots,
      utilization:
        totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0,
      completed: dayAppointments.filter((a) => a.status === "completed").length,
      cancelled: dayAppointments.filter((a) => a.status === "cancelled").length,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Generate time slot stats (9 AM to 5 PM)
  for (let hour = 9; hour < 17; hour++) {
    const timeSlot = `${hour.toString().padStart(2, "0")}:00`;
    const slotAppointments = appointments.filter(
      (a) => a.startTime === timeSlot
    );

    analytics.timeSlotStats.push({
      time: timeSlot,
      appointments: slotAppointments.length,
      completed: slotAppointments.filter((a) => a.status === "completed")
        .length,
      cancelled: slotAppointments.filter((a) => a.status === "cancelled")
        .length,
      revenue:
        slotAppointments.filter((a) => a.status === "completed").length * 100, // Assuming $100 per completed appointment
    });
  }

  // Generate day of week stats
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  dayNames.forEach((dayName, index) => {
    const dayAppointments = appointments.filter(
      (a) => new Date(a.appointmentDate).getDay() === index
    );

    analytics.dayOfWeekStats.push({
      day: dayName,
      appointments: dayAppointments.length,
      completed: dayAppointments.filter((a) => a.status === "completed").length,
      cancelled: dayAppointments.filter((a) => a.status === "cancelled").length,
    });
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Schedule analytics retrieved successfully",
    data: analytics,
  });
};

// Generate schedules for date range (doctor only)
const generateSchedulesForDateRange = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { startDate, endDate, preferences } = req.body;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  try {
    const schedules =
      await ScheduleGenerationService.generateSchedulesForDateRange(
        doctor._id.toString(),
        new Date(startDate),
        new Date(endDate),
        preferences
      );

    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: "Schedules generated successfully",
      data: { schedules, count: schedules.length },
    });
  } catch (error) {
    console.error("Error generating schedules:", error);
    throw new CustomAPIError(
      "Failed to generate schedules",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// Clean up old schedules (admin only)
const cleanupOldSchedules = async (req: Request, res: Response) => {
  try {
    await ScheduleGenerationService.cleanupOldSchedules();

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Old schedules cleaned up successfully",
      data: null,
    });
  } catch (error) {
    console.error("Error cleaning up schedules:", error);
    throw new CustomAPIError(
      "Failed to cleanup old schedules",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// Get doctor schedule preferences
const getSchedulePreferences = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  try {
    const preferences = await ScheduleGenerationService.getDoctorPreferences(
      doctor._id.toString()
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Schedule preferences retrieved successfully",
      data: preferences,
    });
  } catch (error) {
    console.error("Error getting preferences:", error);
    throw new CustomAPIError(
      "Failed to get schedule preferences",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// Update doctor schedule preferences
const updateSchedulePreferences = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new CustomAPIError(
      "Authentication required",
      StatusCodes.UNAUTHORIZED
    );
  }

  const { preferences } = req.body;

  // Find doctor by user ID
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  try {
    await ScheduleGenerationService.updateDoctorPreferences(
      doctor._id.toString(),
      preferences
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Schedule preferences updated successfully",
      data: null,
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    throw new CustomAPIError(
      "Failed to update schedule preferences",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// Utility function to create default schedule for a doctor
const createDefaultSchedule = async (doctorId: string, date: Date) => {
  try {
    return await Schedule.createDefaultSchedule(doctorId, date);
  } catch (error) {
    console.error("Error creating default schedule:", error);
    throw error;
  }
};

export const ScheduleController = {
  createSchedule,
  createMySchedule,
  getAllSchedules,
  getScheduleById,
  getMySchedules,
  checkScheduleExists,
  updateMySchedule,
  updateSchedule,
  deleteMySchedule,
  deleteSchedule,
  getAvailableSlots,
  getMyAvailableSlots,
  getScheduleAnalytics,
  generateSchedulesForDateRange,
  cleanupOldSchedules,
  getSchedulePreferences,
  updateSchedulePreferences,
  createDefaultSchedule,
};
