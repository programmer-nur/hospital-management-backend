import expressPromiseRouter from "express-promise-router";
import { ScheduleController } from "./schedule.controller";
import auth from "../../middlewares/authentication";
import hasRole from "../../middlewares/has-role";
import { StatusCodes } from "http-status-codes";
import sendResponse from "../../shared/sendResponse";
import {
  validateCreateSchedule,
  validateUpdateSchedule,
  validateScheduleId,
  validateDoctorId,
  validateDate,
} from "./schedule.validation";

const router = expressPromiseRouter();

// Simple validation middleware
const validateCreateScheduleMiddleware = (req: any, res: any, next: any) => {
  const errors = validateCreateSchedule(req.body);
  if (errors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors },
    });
  }
  next();
};

const validateUpdateScheduleMiddleware = (req: any, res: any, next: any) => {
  const errors = validateUpdateSchedule(req.body);
  if (errors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors },
    });
  }
  next();
};

const validateScheduleIdMiddleware = (req: any, res: any, next: any) => {
  const errors = validateScheduleId(req.params);
  if (errors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors },
    });
  }
  next();
};

const validateDoctorIdMiddleware = (req: any, res: any, next: any) => {
  const errors = validateDoctorId(req.params);
  if (errors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors },
    });
  }
  next();
};

const validateDateMiddleware = (req: any, res: any, next: any) => {
  const errors = validateDate(req.params);
  if (errors.length > 0) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      data: { errors },
    });
  }
  next();
};

// Public routes (no authentication required)
router.get(
  "/doctor/:doctorId/available-slots/:date",
  validateDoctorIdMiddleware,
  validateDateMiddleware,
  ScheduleController.getAvailableSlots
);

// Protected routes - Authentication required
router.use(auth);

// Get current doctor's schedules
router.get("/my-schedules", ScheduleController.getMySchedules);

// Get current doctor's available slots
router.get(
  "/my-available-slots/:date",
  validateDateMiddleware,
  ScheduleController.getMyAvailableSlots
);

// Get current doctor's schedule analytics
router.get("/my-analytics", ScheduleController.getScheduleAnalytics);

// Get current doctor's schedule preferences
router.get("/my-preferences", ScheduleController.getSchedulePreferences);

// Check if schedule exists for a specific date
router.get("/my-schedule/check/:date", ScheduleController.checkScheduleExists);

// Update current doctor's schedule preferences
router.put("/my-preferences", ScheduleController.updateSchedulePreferences);

// Generate schedules for date range (doctor only)
router.post("/generate", ScheduleController.generateSchedulesForDateRange);

// Create my schedule (doctor only)
router.post(
  "/my-schedule",
  validateCreateScheduleMiddleware,
  ScheduleController.createMySchedule
);

// Update my schedule (doctor only - own schedules)
router.put(
  "/my-schedule/:id",
  validateScheduleIdMiddleware,
  validateUpdateScheduleMiddleware,
  ScheduleController.updateMySchedule
);

// Delete my schedule (doctor only - own schedules)
router.delete(
  "/my-schedule/:id",
  validateScheduleIdMiddleware,
  ScheduleController.deleteMySchedule
);

// Admin only routes
router.use(hasRole("admin"));

// Create schedule (admin only)
router.post(
  "/",
  validateCreateScheduleMiddleware,
  ScheduleController.createSchedule
);

// Get all schedules (admin only)
router.get("/", ScheduleController.getAllSchedules);

// Get schedule by ID (admin only)
router.get(
  "/:id",
  validateScheduleIdMiddleware,
  ScheduleController.getScheduleById
);

// Update any schedule (admin only)
router.put(
  "/:id",
  validateScheduleIdMiddleware,
  validateUpdateScheduleMiddleware,
  ScheduleController.updateSchedule
);

// Delete any schedule (admin only)
router.delete(
  "/:id",
  validateScheduleIdMiddleware,
  ScheduleController.deleteSchedule
);

// Clean up old schedules (admin only)
router.post("/cleanup", ScheduleController.cleanupOldSchedules);

export default router;
