// Simple validation functions for appointment module

// Basic validation for creating an appointment
export const validateCreateAppointment = (data: any) => {
  const errors: string[] = [];

  // Patient ID validation
  if (!data.patientId || typeof data.patientId !== "string") {
    errors.push("Patient ID is required");
  } else if (!/^[0-9a-fA-F]{24}$/.test(data.patientId)) {
    errors.push("Invalid patient ID format");
  }

  // Doctor ID validation
  if (!data.doctorId || typeof data.doctorId !== "string") {
    errors.push("Doctor ID is required");
  } else if (!/^[0-9a-fA-F]{24}$/.test(data.doctorId)) {
    errors.push("Invalid doctor ID format");
  }

  // Appointment date validation
  if (!data.appointmentDate) {
    errors.push("Appointment date is required");
  } else {
    const appointmentDate = new Date(data.appointmentDate);
    if (isNaN(appointmentDate.getTime())) {
      errors.push("Invalid appointment date format");
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (appointmentDate < today) {
        errors.push("Appointment date cannot be in the past");
      }
    }
  }

  // Start time validation
  if (!data.startTime || typeof data.startTime !== "string") {
    errors.push("Start time is required");
  } else {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(data.startTime)) {
      errors.push("Start time must be in HH:MM format");
    }
  }

  // End time validation
  if (!data.endTime || typeof data.endTime !== "string") {
    errors.push("End time is required");
  } else {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(data.endTime)) {
      errors.push("End time must be in HH:MM format");
    }
  }

  // Validate time order
  if (data.startTime && data.endTime) {
    const startTime = new Date(`2000-01-01T${data.startTime}:00`);
    const endTime = new Date(`2000-01-01T${data.endTime}:00`);

    if (startTime >= endTime) {
      errors.push("Start time must be before end time");
    }
  }

  // Type validation
  const validTypes = [
    "consultation",
    "follow_up",
    "emergency",
    "routine_checkup",
    "specialist_referral",
  ];
  if (!data.type || !validTypes.includes(data.type)) {
    errors.push("Valid appointment type is required");
  }

  // Reason validation
  if (!data.reason || typeof data.reason !== "string") {
    errors.push("Appointment reason is required");
  } else if (data.reason.length > 500) {
    errors.push("Reason cannot exceed 500 characters");
  }

  // Symptoms validation
  if (
    data.symptoms &&
    typeof data.symptoms === "string" &&
    data.symptoms.length > 1000
  ) {
    errors.push("Symptoms cannot exceed 1000 characters");
  }

  // Notes validation
  if (
    data.notes &&
    typeof data.notes === "string" &&
    data.notes.length > 2000
  ) {
    errors.push("Notes cannot exceed 2000 characters");
  }

  // IsUrgent validation
  if (data.isUrgent !== undefined && typeof data.isUrgent !== "boolean") {
    errors.push("isUrgent must be a boolean");
  }

  return errors;
};

