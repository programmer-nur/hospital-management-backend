import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import { Doctor } from "./doctor.model";
import { User } from "../user/user.model";
import { ScheduleController } from "../schedule/schedule.controller";
import { ScheduleGenerationService } from "../schedule/schedule-generation.service";
import sendResponse from "../../shared/sendResponse";
import CustomAPIError from "../../errors/custom-api";
import NotFoundError from "../../errors/not-found";
import ForbiddenError from "../../errors/forbidden";
import { ICreateDoctor, IUpdateDoctor } from "./doctor.type";

// Create a new doctor (admin only)
const createDoctor = async (req: Request, res: Response) => {
  const doctorData: ICreateDoctor = req.body;

  // Check if user with email already exists
  const existingUser = await User.getUser(doctorData.email);
  if (existingUser) {
    throw new CustomAPIError(
      "Email address already taken",
      StatusCodes.CONFLICT
    );
  }

  // Start database transaction
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // Create user account with approved status by default
    const newUser = new User({
      email: doctorData.email,
      password: doctorData.password,
      roles: ["doctor"],
      status: "approved", // Auto-approved for doctors
      auth_type: "standard",
    });

    const savedUser = await newUser.save({ session });

    // Create doctor record
    const newDoctor = new Doctor({
      user: savedUser._id,
      firstName: doctorData.firstName,
      lastName: doctorData.lastName,
      dateOfBirth: new Date(doctorData.dateOfBirth),
      gender: doctorData.gender,
      phoneNumber: doctorData.phoneNumber,
      specialization: doctorData.specialization,
      yearsOfExperience: doctorData.yearsOfExperience,
      bio: doctorData.bio,
      consultationFee: doctorData.consultationFee,
      isAvailable:
        doctorData.isAvailable !== undefined ? doctorData.isAvailable : true,
    });

    const savedDoctor = await newDoctor.save({ session });

    // Generate initial schedules for the new doctor (next 30 days)
    try {
      await ScheduleGenerationService.generateInitialSchedules(
        savedDoctor._id.toString()
      );
      console.log(
        `Generated initial schedules for new doctor: ${savedDoctor._id}`
      );
    } catch (scheduleError) {
      console.error("Error generating initial schedules:", scheduleError);
      // Don't fail doctor creation if schedule generation fails
      // Schedules can be created later when appointments are booked
    }

    // Commit the transaction
    await session.commitTransaction();

    // Populate user data for response
    await savedDoctor.populate("user", "email roles status createdAt");

    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: "Doctor created successfully with default schedule",
      data: savedDoctor,
    });
  } catch (error) {
    // Rollback the transaction on error
    await session.abortTransaction();
    throw error;
  } finally {
    // End the session
    await session.endSession();
  }
};

// Get all doctors (admin only)
const getAllDoctors = async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    search,
    specialization,
    isAvailable,
  } = req.query as any;
  const currentPage = Number(page);
  const pageSize = Number(limit);

  // Build filter object
  const filter: any = {};

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
    ];
  }

  if (specialization) {
    filter.specialization = specialization;
  }

  if (isAvailable !== undefined) {
    filter.isAvailable = isAvailable === "true";
  }

  // Calculate pagination
  const skip = (currentPage - 1) * pageSize;

  // Get doctors with pagination
  const doctors = await Doctor.find(filter)
    .populate("user", "email roles status createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize);

  // Get total count for pagination
  const totalDoctors = await Doctor.countDocuments(filter);
  const totalPages = Math.ceil(totalDoctors / pageSize);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Doctors retrieved successfully",
    meta: {
      currentPage,
      totalPages,
      totalDoctors,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    } as any,
    data: doctors,
  });
};

// Get doctor by ID
const getDoctorById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const doctor = await Doctor.findById(id).populate(
    "user",
    "email roles status createdAt"
  );

  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Check if user can access this doctor's data
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Allow access if user is admin or the doctor themselves
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  const isOwnProfile =
    doctor.user._id.toString() === currentUser._id.toString();

  if (!isAdmin && !isOwnProfile) {
    throw new ForbiddenError("Access denied");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Doctor retrieved successfully",
    data: doctor,
  });
};

