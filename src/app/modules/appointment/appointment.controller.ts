import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Appointment } from "./appointment.model";
import { Patient } from "../patient/patient.model";
import { Doctor } from "../doctor/doctor.model";
import { Schedule } from "../schedule/schedule.model";
import { ScheduleController } from "../schedule/schedule.controller";
import { ScheduleGenerationService } from "../schedule/schedule-generation.service";
import sendResponse from "../../shared/sendResponse";
import CustomAPIError from "../../errors/custom-api";
import NotFoundError from "../../errors/not-found";
import ForbiddenError from "../../errors/forbidden";
import {
  ICreateAppointment,
  IUpdateAppointment,
  ICancelAppointment,
} from "./appointment.type";

// Create a new appointment
const createAppointment = async (req: Request, res: Response) => {
  const appointmentData: ICreateAppointment = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Check if doctor exists
  const doctor = await Doctor.findById(appointmentData.doctorId);
  if (!doctor) {
    throw new NotFoundError("Doctor not found");
  }

  // Check if user can create appointment
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");
  const isPatient = currentUser.roles.includes("patient");
  const isOwnAppointment =
    appointmentData.patientId === currentUser._id.toString();

  // Only patients can create appointments for themselves, or admins can create for anyone
  if (!isAdmin && (!isPatient || !isOwnAppointment)) {
    throw new ForbiddenError(
      "You can only create appointments for your own profile"
    );
  }

  // Find the patient record for the appointment
  let patient;
  if (isAdmin) {
    patient =
      (await Patient.findById(appointmentData.patientId)) ||
      (await Patient.findOne({ user: appointmentData.patientId }));
  } else {
    patient = await Patient.findOne({ user: appointmentData.patientId });
  }

  if (!patient) {
    throw new NotFoundError(
      "Patient profile not found. Please complete your profile first."
    );
  }

  // Normalize and validate the appointment date
  const appointmentDate = new Date(appointmentData.appointmentDate);
  appointmentDate.setHours(0, 0, 0, 0);

  // Validate date constraints
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (appointmentDate < today) {
    throw new CustomAPIError(
      "Cannot book appointments for past dates. Please select today or a future date.",
      StatusCodes.BAD_REQUEST
    );
  }

  const maxFutureDate = new Date(today);
  maxFutureDate.setDate(today.getDate() + 90); // 3 months ahead

  if (appointmentDate > maxFutureDate) {
    throw new CustomAPIError(
      "Cannot book appointments more than 3 months in advance. Please select a date within the next 3 months.",
      StatusCodes.BAD_REQUEST
    );
  }

  // Ensure schedules exist for the next week (hybrid approach)
  try {
    await ScheduleGenerationService.ensureFutureSchedules(
      appointmentData.doctorId
    );
  } catch (scheduleError) {
    console.error("Error ensuring future schedules:", scheduleError);
    // Continue with appointment creation - fallback to old method
  }

  // Find or create the schedule for this appointment
  let schedule = await Schedule.findByDoctorAndDate(
    appointmentData.doctorId,
    appointmentDate
  );

  if (!schedule) {
    try {
      console.log("Creating schedule for date:", appointmentDate.toISOString());

      schedule = await ScheduleController.createDefaultSchedule(
        appointmentData.doctorId,
        appointmentDate
      );

      console.log("Schedule created successfully with ID:", schedule._id);
    } catch (error) {
      console.error("Error creating schedule:", error);
      throw new CustomAPIError(
        `Failed to create schedule for ${appointmentDate.toDateString()}. Please try again or contact support.`,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }

    if (!schedule) {
      throw new CustomAPIError(
        `Failed to create schedule for ${appointmentDate.toDateString()}. Please try again or contact support.`,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }

  // NOW check slot availability (after schedule exists)
  const slotAvailability = await Appointment.checkSlotAvailability(
    appointmentData.doctorId,
    appointmentData.appointmentDate,
    appointmentData.startTime,
    appointmentData.endTime,
    undefined, // excludeAppointmentId (not needed for new appointments)
    patient._id.toString() // patientId for patient-specific validation
  );

  if (!slotAvailability.available) {
    throw new CustomAPIError(
      slotAvailability.reason || "Slot not available",
      StatusCodes.CONFLICT
    );
  }

  // Create appointment record
  const newAppointment = new Appointment({
    patient: patient._id,
    doctor: appointmentData.doctorId,
    schedule: schedule._id,
    appointmentDate: appointmentDate,
    startTime: appointmentData.startTime,
    endTime: appointmentData.endTime,
    type: appointmentData.type,
    reason: appointmentData.reason,
    symptoms: appointmentData.symptoms,
    notes: appointmentData.notes,
    isUrgent: appointmentData.isUrgent ?? false,
  });

  const savedAppointment = await newAppointment.save();

  // Update the schedule's currentAppointments count for the specific time slot
  try {
    const timeSlotIndex = schedule.timeSlots.findIndex(
      (slot) =>
        slot.startTime === appointmentData.startTime &&
        slot.endTime === appointmentData.endTime
    );

    if (timeSlotIndex !== -1) {
      schedule.timeSlots[timeSlotIndex].currentAppointments += 1;

      // Update slot availability based on current appointments
      schedule.updateSlotAvailability();

      await schedule.save();
      console.log(
        `Updated schedule slot ${appointmentData.startTime}-${appointmentData.endTime} count to ${schedule.timeSlots[timeSlotIndex].currentAppointments}, isAvailable: ${schedule.timeSlots[timeSlotIndex].isAvailable}`
      );
    }
  } catch (error) {
    console.error("Error updating schedule currentAppointments:", error);
    // Don't fail the appointment creation if schedule update fails
  }

  // Populate related data for response
  await savedAppointment.populate([
    { path: "patient", select: "firstName lastName phoneNumber" },
    {
      path: "doctor",
      select: "firstName lastName specialization consultationFee",
    },
    { path: "schedule", select: "date timeSlots isActive" },
  ]);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Appointment created successfully",
    data: savedAppointment,
  });
};

// Get all appointments (admin only)
const getAllAppointments = async (req: Request, res: Response) => {
  const {
    patientId,
    doctorId,
    status,
    type,
    dateFrom,
    dateTo,
    isUrgent,
    page = 1,
    limit = 10,
  } = req.query as any;
  const currentPage = Number(page);
  const pageSize = Number(limit);

  // Build filter object
  const filter: any = {};

  if (patientId) filter.patient = patientId;
  if (doctorId) filter.doctor = doctorId;
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (isUrgent !== undefined) filter.isUrgent = isUrgent === "true";

  // Calculate pagination
  const skip = (currentPage - 1) * pageSize;

  // Get appointments with pagination
  const appointments = await Appointment.find(filter)
    .populate({
      path: "patient",
      select: "firstName lastName phoneNumber user",
      populate: {
        path: "user",
        select: "email status",
      },
    })
    .populate({
      path: "doctor",
      select:
        "firstName lastName specialization isAvailable yearsOfExperience consultationFee user",
      populate: {
        path: "user",
        select: "email status",
      },
    })
    .sort({ appointmentDate: -1, startTime: -1 })
    .skip(skip)
    .limit(pageSize);

  // Get total count for pagination
  const totalAppointments = await Appointment.countDocuments(filter);
  const totalPages = Math.ceil(totalAppointments / pageSize);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointments retrieved successfully",
    meta: {
      currentPage,
      totalPages,
      totalAppointments,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    } as any,
    data: appointments,
  });
};