// Basic validation for updating an appointment
export const validateUpdateAppointment = (data: any) => {
  const errors: string[] = [];

  // Appointment date validation
  if (data.appointmentDate) {
    const appointmentDate = new Date(data.appointmentDate);
    if (isNaN(appointmentDate.getTime())) {
      errors.push("Invalid appointment date format");
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (appointmentDate < today) {
        errors.push("Appointment date cannot be in the past");
      }
    }
  }

  // Start time validation
  if (data.startTime && typeof data.startTime === "string") {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(data.startTime)) {
      errors.push("Start time must be in HH:MM format");
    }
  }

  // End time validation
  if (data.endTime && typeof data.endTime === "string") {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(data.endTime)) {
      errors.push("End time must be in HH:MM format");
    }
  }

  // Validate time order
  if (data.startTime && data.endTime) {
    const startTime = new Date(`2000-01-01T${data.startTime}:00`);
    const endTime = new Date(`2000-01-01T${data.endTime}:00`);

    if (startTime >= endTime) {
      errors.push("Start time must be before end time");
    }
  }

  // Status validation
  const validStatuses = [
    "scheduled",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
  ];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push("Invalid appointment status");
  }

  // Type validation
  const validTypes = [
    "consultation",
    "follow_up",
    "emergency",
    "routine_checkup",
    "specialist_referral",
  ];
  if (data.type && !validTypes.includes(data.type)) {
    errors.push("Invalid appointment type");
  }

  // Reason validation
  if (data.reason !== undefined) {
    if (typeof data.reason !== "string") {
      errors.push("Reason must be a string");
    } else if (data.reason.length > 500) {
      errors.push("Reason cannot exceed 500 characters");
    }
  }

  // Symptoms validation
  if (data.symptoms !== undefined) {
    if (typeof data.symptoms !== "string") {
      errors.push("Symptoms must be a string");
    } else if (data.symptoms.length > 1000) {
      errors.push("Symptoms cannot exceed 1000 characters");
    }
  }

  // Notes validation
  if (data.notes !== undefined) {
    if (typeof data.notes !== "string") {
      errors.push("Notes must be a string");
    } else if (data.notes.length > 2000) {
      errors.push("Notes cannot exceed 2000 characters");
    }
  }

  // IsUrgent validation
  if (data.isUrgent !== undefined && typeof data.isUrgent !== "boolean") {
    errors.push("isUrgent must be a boolean");
  }

  // Payment status validation
  const validPaymentStatuses = ["pending", "paid", "refunded"];
  if (
    data.paymentStatus &&
    !validPaymentStatuses.includes(data.paymentStatus)
  ) {
    errors.push("Invalid payment status");
  }

  return errors;
};

// Validation for cancelling an appointment
export const validateCancelAppointment = (data: any) => {
  const errors: string[] = [];

  // Cancellation reason validation
  if (!data.cancellationReason || typeof data.cancellationReason !== "string") {
    errors.push("Cancellation reason is required");
  } else if (data.cancellationReason.length > 500) {
    errors.push("Cancellation reason cannot exceed 500 characters");
  }

  // Cancelled by validation
  const validCancelledBy = ["patient", "doctor", "admin"];
  if (!data.cancelledBy || !validCancelledBy.includes(data.cancelledBy)) {
    errors.push("Valid cancelled by value is required");
  }

  return errors;
};

// Validation for appointment ID
export const validateAppointmentId = (id: string) => {
  if (!id || typeof id !== "string") {
    return "Appointment ID is required";
  }
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return "Invalid appointment ID format";
  }
  return null;
};

// Validation for patient ID
export const validatePatientId = (id: string) => {
  if (!id || typeof id !== "string") {
    return "Patient ID is required";
  }
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return "Invalid patient ID format";
  }
  return null;
};

// Validation for doctor ID
export const validateDoctorId = (id: string) => {
  if (!id || typeof id !== "string") {
    return "Doctor ID is required";
  }
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return "Invalid doctor ID format";
  }
  return null;
};

// Validation for date
export const validateDate = (date: string) => {
  if (!date || typeof date !== "string") {
    return "Date is required";
  }
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return "Invalid date format";
  }
  return null;
};

// Validation for duplicate patient appointments at same time slot
export const validateDuplicatePatientAppointment = async (
  patientId: string,
  appointmentDate: string,
  startTime: string,
  endTime: string,
  excludeAppointmentId?: string
) => {
  const { Appointment } = await import("./appointment.model");

  const targetDate = new Date(appointmentDate);
  targetDate.setHours(0, 0, 0, 0);

  const existingAppointment = await Appointment.findOne({
    patient: patientId,
    appointmentDate: targetDate,
    startTime,
    endTime,
    status: { $in: ["scheduled", "confirmed", "in_progress"] },
    _id: { $ne: excludeAppointmentId },
  });

  if (existingAppointment) {
    return "You already have an appointment booked for this time slot. Please choose a different time.";
  }

  return null;
};

// Placeholder validation objects for compatibility
export const createAppointmentValidation = {
  validate: validateCreateAppointment,
};
export const updateAppointmentValidation = {
  validate: validateUpdateAppointment,
};
export const cancelAppointmentValidation = {
  validate: validateCancelAppointment,
};
export const appointmentIdValidation = { validate: validateAppointmentId };
export const patientIdValidation = { validate: validatePatientId };
export const doctorIdValidation = { validate: validateDoctorId };
export const dateValidation = { validate: validateDate };
