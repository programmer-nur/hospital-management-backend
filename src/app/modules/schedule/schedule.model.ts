import { Schema, model } from "mongoose";
import { ISchedule, ScheduleModel, ITimeSlot } from "./schedule.type";

// Time slot schema
const timeSlotSchema = new Schema<ITimeSlot>({
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
  isAvailable: {
    type: Boolean,
    default: true,
  },
  maxAppointments: {
    type: Number,
    default: 1,
    min: [1, "Maximum appointments must be at least 1"],
  },
  currentAppointments: {
    type: Number,
    default: 0,
    min: [0, "Current appointments cannot be negative"],
  },
});

// mongoose schedule schema
const scheduleSchema = new Schema<ISchedule, ScheduleModel>(
  {
    doctor: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: [true, "Doctor reference is required"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    timeSlots: [timeSlotSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      trim: true,
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
scheduleSchema.index({ doctor: 1 });
scheduleSchema.index({ date: 1 });
scheduleSchema.index({ isActive: 1 });
scheduleSchema.index({ doctor: 1, date: 1 }, { unique: true }); // One schedule per doctor per date

// Virtual for available slots count
scheduleSchema.virtual("availableSlotsCount").get(function () {
  let count = 0;
  this.timeSlots.forEach((slot) => {
    if (slot.isAvailable) {
      const availableSpots = slot.maxAppointments - slot.currentAppointments;
      count += Math.max(0, availableSpots);
    }
  });
  return count;
});

// Pre-save middleware to validate time slots
scheduleSchema.pre("save", function (next) {
  // Validate date is not in the past
  const scheduleDate = new Date(this.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  scheduleDate.setHours(0, 0, 0, 0);

  if (scheduleDate < today) {
    return next(new Error("Cannot create schedule for past dates"));
  }

  // Validate time slots
  for (const slot of this.timeSlots) {
    const startTime = new Date(`2000-01-01T${slot.startTime}:00`);
    const endTime = new Date(`2000-01-01T${slot.endTime}:00`);

    if (startTime >= endTime) {
      return next(
        new Error(
          `Start time must be before end time: ${slot.startTime} - ${slot.endTime}`
        )
      );
    }

    if (slot.currentAppointments > slot.maxAppointments) {
      return next(
        new Error(
          `Current appointments cannot exceed maximum appointments for slot ${slot.startTime}`
        )
      );
    }

    // Validate slot duration is exactly 1 hour
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    if (durationHours !== 1) {
      return next(
        new Error(
          `Time slot must be exactly 1 hour: ${slot.startTime} - ${slot.endTime}`
        )
      );
    }
  }

  next();
});

// Static method to find schedule by doctor and date
scheduleSchema.statics.findByDoctorAndDate = async function (
  doctorId: string,
  date: Date
) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  return await this.findOne({
    doctor: doctorId,
    date: targetDate,
    isActive: true,
  });
};

// Static method to get available slots for a specific date
scheduleSchema.statics.getAvailableSlots = async function (
  doctorId: string,
  date: string
) {
  // Parse date in UTC to match how dates are stored in the database
  // Format: "2025-10-21" should match "2025-10-21T00:00:00.000Z" in DB
  const targetDate = new Date(date + "T00:00:00.000Z");

  console.log(`[getAvailableSlots] Looking for schedule:`, {
    doctorId,
    inputDate: date,
    targetDate: targetDate.toISOString(),
  });

  // Find schedule without using findByDoctorAndDate to check both active and inactive
  const schedule = await this.findOne({
    doctor: doctorId,
    date: targetDate,
  });

  console.log(
    `[getAvailableSlots] Schedule found:`,
    schedule
      ? {
          id: schedule._id,
          date: schedule.date.toISOString(),
          isActive: schedule.isActive,
          slotsCount: schedule.timeSlots.length,
        }
      : "null"
  );

  if (!schedule) {
    console.log(`[getAvailableSlots] No schedule found, returning empty array`);
    return [];
  }

  // Return all time slots with their current booking status
  // This allows the frontend to show accurate booking counts
  const slots = schedule.timeSlots.map((slot) => ({
    startTime: slot.startTime,
    endTime: slot.endTime,
    isAvailable: slot.isAvailable,
    maxAppointments: slot.maxAppointments,
    currentAppointments: slot.currentAppointments,
    availableSpots: slot.maxAppointments - slot.currentAppointments,
  }));

  console.log(`[getAvailableSlots] Returning ${slots.length} slots`);
  return slots;
};

// Static method to create default schedule for a doctor
scheduleSchema.statics.createDefaultSchedule = async function (
  doctorId: string,
  date: Date
) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  // Check if schedule already exists
  const existingSchedule = await this.findOne({
    doctor: doctorId,
    date: targetDate,
    isActive: true,
  });

  if (existingSchedule) {
    console.log("Schedule already exists, returning existing schedule");
    return existingSchedule;
  }

  // Create 1-hour slots from 9:00 AM to 5:00 PM
  const timeSlots = [];
  for (let hour = 9; hour < 17; hour++) {
    const startTime = `${hour.toString().padStart(2, "0")}:00`;
    const endTime = `${(hour + 1).toString().padStart(2, "0")}:00`;

    timeSlots.push({
      startTime,
      endTime,
      isAvailable: true,
      maxAppointments: 2,
      currentAppointments: 0,
    });
  }

  const schedule = new this({
    doctor: doctorId,
    date: targetDate,
    timeSlots,
    isActive: true,
    notes: "Default schedule created automatically",
  });

  const savedSchedule = await schedule.save();
  console.log("New schedule created and saved with ID:", savedSchedule._id);

  return savedSchedule;
};

// Instance method to update slot availability based on current appointments
scheduleSchema.methods.updateSlotAvailability = function () {
  this.timeSlots.forEach((slot: any) => {
    // Set isAvailable to false if currentAppointments >= maxAppointments
    slot.isAvailable = slot.currentAppointments < slot.maxAppointments;
  });
  return this;
};

export const Schedule = model<ISchedule, ScheduleModel>(
  "Schedule",
  scheduleSchema
);