// Get appointment by ID
const getAppointmentById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const appointment = await Appointment.findById(id)
    .populate({
      path: "patient",
      select: "firstName lastName phoneNumber user",
      populate: {
        path: "user",
        select: "_id email status",
      },
    })
    .populate({
      path: "doctor",
      select: "firstName lastName specialization consultationFee user",
      populate: {
        path: "user",
        select: "_id email status",
      },
    })
    .populate("schedule", "date timeSlots isActive");

  if (!appointment) {
    throw new NotFoundError("Appointment not found");
  }

  // Check if user can access this appointment
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Allow access if user is admin, the patient, or the doctor
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");

  // Safely check patient and doctor ownership
  const isOwnPatient =
    appointment.patient?.user?._id.toString() === currentUser._id.toString();
  const isOwnDoctor =
    appointment.doctor?.user?._id.toString() === currentUser._id.toString();

  if (!isAdmin && !isOwnPatient && !isOwnDoctor) {
    throw new ForbiddenError("Access denied");
  }

  // Additional validation to ensure populated data is available
  if (!appointment.patient || !appointment.doctor) {
    throw new CustomAPIError(
      "Appointment data is incomplete. Please contact support.",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointment retrieved successfully",
    data: appointment,
  });
};

// Get current patient's appointments
const getMyAppointments = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Find patient profile
  const patient = await Patient.findOne({ user: currentUser._id });
  if (!patient) {
    throw new NotFoundError("Patient profile not found");
  }

  const {
    status,
    type,
    dateFrom,
    dateTo,
    page = 1,
    limit = 10,
  } = req.query as any;
  const currentPage = Number(page);
  const pageSize = Number(limit);

  // Build filter object
  const filter: any = { patient: patient._id };

  if (status) filter.status = status;
  if (type) filter.type = type;

  if (dateFrom || dateTo) {
    filter.appointmentDate = {};
    if (dateFrom) filter.appointmentDate.$gte = new Date(dateFrom);
    if (dateTo) filter.appointmentDate.$lte = new Date(dateTo);
  }

  // Calculate pagination
  const skip = (currentPage - 1) * pageSize;

  // Get appointments with pagination
  const appointments = await Appointment.find(filter)
    .populate("doctor", "firstName lastName specialization consultationFee")
    .sort({ appointmentDate: -1, startTime: -1 })
    .skip(skip)
    .limit(pageSize);

  // Get total count for pagination
  const totalAppointments = await Appointment.countDocuments(filter);
  const totalPages = Math.ceil(totalAppointments / pageSize);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointments retrieved successfully",
    meta: {
      currentPage,
      totalPages,
      totalAppointments,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    } as any,
    data: appointments,
  });
};

