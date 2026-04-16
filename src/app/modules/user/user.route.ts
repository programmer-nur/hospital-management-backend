import expressPromiseRouter from "express-promise-router";
import { UserController } from "./user.controller";
import auth from "../../middlewares/authentication";
import hasRole from "../../middlewares/has-role";

const router = expressPromiseRouter();

// All routes require authentication
router.use(auth);

// All routes require admin role
router.use(hasRole("admin", "superadmin"));

// Get all users with filtering and pagination
router.get("/", UserController.getAllUsers);

// Get user statistics
router.get("/stats", UserController.getUserStats);

// Get user by ID
router.get("/:id", UserController.getUserById);

// Update user status
router.patch("/:id/status", UserController.updateUserStatus);

// Update user roles and permissions
router.patch("/:id/roles", UserController.updateUserRoles);

// Delete user
router.delete("/:id", UserController.deleteUser);

// Bulk update user status
router.patch("/bulk/status", UserController.bulkUpdateUserStatus);

export const UserRoute = router;