// Get current doctor's profile
const getMyProfile = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const doctor = await Doctor.findOne({ user: currentUser._id }).populate(
    "user",
    "email roles status createdAt"
  );

  if (!doctor) {
    throw new NotFoundError("Doctor profile not found");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Profile retrieved successfully",
    data: doctor,
  });
};

// Update doctor profile (doctors can update their own info)
const updateDoctor = async (req: Request, res: Response) => {
  const updateData: IUpdateDoctor = req.body;
  const currentUser = req.user;
  const id = req.params.id;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const doctor = await Doctor.findById(id);
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Check if user can update this doctor's data
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  const isOwnProfile = doctor.user.toString() === currentUser._id.toString();

  if (!isAdmin && !isOwnProfile) {
    throw new ForbiddenError("You can only update your own profile");
  }

  // Prepare update object
  const updateObject: any = {};

  if (updateData.firstName) updateObject.firstName = updateData.firstName;
  if (updateData.lastName) updateObject.lastName = updateData.lastName;
  if (updateData.dateOfBirth)
    updateObject.dateOfBirth = new Date(updateData.dateOfBirth);
  if (updateData.gender) updateObject.gender = updateData.gender;
  if (updateData.phoneNumber) updateObject.phoneNumber = updateData.phoneNumber;
  if (updateData.specialization)
    updateObject.specialization = updateData.specialization;
  if (updateData.yearsOfExperience !== undefined)
    updateObject.yearsOfExperience = updateData.yearsOfExperience;
  if (updateData.bio !== undefined) updateObject.bio = updateData.bio;
  if (updateData.consultationFee !== undefined)
    updateObject.consultationFee = updateData.consultationFee;
  if (updateData.isAvailable !== undefined)
    updateObject.isAvailable = updateData.isAvailable;

  const updatedDoctor = await Doctor.findByIdAndUpdate(
    doctor._id,
    updateObject,
    {
      new: true,
      runValidators: true,
    }
  ).populate("user", "email roles status createdAt");

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Doctor updated successfully",
    data: updatedDoctor,
  });
};

// Delete doctor (admin only)
const deleteDoctor = async (req: Request, res: Response) => {
  const { id } = req.params;

  const doctor = await Doctor.findById(id);
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Delete doctor record
  await Doctor.findByIdAndDelete(id);

  // Delete associated user account
  await User.findByIdAndDelete(doctor.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Doctor deleted successfully",
    data: null,
  });
};

// Get doctors by specialization (public endpoint for booking)
const getDoctorsBySpecialization = async (req: Request, res: Response) => {
  const { specialization } = req.params;
  const { page = 1, limit = 10 } = req.query as any;
  const currentPage = Number(page);
  const pageSize = Number(limit);

  const validSpecializations = [
    "cardiology",
    "dermatology",
    "endocrinology",
    "gastroenterology",
    "general_medicine",
    "neurology",
    "oncology",
    "orthopedics",
    "pediatrics",
    "psychiatry",
    "radiology",
    "surgery",
    "urology",
    "other",
  ];

  if (!validSpecializations.includes(specialization)) {
    throw new CustomAPIError("Invalid specialization", StatusCodes.BAD_REQUEST);
  }

  // Calculate pagination
  const skip = (currentPage - 1) * pageSize;

  // Get available doctors by specialization
  const doctors = await Doctor.find({
    specialization,
    isAvailable: true,
  })
    .populate("user", "email roles status createdAt")
    .sort({ yearsOfExperience: -1 })
    .skip(skip)
    .limit(pageSize);

  // Get total count for pagination
  const totalDoctors = await Doctor.countDocuments({
    specialization,
    isAvailable: true,
  });
  const totalPages = Math.ceil(totalDoctors / pageSize);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Doctors retrieved successfully",
    meta: {
      currentPage,
      totalPages,
      totalDoctors,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    } as any,
    data: doctors,
  });
};

