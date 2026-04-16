import { Document, Types, Model } from "mongoose";

// Time slot interface
export interface ITimeSlot {
  startTime: string; // Format: "09:00"
  endTime: string; // Format: "10:00"
  isAvailable: boolean;
  maxAppointments: number;
  currentAppointments: number;
}

// Schedule interface
export interface ISchedule extends Document {
  doctor: Types.ObjectId;
  date: Date; // Specific date (e.g., 2025-01-15)
  timeSlots: ITimeSlot[];
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  updateSlotAvailability(): ISchedule;
}

// Schedule model interface
export interface ScheduleModel extends Model<ISchedule> {
  findByDoctorAndDate(doctorId: string, date: Date): Promise<ISchedule | null>;
  getAvailableSlots(doctorId: string, date: string): Promise<ITimeSlot[]>;
  createDefaultSchedule(doctorId: string, date: Date): Promise<ISchedule>;
}

// Form data interfaces
export interface CreateScheduleData {
  doctor: string;
  date: string;
  timeSlots: {
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    maxAppointments: number;
    currentAppointments: number;
  }[];
  isActive: boolean;
  notes?: string;
}

export interface UpdateScheduleData {
  timeSlots?: {
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    maxAppointments: number;
    currentAppointments: number;
  }[];
  isActive?: boolean;
  notes?: string;
}

export interface TimeSlotFormData {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxAppointments: number;
  currentAppointments: number;
}