// Get current doctor's appointments
const getDoctorAppointments = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Find doctor profile
  const doctor = await Doctor.findOne({ user: currentUser._id });
  if (!doctor) {
    throw new NotFoundError("Doctor profile not found");
  }

  const {
    status,
    type,
    dateFrom,
    dateTo,
    page = 1,
    limit = 10,
  } = req.query as any;
  const currentPage = Number(page);
  const pageSize = Number(limit);

  // Build filter object
  const filter: any = { doctor: doctor._id };

  if (status) filter.status = status;
  if (type) filter.type = type;

  if (dateFrom || dateTo) {
    filter.appointmentDate = {};
    if (dateFrom) filter.appointmentDate.$gte = new Date(dateFrom);
    if (dateTo) filter.appointmentDate.$lte = new Date(dateTo);
  }

  // Calculate pagination
  const skip = (currentPage - 1) * pageSize;

  // Get appointments with pagination
  const appointments = await Appointment.find(filter)
    .populate({
      path: "patient",
      select: "firstName lastName phoneNumber user",
      populate: {
        path: "user",
        select: "email status",
      },
    })
    .sort({ appointmentDate: -1, startTime: -1 })
    .skip(skip)
    .limit(pageSize);

  // Get total count for pagination
  const totalAppointments = await Appointment.countDocuments(filter);
  const totalPages = Math.ceil(totalAppointments / pageSize);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointments retrieved successfully",
    meta: {
      currentPage,
      totalPages,
      totalAppointments,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    } as any,
    data: appointments,
  });
};

// Update appointment
const updateAppointment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData: IUpdateAppointment = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const appointment = await Appointment.findById(id)
    .populate("patient", "firstName lastName phoneNumber user")
    .populate(
      "doctor",
      "firstName lastName specialization consultationFee user"
    );

  if (!appointment) {
    throw new NotFoundError("Appointment not found");
  }

  // Check if user can update this appointment
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");

  // Safely check patient and doctor ownership
  const isOwnPatient =
    appointment.patient?.user?.toString() === currentUser._id.toString();
  const isOwnDoctor =
    appointment.doctor?.user?.toString() === currentUser._id.toString();

  if (!isAdmin && !isOwnPatient && !isOwnDoctor) {
    throw new ForbiddenError("You can only update your own appointments");
  }

  // Additional validation to ensure populated data is available
  if (!appointment.patient || !appointment.doctor) {
    throw new CustomAPIError(
      "Appointment data is incomplete. Please contact support.",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }

  // If updating time or date, check slot availability
  if (
    updateData.appointmentDate ||
    updateData.startTime ||
    updateData.endTime
  ) {
    const newDate =
      updateData.appointmentDate ||
      appointment.appointmentDate.toISOString().split("T")[0];
    const newStartTime = updateData.startTime || appointment.startTime;
    const newEndTime = updateData.endTime || appointment.endTime;

    const slotAvailability = await Appointment.checkSlotAvailability(
      appointment.doctor._id.toString(),
      newDate,
      newStartTime,
      newEndTime,
      id, // Exclude current appointment
      appointment.patient._id.toString() // patientId for patient-specific validation
    );

    if (!slotAvailability.available) {
      throw new CustomAPIError(
        slotAvailability.reason || "Slot not available",
        StatusCodes.CONFLICT
      );
    }
  }

  // Prepare update object
  const updateObject: any = {};

  if (updateData.appointmentDate)
    updateObject.appointmentDate = new Date(updateData.appointmentDate);
  if (updateData.startTime) updateObject.startTime = updateData.startTime;
  if (updateData.endTime) updateObject.endTime = updateData.endTime;
  if (updateData.status) updateObject.status = updateData.status;
  if (updateData.type) updateObject.type = updateData.type;
  if (updateData.reason !== undefined) updateObject.reason = updateData.reason;
  if (updateData.symptoms !== undefined)
    updateObject.symptoms = updateData.symptoms;
  if (updateData.notes !== undefined) updateObject.notes = updateData.notes;
  if (updateData.isUrgent !== undefined)
    updateObject.isUrgent = updateData.isUrgent;
  if (updateData.paymentStatus !== undefined)
    updateObject.paymentStatus = updateData.paymentStatus;
  if (updateData.diagnosis !== undefined)
    updateObject.diagnosis = updateData.diagnosis;
  if (updateData.prescription !== undefined)
    updateObject.prescription = updateData.prescription;

  const updatedAppointment = await Appointment.findByIdAndUpdate(
    id,
    updateObject,
    {
      new: true,
      runValidators: true,
    }
  ).populate([
    { path: "patient", select: "firstName lastName phoneNumber" },
    { path: "doctor", select: "firstName lastName specialization" },
  ]);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointment updated successfully",
    data: updatedAppointment,
  });
};

