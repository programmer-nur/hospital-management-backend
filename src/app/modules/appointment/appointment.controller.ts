import mongoose, { ClientSession } from "mongoose";
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
import { toUtcDayStart, utcToday, toUtcDateKey } from "../../shared/date";
import {
  queueNotification,
  cancelPendingForAppointment,
} from "../notification/notification.service";
import { NotificationTemplate } from "../notification/notification.type";
import { User } from "../user/user.model";
import momentTz from "moment-timezone";
import config from "../../config";

// Create a new appointment
/**
 * Move a slot's booked count by `delta` inside the caller's transaction.
 *
 * The counter is denormalised onto the schedule, so it only stays truthful if
 * it moves in the same transaction as the appointment that caused the move.
 * Previously each call site saved the appointment first and then updated the
 * counter in a try/catch that swallowed failures — a failed counter update
 * left a booked appointment whose capacity was never consumed, so the slot
 * could be booked again beyond its limit.
 *
 * Clamped at zero: a double-decrement should not drive capacity negative.
 */
async function applySlotDelta(
  scheduleId: any,
  startTime: string,
  endTime: string,
  delta: number,
  session: ClientSession
): Promise<void> {
  const schedule = await Schedule.findById(scheduleId).session(session);
  if (!schedule) return;

  const index = schedule.timeSlots.findIndex(
    (slot: any) => slot.startTime === startTime && slot.endTime === endTime
  );
  if (index === -1) return;

  const next = schedule.timeSlots[index].currentAppointments + delta;
  schedule.timeSlots[index].currentAppointments = Math.max(0, next);
  schedule.updateSlotAvailability();

  await schedule.save({ session });
}

/**
 * Resolve a patient's email address.
 *
 * Call sites populate `patient.user` inconsistently — sometimes as an id,
 * sometimes as a document — so this normalises both rather than depending on
 * the caller's populate shape. Getting this wrong makes the notification hooks
 * silently no-op, which is indistinguishable from working.
 */
async function resolveRecipient(
  patient: any
): Promise<{ userId: any; email: string } | null> {
  const user = patient?.user;
  if (!user) return null;

  if (typeof user === "object" && user.email) {
    return { userId: user._id ?? user, email: user.email };
  }

  const doc = await User.findById(user).select("_id email");
  return doc?.email ? { userId: doc._id, email: doc.email } : null;
}

/**
 * Queue the confirmation and the two reminders for a new appointment.
 *
 * Runs after the booking transaction has committed and never throws into the
 * request path: a reminder that cannot be queued must not fail a booking that
 * already succeeded. Reminders in the past are skipped, so booking for later
 * today does not immediately fire a "tomorrow" reminder.
 */
