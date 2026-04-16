// Simple validation functions for doctor module

// Basic validation for creating a doctor
export const validateCreateDoctor = (data: any) => {
  const errors: string[] = [];

  // Email validation
  if (!data.email || typeof data.email !== "string") {
    errors.push("Email is required and must be a string");
  } else if (!/\S+@\S+\.\S+/.test(data.email)) {
    errors.push("Please provide a valid email address");
  }

  // Password validation
  if (
    !data.password ||
    typeof data.password !== "string" ||
    data.password.length < 8
  ) {
    errors.push("Password must be at least 8 characters long");
  }

  // Name validation
  if (!data.firstName || typeof data.firstName !== "string") {
    errors.push("First name is required");
  }
  if (!data.lastName || typeof data.lastName !== "string") {
    errors.push("Last name is required");
  }

  // Date of birth validation
  if (!data.dateOfBirth) {
    errors.push("Date of birth is required");
  } else {
    const birthDate = new Date(data.dateOfBirth);
    const today = new Date();
    if (birthDate >= today) {
      errors.push("Date of birth cannot be in the future");
    }
  }

  // Gender validation
  if (!data.gender || !["male", "female", "other"].includes(data.gender)) {
    errors.push("Gender must be male, female, or other");
  }

  // Phone validation
  if (!data.phoneNumber || typeof data.phoneNumber !== "string") {
    errors.push("Phone number is required");
  }

  // Specialization validation
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
  if (
    !data.specialization ||
    !validSpecializations.includes(data.specialization)
  ) {
    errors.push("Valid specialization is required");
  }

  // Experience validation
  if (
    !data.yearsOfExperience ||
    typeof data.yearsOfExperience !== "number" ||
    data.yearsOfExperience < 0 ||
    data.yearsOfExperience > 50
  ) {
    errors.push("Years of experience must be a number between 0 and 50");
  }

  // Consultation fee validation
  if (
    !data.consultationFee ||
    typeof data.consultationFee !== "number" ||
    data.consultationFee < 0
  ) {
    errors.push("Consultation fee must be a positive number");
  }

  return errors;
};

// Basic validation for updating a doctor
export const validateUpdateDoctor = (data: any) => {
  const errors: string[] = [];

  // Date of birth validation
  if (data.dateOfBirth) {
    const birthDate = new Date(data.dateOfBirth);
    const today = new Date();
    if (birthDate >= today) {
      errors.push("Date of birth cannot be in the future");
    }
  }

  // Gender validation
  if (data.gender && !["male", "female", "other"].includes(data.gender)) {
    errors.push("Gender must be male, female, or other");
  }

  // Specialization validation
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
  if (
    data.specialization &&
    !validSpecializations.includes(data.specialization)
  ) {
    errors.push("Invalid specialization");
  }

  // Experience validation
  if (
    data.yearsOfExperience !== undefined &&
    (typeof data.yearsOfExperience !== "number" ||
      data.yearsOfExperience < 0 ||
      data.yearsOfExperience > 50)
  ) {
    errors.push("Years of experience must be a number between 0 and 50");
  }

  // Consultation fee validation
  if (
    data.consultationFee !== undefined &&
    (typeof data.consultationFee !== "number" || data.consultationFee < 0)
  ) {
    errors.push("Consultation fee must be a positive number");
  }

  return errors;
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

// Placeholder validation objects for compatibility
export const createDoctorValidation = { validate: validateCreateDoctor };
export const updateDoctorValidation = { validate: validateUpdateDoctor };
export const doctorIdValidation = { validate: validateDoctorId };
export const listDoctorsValidation = { validate: () => [] };
