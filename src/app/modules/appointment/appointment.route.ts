import expressPromiseRouter from "express-promise-router";
import { AppointmentController } from "./appointment.controller";
import auth from "../../middlewares/authentication";
import hasRole from "../../middlewares/has-role";
import { StatusCodes } from "http-status-codes";
import sendResponse from "../../shared/sendResponse";
import {
  validateCreateAppointment,
  validateUpdateAppointment,
  validateCancelAppointment,
  validateAppointmentId,
  validatePatientId,
  validateDoctorId,
  validateDate,
} from "./appointment.validation";

const router = expressPromiseRouter();

// Simple validation middleware
const validateCreateAppointmentMiddleware = (req: any, res: any, next: any) => {
  const errors = validateCreateAppointment(req.body);
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

const validateUpdateAppointmentMiddleware = (req: any, res: any, next: any) => {
  const errors = validateUpdateAppointment(req.body);
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

const validateCancelAppointmentMiddleware = (req: any, res: any, next: any) => {
  const errors = validateCancelAppointment(req.body);
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

const validateAppointmentIdMiddleware = (req: any, res: any, next: any) => {
  const error = validateAppointmentId(req.params.id);
  if (error) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: error,
      data: null,
    });
  }
  next();
};

const validatePatientIdMiddleware = (req: any, res: any, next: any) => {
  const error = validatePatientId(req.params.patientId);
  if (error) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: error,
      data: null,
    });
  }
  next();
};

const validateDoctorIdMiddleware = (req: any, res: any, next: any) => {
  const error = validateDoctorId(req.params.doctorId);
  if (error) {
    return sendResponse(res, {
      statusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: error,
      data: null,
    });
  }
  next();
};

// Protected routes - Authentication required
router.use(auth);

// Get current patient's appointments
router.get("/my-appointments", AppointmentController.getMyAppointments);

// Get current doctor's appointments
router.get("/doctor-appointments", AppointmentController.getDoctorAppointments);

// Get patient's appointments for a specific date
router.get(
  "/my-appointments/date/:date",
  AppointmentController.getPatientAppointmentsForDate
);

// Create a new appointment
router.post(
  "/",
  validateCreateAppointmentMiddleware,
  AppointmentController.createAppointment
);

// Get appointment by ID
router.get(
  "/:id",
  validateAppointmentIdMiddleware,
  AppointmentController.getAppointmentById
);

// Update appointment
router.put(
  "/:id",
  validateAppointmentIdMiddleware,
  validateUpdateAppointmentMiddleware,
  AppointmentController.updateAppointment
);

// Cancel appointment
router.patch(
  "/:id/cancel",
  validateAppointmentIdMiddleware,
  validateCancelAppointmentMiddleware,
  AppointmentController.cancelAppointment
);

// Get appointment statistics
router.get("/stats/overview", AppointmentController.getAppointmentStats);

// Admin only routes
router.use(hasRole("admin", "superadmin"));

// Get all appointments
router.get("/", AppointmentController.getAllAppointments);

// Delete appointment
router.delete(
  "/:id",
  validateAppointmentIdMiddleware,
  AppointmentController.deleteAppointment
);

export const AppointmentRoute = router;