// Cancel appointment
const cancelAppointment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const cancelData: ICancelAppointment = req.body;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const appointment = await Appointment.findById(id)
    .populate("patient", "firstName lastName phoneNumber user")
    .populate(
      "doctor",
      "firstName lastName specialization consultationFee user"
    );

  if (!appointment) {
    throw new NotFoundError("Appointment not found");
  }

  // Check if user can cancel this appointment
  const isAdmin =
    currentUser.roles.includes("admin") ||
    currentUser.roles.includes("superadmin");

  // Safely check patient and doctor ownership
  const isOwnPatient =
    appointment.patient?.user?.toString() === currentUser._id.toString();
  const isOwnDoctor =
    appointment.doctor?.user?.toString() === currentUser._id.toString();

  if (!isAdmin && !isOwnPatient && !isOwnDoctor) {
    throw new ForbiddenError("You can only cancel your own appointments");
  }

  // Additional validation to ensure populated data is available
  if (!appointment.patient || !appointment.doctor) {
    throw new CustomAPIError(
      "Appointment data is incomplete. Please contact support.",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }

  // Check if appointment can be cancelled
  if (appointment.status === "cancelled") {
    throw new CustomAPIError(
      "Appointment is already cancelled",
      StatusCodes.BAD_REQUEST
    );
  }

  if (appointment.status === "completed") {
    throw new CustomAPIError(
      "Cannot cancel completed appointment",
      StatusCodes.BAD_REQUEST
    );
  }

  // Update appointment status
  const updatedAppointment = await Appointment.findByIdAndUpdate(
    id,
    {
      status: "cancelled",
      cancellationReason: cancelData.cancellationReason,
      cancelledBy: cancelData.cancelledBy,
      cancelledAt: new Date(),
    },
    { new: true }
  ).populate([
    { path: "patient", select: "firstName lastName phoneNumber" },
    { path: "doctor", select: "firstName lastName specialization" },
    { path: "schedule", select: "date timeSlots isActive" },
  ]);

  // Update the schedule's currentAppointments count for the specific time slot
  try {
    if (updatedAppointment && updatedAppointment.schedule) {
      const schedule = await Schedule.findById(updatedAppointment.schedule._id);
      if (schedule) {
        const timeSlotIndex = schedule.timeSlots.findIndex(
          (slot) =>
            slot.startTime === appointment.startTime &&
            slot.endTime === appointment.endTime
        );

        if (
          timeSlotIndex !== -1 &&
          schedule.timeSlots[timeSlotIndex].currentAppointments > 0
        ) {
          schedule.timeSlots[timeSlotIndex].currentAppointments -= 1;

          // Update slot availability based on current appointments
          schedule.updateSlotAvailability();

          await schedule.save();
          console.log(
            `Updated schedule slot ${appointment.startTime}-${appointment.endTime} count to ${schedule.timeSlots[timeSlotIndex].currentAppointments}, isAvailable: ${schedule.timeSlots[timeSlotIndex].isAvailable} after cancellation`
          );
        }
      }
    }
  } catch (error) {
    console.error(
      "Error updating schedule currentAppointments after cancellation:",
      error
    );
    // Don't fail the cancellation if schedule update fails
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointment cancelled successfully",
    data: updatedAppointment,
  });
};

