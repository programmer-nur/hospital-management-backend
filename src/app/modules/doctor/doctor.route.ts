import expressPromiseRouter from "express-promise-router";
import { DoctorController } from "./doctor.controller";
import auth from "../../middlewares/authentication";
import hasRole from "../../middlewares/has-role";
import { StatusCodes } from "http-status-codes";
import sendResponse from "../../shared/sendResponse";
import {
  validateCreateDoctor,
  validateUpdateDoctor,
  validateDoctorId,
} from "./doctor.validation";

const router = expressPromiseRouter();

// Simple validation middleware
const validateCreateDoctorMiddleware = (req: any, res: any, next: any) => {
  const errors = validateCreateDoctor(req.body);
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

const validateUpdateDoctorMiddleware = (req: any, res: any, next: any) => {
  const errors = validateUpdateDoctor(req.body);
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
  const error = validateDoctorId(req.params.id);
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

// Public route - Get doctors by specialization (for booking)
router.get(
  "/specialization/:specialization",
  DoctorController.getDoctorsBySpecialization
);
// Get all doctors (with pagination and filtering)
router.get("/", DoctorController.getAllDoctors);

// Protected routes - Authentication required
router.use(auth);

// Get current doctor's profile
router.get("/me", DoctorController.getMyProfile);

// Get doctor dashboard statistics
router.get("/dashboard/stats", DoctorController.getDoctorDashboardStats);

// Update current doctor's profile
router.put(
  "/me",
  validateUpdateDoctorMiddleware,
  DoctorController.updateDoctor
);

// Admin only routes
router.use(hasRole("admin", "superadmin"));

// Create a new doctor
router.post("/", validateCreateDoctorMiddleware, DoctorController.createDoctor);

// Get doctor by ID
router.get("/:id", validateDoctorIdMiddleware, DoctorController.getDoctorById);

// Update any doctor (admin can update any doctor)
router.put(
  "/:id",
  validateDoctorIdMiddleware,
  validateUpdateDoctorMiddleware,
  DoctorController.updateDoctor
);

// Delete doctor
router.delete(
  "/:id",
  validateDoctorIdMiddleware,
  DoctorController.deleteDoctor
);

export const DoctorRoute = router;
