import { Schema, model } from "mongoose";
import { IAppointment, AppointmentModel } from "./appointment.type";

// mongoose appointment schema
const appointmentSchema = new Schema<IAppointment, AppointmentModel>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: [true, "Patient reference is required"],
    },
    doctor: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: [true, "Doctor reference is required"],
    },
    schedule: {
      type: Schema.Types.ObjectId,
      ref: "Schedule",
      required: [true, "Schedule reference is required"],
    },
    appointmentDate: {
      type: Date,
      required: [true, "Appointment date is required"],
      validate: {
        validator: function (value: Date) {
          return value >= new Date(new Date().setHours(0, 0, 0, 0));
        },
        message: "Appointment date cannot be in the past",
      },
    },
    startTime: {
      type: String,
      required: [true, "Start time is required"],
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Please enter a valid time in HH:MM format",
      ],
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Please enter a valid time in HH:MM format",
      ],
    },
    status: {
      type: String,
      enum: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      default: "scheduled",
    },
    type: {
      type: String,
      enum: [
        "consultation",
        "follow_up",
        "emergency",
        "routine_checkup",
        "specialist_referral",
      ],
      required: [true, "Appointment type is required"],
    },
    reason: {
      type: String,
      required: [true, "Appointment reason is required"],
      trim: true,
      maxlength: [500, "Reason cannot exceed 500 characters"],
    },
    symptoms: {
      type: String,
      trim: true,
      maxlength: [1000, "Symptoms cannot exceed 1000 characters"],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
    },
    diagnosis: {
      type: String,
      trim: true,
      maxlength: [1000, "Diagnosis cannot exceed 1000 characters"],
    },
    prescription: {
      type: String,
      trim: true,
      maxlength: [1000, "Prescription cannot exceed 1000 characters"],
    },
    isUrgent: {
      type: Boolean,
      default: false,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: [500, "Cancellation reason cannot exceed 500 characters"],
    },
    cancelledBy: {
      type: String,
      enum: ["patient", "doctor", "admin"],
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  }
);

// Index for better query performance
appointmentSchema.index({ patient: 1 });
appointmentSchema.index({ doctor: 1 });
appointmentSchema.index({ schedule: 1 });
appointmentSchema.index({ appointmentDate: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ doctor: 1, appointmentDate: 1 });
appointmentSchema.index({ patient: 1, appointmentDate: 1 });
appointmentSchema.index({ appointmentDate: 1, startTime: 1 });
// Compound index for patient-specific time slot validation
appointmentSchema.index({
  patient: 1,
  appointmentDate: 1,
  startTime: 1,
  endTime: 1,
});
// Compound index for doctor-specific time slot validation
appointmentSchema.index({
  doctor: 1,
  appointmentDate: 1,
  startTime: 1,
  endTime: 1,
});

// Virtual for appointment duration
appointmentSchema.virtual("duration").get(function () {
  const startTime = new Date(`2000-01-01T${this.startTime}:00`);
  const endTime = new Date(`2000-01-01T${this.endTime}:00`);
  const diffMs = endTime.getTime() - startTime.getTime();
  return Math.round(diffMs / (1000 * 60)); // Return duration in minutes
});

// Virtual for appointment status
appointmentSchema.virtual("isUpcoming").get(function () {
  const now = new Date();
  const appointmentDateTime = new Date(this.appointmentDate);
  appointmentDateTime.setHours(
    parseInt(this.startTime.split(":")[0]),
    parseInt(this.startTime.split(":")[1])
  );
  return appointmentDateTime > now && this.status === "scheduled";
});

// Virtual for appointment status
appointmentSchema.virtual("isPast").get(function () {
  const now = new Date();
  const appointmentDateTime = new Date(this.appointmentDate);
  appointmentDateTime.setHours(
    parseInt(this.startTime.split(":")[0]),
    parseInt(this.startTime.split(":")[1])
  );
  return appointmentDateTime < now;
});

// Pre-save middleware to validate appointment time
appointmentSchema.pre("save", function (next) {
  // Validate start time is before end time
  const startTime = new Date(`2000-01-01T${this.startTime}:00`);
  const endTime = new Date(`2000-01-01T${this.endTime}:00`);

  if (startTime >= endTime) {
    return next(new Error("Start time must be before end time"));
  }

  // Set cancelledAt when status is cancelled
  if (this.status === "cancelled" && !this.cancelledAt) {
    this.cancelledAt = new Date();
  }

  // Clear cancellation fields when status is not cancelled
  if (this.status !== "cancelled") {
    this.cancellationReason = undefined;
    this.cancelledBy = undefined;
    this.cancelledAt = undefined;
  }

  next();
});