// Delete appointment (admin only)
const deleteAppointment = async (req: Request, res: Response) => {
  const { id } = req.params;

  const appointment = await Appointment.findById(id).populate("schedule");
  if (!appointment) {
    throw new NotFoundError("Appointment not found");
  }

  // Update the schedule's currentAppointments count before deleting
  try {
    if (appointment.schedule) {
      const schedule = await Schedule.findById(appointment.schedule._id);
      if (schedule) {
        const timeSlotIndex = schedule.timeSlots.findIndex(
          (slot) =>
            slot.startTime === appointment.startTime &&
            slot.endTime === appointment.endTime
        );

        if (
          timeSlotIndex !== -1 &&
          schedule.timeSlots[timeSlotIndex].currentAppointments > 0
        ) {
          schedule.timeSlots[timeSlotIndex].currentAppointments -= 1;

          // Update slot availability based on current appointments
          schedule.updateSlotAvailability();

          await schedule.save();
          console.log(
            `Updated schedule slot ${appointment.startTime}-${appointment.endTime} count to ${schedule.timeSlots[timeSlotIndex].currentAppointments}, isAvailable: ${schedule.timeSlots[timeSlotIndex].isAvailable} after deletion`
          );
        }
      }
    }
  } catch (error) {
    console.error(
      "Error updating schedule currentAppointments after deletion:",
      error
    );
    // Don't fail the deletion if schedule update fails
  }

  await Appointment.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointment deleted successfully",
    data: null,
  });
};

// Get patient's appointments for a specific date
const getPatientAppointmentsForDate = async (req: Request, res: Response) => {
  const { date } = req.params;
  const currentUser = req.user;

  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  // Find patient profile
  const patient = await Patient.findOne({ user: currentUser._id });
  if (!patient) {
    throw new NotFoundError("Patient profile not found");
  }

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  // Get patient's appointments for the specific date
  const appointments = await Appointment.find({
    patient: patient._id,
    appointmentDate: targetDate,
    status: { $in: ["scheduled", "confirmed", "in_progress"] },
  })
    .populate("doctor", "firstName lastName specialization consultationFee")
    .select("appointmentDate startTime endTime status type reason doctor")
    .sort({ startTime: 1 });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Patient appointments for date retrieved successfully",
    data: {
      date,
      appointments: appointments.map((apt) => ({
        id: apt._id,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.status,
        type: apt.type,
        reason: apt.reason,
        doctor: {
          id: apt.doctor._id,
          name: `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}`,
          specialization: apt.doctor.specialization,
          consultationFee: apt.doctor.consultationFee,
        },
      })),
    },
  });
};

// Get appointment statistics
const getAppointmentStats = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const { doctorId, patientId, dateFrom, dateTo } = req.query as any;

  // Determine the appropriate filter based on user role
  let filterPatientId = patientId;
  let filterDoctorId = doctorId;

  // If user is a patient, they can only see their own stats
  if (currentUser.roles.includes("patient")) {
    // Find patient profile
    const patient = await Patient.findOne({ user: currentUser._id });
    if (!patient) {
      throw new NotFoundError("Patient profile not found");
    }
    filterPatientId = patient._id.toString();
  }
  // If user is a doctor, they can only see their own stats
  else if (currentUser.roles.includes("doctor")) {
    // Find doctor profile
    const doctor = await Doctor.findOne({ user: currentUser._id });
    if (!doctor) {
      throw new NotFoundError("Doctor profile not found");
    }
    filterDoctorId = doctor._id.toString();
  }
  // Admin users can see any stats (no additional filtering)

  const stats = await Appointment.getAppointmentStats(
    filterDoctorId,
    filterPatientId,
    dateFrom ? new Date(dateFrom) : undefined,
    dateTo ? new Date(dateTo) : undefined
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appointment statistics retrieved successfully",
    data: stats,
  });
};

export const AppointmentController = {
  createAppointment,
  getAllAppointments,
  getAppointmentById,
  getMyAppointments,
  getDoctorAppointments,
  updateAppointment,
  cancelAppointment,
  deleteAppointment,
  getPatientAppointmentsForDate,
  getAppointmentStats,
};