async function queueAppointmentNotifications(
  appointment: any,
  patient: any
): Promise<void> {
  try {
    const recipient = await resolveRecipient(patient);
    if (!recipient) return;

    const doctor = appointment.doctor;
    const payload = {
      patientName: `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim(),
      doctorName: doctor?.firstName
        ? `Dr. ${doctor.firstName} ${doctor.lastName}`
        : undefined,
      specialization: doctor?.specialization,
      appointmentDate: toUtcDateKey(appointment.appointmentDate),
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      reason: appointment.reason,
    };

    const base = {
      recipient: recipient.userId,
      recipientAddress: recipient.email,
      payload,
      appointment: appointment._id,
    };

    // `startTime` is a naive "HH:MM" with no zone, so it only becomes a real
    // instant once interpreted in the clinic's timezone. Treating it as UTC
    // shifts every reminder by the clinic's offset — for a UTC+6 clinic the
    // "2 hours before" reminder landed four hours *after* the appointment.
    const startsAt = momentTz
      .tz(
        `${toUtcDateKey(appointment.appointmentDate)} ${appointment.startTime}`,
        "YYYY-MM-DD HH:mm",
        config.clinic_timezone
      )
      .toDate();

    const now = new Date();
    const reminders: Array<[NotificationTemplate, Date]> = [
      ["appointment_reminder_24h", new Date(startsAt.getTime() - 24 * 3600_000)],
      ["appointment_reminder_2h", new Date(startsAt.getTime() - 2 * 3600_000)],
    ];

    await queueNotification({
      ...base,
      template: "appointment_confirmation",
      scheduledFor: now,
    });

    for (const [template, when] of reminders) {
      if (when <= now) continue;
      await queueNotification({ ...base, template, scheduledFor: when });
    }
  } catch (error: any) {
    console.error(
      "[notifications] failed to queue for appointment:",
      error?.message
    );
  }
}

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
  const appointmentDate = toUtcDayStart(appointmentData.appointmentDate);

  // Validate date constraints
  const today = utcToday();

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

  // The appointment and the slot counter must move together. If the counter
  // cannot be updated the booking must not stand, or the slot is consumed in
  // name only and can be overbooked.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await newAppointment.save({ session });
      await applySlotDelta(
        schedule!._id,
        appointmentData.startTime,
        appointmentData.endTime,
        1,
        session
      );
    });
  } finally {
    await session.endSession();
  }

  const savedAppointment = newAppointment;

  // Populate related data for response
  await savedAppointment.populate([
    { path: "patient", select: "firstName lastName phoneNumber" },
    {
      path: "doctor",
      select: "firstName lastName specialization consultationFee",
    },
    { path: "schedule", select: "date timeSlots isActive" },
  ]);

  // Fire-and-forget: notification failures must not affect the booking.
  await queueAppointmentNotifications(savedAppointment, patient);

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
    search,
    sort,
    page = 1,
    limit = 10,
  } = req.query as any;

  // Default newest-first. Callers showing "next N upcoming" need the opposite,
  // otherwise a limit returns the furthest-away appointments rather than the
  // soonest.
  const sortDirection = String(sort).toLowerCase() === "asc" ? 1 : -1;
  const currentPage = Number(page);
  const pageSize = Number(limit);

  // Build filter object
  const filter: any = { patient: patient._id };

  // `status` accepts a comma-separated list so a caller can ask for, say,
  // "scheduled,confirmed" in one request instead of paging twice.
  if (status) {
    const statuses = String(status)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (type) filter.type = type;

  if (dateFrom || dateTo) {
    filter.appointmentDate = {};
    if (dateFrom) filter.appointmentDate.$gte = new Date(dateFrom);
    if (dateTo) filter.appointmentDate.$lte = new Date(dateTo);
  }

  // Free-text search across the fields the UI previously filtered client-side:
  // the appointment's own reason/symptoms, plus the doctor's name, which lives
  // on a referenced document and so needs its ids resolved first.
  if (search) {
    const pattern = { $regex: String(search), $options: "i" };
    const doctorIds = await Doctor.find({
      $or: [{ firstName: pattern }, { lastName: pattern }],
    }).distinct("_id");

    filter.$or = [
      { reason: pattern },
      { symptoms: pattern },
      ...(doctorIds.length ? [{ doctor: { $in: doctorIds } }] : []),
    ];
  }

  // Calculate pagination
  const skip = (currentPage - 1) * pageSize;

  // Get appointments with pagination
  const appointments = await Appointment.find(filter)
    .populate("doctor", "firstName lastName specialization consultationFee")
    .sort({ appointmentDate: sortDirection, startTime: sortDirection })
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

  // The status change and the counter must move together: a decrement that
  // fails silently leaves the slot looking full after it has been freed.
  const cancelSession = await mongoose.startSession();
  try {
    await cancelSession.withTransaction(async () => {
      if (updatedAppointment?.schedule) {
        await applySlotDelta(
          (updatedAppointment.schedule as any)._id,
          appointment.startTime,
          appointment.endTime,
          -1,
          cancelSession
        );
      }
    });
  } finally {
    await cancelSession.endSession();
  }

  // Drop reminders for a visit that is no longer happening, then tell the
  // patient it was cancelled.
  try {
    await cancelPendingForAppointment(appointment._id);

    const recipient = await resolveRecipient(appointment.patient);
    if (recipient) {
      const doctor = appointment.doctor as any;
      await queueNotification({
        recipient: recipient.userId,
        recipientAddress: recipient.email,
        template: "appointment_cancelled",
        appointment: appointment._id,
        scheduledFor: new Date(),
        payload: {
          patientName: `${(appointment.patient as any).firstName ?? ""}`.trim(),
          doctorName: doctor?.firstName
            ? `Dr. ${doctor.firstName} ${doctor.lastName}`
            : undefined,
          appointmentDate: toUtcDateKey(appointment.appointmentDate),
          startTime: appointment.startTime,
          endTime: appointment.endTime,
        },
      });
    }
  } catch (error: any) {
    console.error("[notifications] cancel hook failed:", error?.message);
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

  // Delete and decrement together: dropping the appointment without freeing
  // its slot would leave capacity permanently consumed by a record that no
  // longer exists.
  const deleteSession = await mongoose.startSession();
  try {
    await deleteSession.withTransaction(async () => {
      if (appointment.schedule) {
        await applySlotDelta(
          (appointment.schedule as any)._id,
          appointment.startTime,
          appointment.endTime,
          -1,
          deleteSession
        );
      }
      await Appointment.findByIdAndDelete(id).session(deleteSession);
    });
  } finally {
    await deleteSession.endSession();
  }

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

  const targetDate = toUtcDayStart(date);

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
