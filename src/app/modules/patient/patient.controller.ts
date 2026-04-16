import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Patient } from "./patient.model";
import { User } from "../user/user.model";
import sendResponse from "../../shared/sendResponse";
import CustomAPIError from "../../errors/custom-api";
import NotFoundError from "../../errors/not-found";
import ForbiddenError from "../../errors/forbidden";
import { ICreatePatient, IUpdatePatient } from "./patient.type";

// Register a new patient (creates both user and patient records)
const registerPatient = async (req: Request, res: Response) => {
  const patientData: ICreatePatient = req.body;

  // Check if user with email already exists
  const existingUser = await User.getUser(patientData.email);
  if (existingUser) {
    throw new CustomAPIError(
      "Email address already taken",
      StatusCodes.CONFLICT
    );
  }

  // Create user account with approved status by default
  const newUser = new User({
    email: patientData.email,
    password: patientData.password,
    roles: ["patient"],
    status: "approved", // Auto-approved for patients
    auth_type: "standard",
  });

  const savedUser = await newUser.save();

  // Create patient record
  const newPatient = new Patient({
    user: savedUser._id,
    firstName: patientData.firstName,
    lastName: patientData.lastName,
    dateOfBirth: new Date(patientData.dateOfBirth),
    gender: patientData.gender,
    phoneNumber: patientData.phoneNumber,
    bloodGroup: patientData.bloodGroup,
  });

  const savedPatient = await newPatient.save();

  // Populate user data for response
  await savedPatient.populate("user", "email roles status createdAt");

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Patient registered successfully",
    data: savedPatient,
  });
};

// Get all patients (admin only)
const getAllPatients = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, gender, bloodGroup } = req.query as any;

  // Build filter object
  const filter: any = {};

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
    ];
  }

  if (gender) {
    filter.gender = gender;
  }

  if (bloodGroup) {
    filter.bloodGroup = bloodGroup;
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get patients with pagination
  const patients = await Patient.find(filter)
    .populate("user", "email roles status createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count for pagination
  const totalPatients = await Patient.countDocuments(filter);
  const totalPages = Math.ceil(totalPatients / limit);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Patients retrieved successfully",
    data: {
      patients,
      pagination: {
        currentPage: page,
        totalPages,
        totalPatients,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
  });
};

// Get patient by ID
const getPatientById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const patient = await Patient.findById(id).populate(
    "user",
    "email roles status createdAt"
  );

  if (!patient) {
    throw new NotFoundError("Patient not found");
  }

  // Check if user can access this patient's data
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Allow access if user is admin or the patient themselves
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  const isOwnProfile =
    patient.user._id.toString() === currentUser._id.toString();

  if (!isAdmin && !isOwnProfile) {
    throw new ForbiddenError("Access denied");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Patient retrieved successfully",
    data: patient,
  });
};

// Get current patient's profile
const getMyProfile = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const patient = await Patient.findOne({ user: currentUser._id }).populate(
    "user",
    "email roles status createdAt"
  );

  if (!patient) {
    throw new NotFoundError("Patient profile not found");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Profile retrieved successfully",
    data: patient,
  });
};

// Update current patient's profile
const updateMyProfile = async (req: Request, res: Response) => {
  const updateData: IUpdatePatient = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Find patient by current user ID
  const patient = await Patient.findOne({ user: currentUser._id });
  if (!patient) {
    throw new NotFoundError("Patient profile not found");
  }

  // Prepare update object
  const updateObject: any = {};

  if (updateData.firstName) updateObject.firstName = updateData.firstName;
  if (updateData.lastName) updateObject.lastName = updateData.lastName;
  if (updateData.dateOfBirth)
    updateObject.dateOfBirth = new Date(updateData.dateOfBirth);
  if (updateData.gender) updateObject.gender = updateData.gender;
  if (updateData.phoneNumber) updateObject.phoneNumber = updateData.phoneNumber;
  if (updateData.bloodGroup) updateObject.bloodGroup = updateData.bloodGroup;

  const updatedPatient = await Patient.findByIdAndUpdate(
    patient._id,
    updateObject,
    {
      new: true,
      runValidators: true,
    }
  ).populate("user", "email roles status createdAt");

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Profile updated successfully",
    data: updatedPatient,
  });
};

// Update patient profile (admin can update any patient)
const updatePatient = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData: IUpdatePatient = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const patient = await Patient.findById(id);
  if (!patient) {
    throw new NotFoundError("Patient not found");
  }

  // Check if user can update this patient's data (admin only)
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");

  if (!isAdmin) {
    throw new ForbiddenError("Only admins can update other patients");
  }

  // Prepare update object
  const updateObject: any = {};

  if (updateData.firstName) updateObject.firstName = updateData.firstName;
  if (updateData.lastName) updateObject.lastName = updateData.lastName;
  if (updateData.dateOfBirth)
    updateObject.dateOfBirth = new Date(updateData.dateOfBirth);
  if (updateData.gender) updateObject.gender = updateData.gender;
  if (updateData.phoneNumber) updateObject.phoneNumber = updateData.phoneNumber;
  if (updateData.bloodGroup) updateObject.bloodGroup = updateData.bloodGroup;

  const updatedPatient = await Patient.findByIdAndUpdate(id, updateObject, {
    new: true,
    runValidators: true,
  }).populate("user", "email roles status createdAt");

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Patient updated successfully",
    data: updatedPatient,
  });
};

// Delete patient (admin only)
const deletePatient = async (req: Request, res: Response) => {
  const { id } = req.params;

  const patient = await Patient.findById(id);
  if (!patient) {
    throw new NotFoundError("Patient not found");
  }

  // Delete patient record
  await Patient.findByIdAndDelete(id);

  // Delete associated user account
  await User.findByIdAndDelete(patient.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Patient deleted successfully",
    data: null,
  });
};

export const PatientController = {
  registerPatient,
  getAllPatients,
  getPatientById,
  getMyProfile,
  updateMyProfile,
  updatePatient,
  deletePatient,
};