// Static method to check slot availability
appointmentSchema.statics.checkSlotAvailability = async function (
  doctorId: string,
  appointmentDate: string,
  startTime: string,
  endTime: string,
  excludeAppointmentId?: string,
  patientId?: string
) {
  const targetDate = new Date(appointmentDate);
  targetDate.setHours(0, 0, 0, 0);

  // Find the schedule for this doctor and date
  const { Schedule } = await import("../schedule/schedule.model");
  const schedule = await Schedule.findByDoctorAndDate(doctorId, targetDate);

  if (!schedule) {
    return { available: false, reason: "No schedule found for this date" };
  }

  // Check if the requested time slot exists in the schedule
  const requestedSlot = schedule.timeSlots.find(
    (slot: any) => slot.startTime === startTime && slot.endTime === endTime
  );

  if (!requestedSlot) {
    return {
      available: false,
      reason: "Requested time slot not available in doctor's schedule",
    };
  }

  if (!requestedSlot.isAvailable) {
    return { available: false, reason: "Time slot is not available" };
  }

  // Check if patient already has an appointment at this exact time slot
  if (patientId) {
    const existingPatientAppointment = await this.findOne({
      patient: patientId,
      appointmentDate: targetDate,
      startTime,
      endTime,
      status: { $in: ["scheduled", "confirmed", "in_progress"] },
      _id: { $ne: excludeAppointmentId },
    });

    if (existingPatientAppointment) {
      return {
        available: false,
        reason:
          "You already have an appointment booked for this time slot. Please choose a different time.",
        currentAppointments: 0,
        maxAppointments: 1,
        existingAppointment: {
          id: existingPatientAppointment._id,
          date: existingPatientAppointment.appointmentDate,
          startTime: existingPatientAppointment.startTime,
          endTime: existingPatientAppointment.endTime,
          status: existingPatientAppointment.status,
          type: existingPatientAppointment.type,
          reason: existingPatientAppointment.reason,
          doctor: {
            id: existingPatientAppointment.doctor._id,
            name: `Dr. ${existingPatientAppointment.doctor.firstName} ${existingPatientAppointment.doctor.lastName}`,
            specialization: existingPatientAppointment.doctor.specialization,
            consultationFee: existingPatientAppointment.doctor.consultationFee,
          },
          patient: {
            id: existingPatientAppointment.patient._id,
            name: `${existingPatientAppointment.patient.firstName} ${existingPatientAppointment.patient.lastName}`,
            phoneNumber: existingPatientAppointment.patient.phoneNumber,
          },
        },
      };
    }
  }

  // Check current appointments for this slot (general availability)
  const existingAppointments = await this.countDocuments({
    doctor: doctorId,
    appointmentDate: targetDate,
    startTime,
    endTime,
    status: { $in: ["scheduled", "confirmed", "in_progress"] },
    _id: { $ne: excludeAppointmentId },
  });

  const maxAppointments = requestedSlot.maxAppointments || 1;
  const available = existingAppointments < maxAppointments;

  return {
    available,
    reason: available
      ? "Slot is available"
      : "Maximum appointments reached for this slot",
    currentAppointments: existingAppointments,
    maxAppointments,
  };
};

// Static method to get appointment statistics
appointmentSchema.statics.getAppointmentStats = async function (
  doctorId?: string,
  patientId?: string,
  dateFrom?: Date,
  dateTo?: Date
) {
  const filter: any = {};

  if (doctorId) filter.doctor = doctorId;
  if (patientId) filter.patient = patientId;
  if (dateFrom || dateTo) {
    filter.appointmentDate = {};
    if (dateFrom) filter.appointmentDate.$gte = dateFrom;
    if (dateTo) filter.appointmentDate.$lte = dateTo;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    totalAppointments,
    scheduledAppointments,
    completedAppointments,
    cancelledAppointments,
    todayAppointments,
    upcomingAppointments,
  ] = await Promise.all([
    this.countDocuments(filter),
    this.countDocuments({ ...filter, status: "scheduled" }),
    this.countDocuments({ ...filter, status: "completed" }),
    this.countDocuments({ ...filter, status: "cancelled" }),
    this.countDocuments({
      ...filter,
      appointmentDate: { $gte: today, $lt: tomorrow },
      status: { $in: ["scheduled", "confirmed", "in_progress"] },
    }),
    this.countDocuments({
      ...filter,
      appointmentDate: { $gte: tomorrow },
      status: { $in: ["scheduled", "confirmed"] },
    }),
    // Revenue calculation removed since consultationFee is now in doctor profile
    0,
  ]);

  return {
    totalAppointments,
    scheduledAppointments,
    completedAppointments,
    cancelledAppointments,
    todayAppointments,
    upcomingAppointments,
    revenue: 0, // Revenue calculation moved to doctor-based calculation
  };
};

export const Appointment = model<IAppointment, AppointmentModel>(
  "Appointment",
  appointmentSchema
);