// Get doctor dashboard statistics
const getDoctorDashboardStats = async (req: Request, res: Response) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      throw new ForbiddenError("Access denied");
    }

    const doctor = await Doctor.findOne({ user: currentUser._id });
    if (!doctor) {
      throw new NotFoundError("Doctor not found");
    }
    const doctorId = doctor._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Import models here to avoid circular dependency
    const { Appointment } = await import("../appointment/appointment.model");
    const { Patient } = await import("../patient/patient.model");

    const [
      totalAppointments,
      todayAppointments,
      upcomingAppointments,
      completedAppointments,
      cancelledAppointments,
      weeklyAppointments,
      monthlyAppointments,
      uniquePatients,
      recentAppointments,
      appointmentTrends,
    ] = await Promise.all([
      // Total appointments for this doctor
      Appointment.countDocuments({ doctor: doctorId }),

      // Today's appointments
      Appointment.countDocuments({
        doctor: doctorId,
        appointmentDate: { $gte: today, $lt: tomorrow },
        status: { $in: ["scheduled", "confirmed", "in_progress"] },
      }),

      // Upcoming appointments (next 7 days)
      Appointment.countDocuments({
        doctor: doctorId,
        appointmentDate: {
          $gte: tomorrow,
          $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        status: { $in: ["scheduled", "confirmed"] },
      }),

      // Completed appointments
      Appointment.countDocuments({
        doctor: doctorId,
        status: "completed",
      }),

      // Cancelled appointments
      Appointment.countDocuments({
        doctor: doctorId,
        status: { $in: ["cancelled", "no_show"] },
      }),

      // Weekly appointments
      Appointment.countDocuments({
        doctor: doctorId,
        appointmentDate: { $gte: weekStart },
        status: { $in: ["scheduled", "confirmed", "in_progress", "completed"] },
      }),

      // Monthly appointments
      Appointment.countDocuments({
        doctor: doctorId,
        appointmentDate: { $gte: monthStart },
        status: { $in: ["scheduled", "confirmed", "in_progress", "completed"] },
      }),

      // Unique patients count
      Appointment.distinct("patient", { doctor: doctorId }).then(
        (patients: any[]) => patients.length
      ),

      // Recent appointments (last 5)
      Appointment.find({ doctor: doctorId })
        .populate("patient", "firstName lastName phoneNumber user")
        .populate({
          path: "patient",
          populate: {
            path: "user",
            select: "email",
          },
        })
        .sort({ appointmentDate: -1, startTime: -1 })
        .limit(5)
        .lean(),

      // Appointment trends for the last 30 days
      Appointment.aggregate([
        {
          $match: {
            doctor: doctorId,
            appointmentDate: {
              $gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$appointmentDate",
              },
            },
            count: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
              },
            },
            cancelled: {
              $sum: {
                $cond: [{ $in: ["$status", ["cancelled", "no_show"]] }, 1, 0],
              },
            },
          },
        },
        {
          $sort: { _id: 1 },
        },
        {
          $limit: 30,
        },
      ]),
    ]);

    // Calculate completion rate
    const completionRate =
      totalAppointments > 0
        ? Math.round((completedAppointments / totalAppointments) * 100)
        : 0;

    // Calculate cancellation rate
    const cancellationRate =
      totalAppointments > 0
        ? Math.round((cancelledAppointments / totalAppointments) * 100)
        : 0;

    const stats = {
      overview: {
        totalAppointments,
        todayAppointments,
        upcomingAppointments,
        completedAppointments,
        cancelledAppointments,
        uniquePatients,
        completionRate,
        cancellationRate,
      },
      trends: {
        weekly: weeklyAppointments,
        monthly: monthlyAppointments,
        dailyTrends: appointmentTrends,
      },
      recentAppointments,
    };

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Doctor dashboard statistics retrieved successfully",
      data: stats,
    });
  } catch (error: any) {
    sendResponse(res, {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      success: false,
      message: "Failed to retrieve doctor dashboard statistics",
      data: null,
    });
  }
};

export const DoctorController = {
  createDoctor,
  getAllDoctors,
  getDoctorById,
  getMyProfile,
  updateDoctor,
  deleteDoctor,
  getDoctorsBySpecialization,
  getDoctorDashboardStats,
};
