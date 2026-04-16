import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { User } from "./user.model";
import { Patient } from "../patient/patient.model";
import { Doctor } from "../doctor/doctor.model";
import sendResponse from "../../shared/sendResponse";
import CustomAPIError from "../../errors/custom-api";
import NotFoundError from "../../errors/not-found";
import ForbiddenError from "../../errors/forbidden";

// Get all users (admin only)
const getAllUsers = async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    roles,
    auth_type,
  } = req.query as any;

  // Build filter object
  const filter: any = {};

  if (search) {
    filter.$or = [{ email: { $regex: search, $options: "i" } }];
  }

  if (status) {
    filter.status = status;
  }

  if (roles) {
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    filter.roles = { $in: rolesArray };
  }

  if (auth_type) {
    filter.auth_type = auth_type;
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get users with pagination
  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select("-password");

  // Get total count for pagination
  const totalUsers = await User.countDocuments(filter);
  const totalPages = Math.ceil(totalUsers / limit);

  // Populate profile information for each user
  const usersWithProfiles = await Promise.all(
    users.map(async (user) => {
      let profile = null;

      // Try to find patient profile
      const patient = await Patient.findOne({ user: user._id });
      if (patient) {
        profile = {
          type: "patient",
          ...patient.toObject(),
        };
      } else {
        // Try to find doctor profile
        const doctor = await Doctor.findOne({ user: user._id });
        if (doctor) {
          profile = {
            type: "doctor",
            ...doctor.toObject(),
          };
        }
      }

      return {
        ...user.toObject(),
        profile,
      };
    })
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Users retrieved successfully",
    data: {
      users: usersWithProfiles,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
  });
};

// Get user by ID (admin only)
const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findById(id).select("-password");
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Find profile information
  let profile = null;

  // Try to find patient profile
  const patient = await Patient.findOne({ user: user._id });
  if (patient) {
    profile = {
      type: "patient",
      ...patient.toObject(),
    };
  } else {
    // Try to find doctor profile
    const doctor = await Doctor.findOne({ user: user._id });
    if (doctor) {
      profile = {
        type: "doctor",
        ...doctor.toObject(),
      };
    }
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User retrieved successfully",
    data: {
      ...user.toObject(),
      profile,
    },
  });
};

// Update user status (admin only)
const updateUserStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, reason } = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Check if current user is admin
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  if (!isAdmin) {
    throw new ForbiddenError("Only admins can update user status");
  }

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Validate status
  const validStatuses = ["pending", "approved", "blocked", "declined", "hold"];
  if (!validStatuses.includes(status)) {
    throw new CustomAPIError("Invalid status", StatusCodes.BAD_REQUEST);
  }

  // Update user status
  user.status = status;
  await user.save();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User status updated successfully",
    data: {
      ...user.toObject(),
      password: undefined,
    },
  });
};

// Update user roles and permissions (admin only)
const updateUserRoles = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { roles, permissions } = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Check if current user is admin
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  if (!isAdmin) {
    throw new ForbiddenError("Only admins can update user roles");
  }

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Validate roles
  const validRoles = ["patient", "doctor", "admin", "superadmin"];
  if (roles && !roles.every((role: string) => validRoles.includes(role))) {
    throw new CustomAPIError("Invalid role", StatusCodes.BAD_REQUEST);
  }

  // Update user roles and permissions
  if (roles) {
    user.roles = roles;
  }
  if (permissions !== undefined) {
    user.permissions = permissions || [];
  }

  await user.save();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User roles updated successfully",
    data: {
      ...user.toObject(),
      password: undefined,
    },
  });
};

// Delete user (admin only)
const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Check if current user is admin
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  if (!isAdmin) {
    throw new ForbiddenError("Only admins can delete users");
  }

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Prevent self-deletion
  if (user._id.toString() === currentUser._id.toString()) {
    throw new CustomAPIError(
      "Cannot delete your own account",
      StatusCodes.FORBIDDEN
    );
  }

  // Delete associated profile records
  await Patient.findOneAndDelete({ user: user._id });
  await Doctor.findOneAndDelete({ user: user._id });

  // Delete user
  await User.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User deleted successfully",
    data: null,
  });
};

// Get user statistics (admin only)
const getUserStats = async (req: Request, res: Response) => {
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Check if current user is admin
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  if (!isAdmin) {
    throw new ForbiddenError("Only admins can view user statistics");
  }

  // Get user statistics
  const totalUsers = await User.countDocuments();
  const totalPatients = await Patient.countDocuments();
  const totalDoctors = await Doctor.countDocuments();
  const activeUsers = await User.countDocuments({ status: "approved" });
  const pendingUsers = await User.countDocuments({ status: "pending" });
  const blockedUsers = await User.countDocuments({ status: "blocked" });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User statistics retrieved successfully",
    data: {
      totalUsers,
      totalPatients,
      totalDoctors,
      activeUsers,
      pendingUsers,
      blockedUsers,
    },
  });
};

// Bulk update user status (admin only)
const bulkUpdateUserStatus = async (req: Request, res: Response) => {
  const { userIds, status, reason } = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Check if current user is admin
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  if (!isAdmin) {
    throw new ForbiddenError("Only admins can bulk update user status");
  }

  // Validate status
  const validStatuses = ["pending", "approved", "blocked", "declined", "hold"];
  if (!validStatuses.includes(status)) {
    throw new CustomAPIError("Invalid status", StatusCodes.BAD_REQUEST);
  }

  // Update multiple users
  const result = await User.updateMany({ _id: { $in: userIds } }, { status });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: `${result.modifiedCount} users updated successfully`,
    data: {
      modifiedCount: result.modifiedCount,
    },
  });
};

export const UserController = {
  getAllUsers,
  getUserById,
  updateUserStatus,
  updateUserRoles,
  deleteUser,
  getUserStats,
  bulkUpdateUserStatus,
};
