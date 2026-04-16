import expressPromiseRouter from "express-promise-router";
import { PatientController } from "./patient.controller";
import auth from "../../middlewares/authentication";
import hasRole from "../../middlewares/has-role";
import { StatusCodes } from "http-status-codes";
import sendResponse from "../../shared/sendResponse";
import {
  validateCreatePatient,
  validateUpdatePatient,
  validatePatientId,
} from "./patient.validation";

const router = expressPromiseRouter();

// Simple validation middleware
const validateCreatePatientMiddleware = (req: any, res: any, next: any) => {
  const errors = validateCreatePatient(req.body);
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

const validateUpdatePatientMiddleware = (req: any, res: any, next: any) => {
  const errors = validateUpdatePatient(req.body);
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

const validatePatientIdMiddleware = (req: any, res: any, next: any) => {
  const error = validatePatientId(req.params.id);
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

// Public route - Register a new patient
router.post(
  "/register",
  validateCreatePatientMiddleware,
  PatientController.registerPatient
);

// Protected routes - Authentication required
router.use(auth);

// Get current patient's profile
router.get("/me", PatientController.getMyProfile);

// Update current patient's profile
router.put(
  "/me",
  validateUpdatePatientMiddleware,
  PatientController.updateMyProfile
);

// Admin only routes
router.use(hasRole("admin", "superadmin"));

// Get all patients (with pagination and filtering)
router.get("/", PatientController.getAllPatients);

// Get patient by ID
router.get(
  "/:id",
  validatePatientIdMiddleware,
  PatientController.getPatientById
);

// Update any patient (admin can update any patient)
router.put(
  "/:id",
  validatePatientIdMiddleware,
  validateUpdatePatientMiddleware,
  PatientController.updatePatient
);

// Delete patient
router.delete(
  "/:id",
  validatePatientIdMiddleware,
  PatientController.deletePatient
);

export const PatientRoute = router;
