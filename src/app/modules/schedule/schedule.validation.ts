import { z } from "zod";

// Time slot validation schema
const timeSlotSchema = z.object({
  startTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  endTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  isAvailable: z.boolean().default(true),
  maxAppointments: z
    .number()
    .min(1, "Maximum appointments must be at least 1")
    .default(1),
  currentAppointments: z
    .number()
    .min(0, "Current appointments cannot be negative")
    .default(0),
});

// Create schedule validation schema
export const createScheduleSchema = z.object({
  doctor: z.string().min(1, "Doctor ID is required"),
  date: z.string().min(1, "Date is required"),
  timeSlots: z
    .array(timeSlotSchema)
    .min(1, "At least one time slot is required"),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

// Update schedule validation schema
export const updateScheduleSchema = z.object({
  timeSlots: z.array(timeSlotSchema).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

// Schedule ID validation schema
export const scheduleIdSchema = z.object({
  id: z.string().min(1, "Schedule ID is required"),
});

// Doctor ID validation schema
export const doctorIdSchema = z.object({
  doctorId: z.string().min(1, "Doctor ID is required"),
});

// Date validation schema
export const dateSchema = z.object({
  date: z.string().min(1, "Date is required"),
});

// Validation functions
export const validateCreateSchedule = (data: any) => {
  try {
    createScheduleSchema.parse(data);
    return [];
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));
    }
    return [{ field: "unknown", message: "Validation error" }];
  }
};

export const validateUpdateSchedule = (data: any) => {
  try {
    updateScheduleSchema.parse(data);
    return [];
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));
    }
    return [{ field: "unknown", message: "Validation error" }];
  }
};

export const validateScheduleId = (data: any) => {
  try {
    scheduleIdSchema.parse(data);
    return [];
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));
    }
    return [{ field: "unknown", message: "Validation error" }];
  }
};

export const validateDoctorId = (data: any) => {
  try {
    doctorIdSchema.parse(data);
    return [];
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));
    }
    return [{ field: "unknown", message: "Validation error" }];
  }
};

export const validateDate = (data: any) => {
  try {
    dateSchema.parse(data);
    return [];
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));
    }
    return [{ field: "unknown", message: "Validation error" }];
  }
};

// Export types
export type CreateScheduleData = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleData = z.infer<typeof updateScheduleSchema>;
export type TimeSlotFormData = z.infer<typeof timeSlotSchema>;
