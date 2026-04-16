import expressPromiseRouter from "express-promise-router";
import auth from "../../middlewares/authentication";
import { AdminController } from "./admin.controller";
import hasRole from "../../middlewares/has-role";

const router = expressPromiseRouter();

// Apply authentication middleware to all routes
router.use(auth);

// Apply admin role middleware to all routes
router.use(hasRole("admin", "superadmin"));

// Dashboard statistics endpoint
router.get("/dashboard/stats", AdminController.getDashboardStats);

export const AdminRoute = router;
