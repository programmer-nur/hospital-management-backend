import { Document, Model } from "mongoose";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type AppointmentType =
  | "consultation"
  | "follow_up"
  | "emergency"
  | "routine_checkup"
  | "specialist_referral";

export interface IAppointment extends Document {
  _id: any;
  patient: any; // Reference to Patient model
  doctor: any; // Reference to Doctor model
  schedule: any; // Reference to Schedule model
  appointmentDate: Date;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  status: AppointmentStatus;
  type: AppointmentType;
  reason: string;
  symptoms?: string;
  notes?: string;
  diagnosis?: string;
  prescription?: string;
  isUrgent: boolean;
  paymentStatus: "pending" | "paid" | "refunded";
  cancellationReason?: string;
  cancelledBy?: "patient" | "doctor" | "admin";
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AppointmentModel = Model<IAppointment> & {
  checkSlotAvailability(
    doctorId: string,
    appointmentDate: string,
    startTime: string,
    endTime: string,
    excludeAppointmentId?: string,
    patientId?: string
  ): Promise<{
    available: boolean;
    reason: string;
    currentAppointments?: number;
    maxAppointments?: number;
    existingAppointment?: {
      id: string;
      date: Date;
      startTime: string;
      endTime: string;
      status: AppointmentStatus;
      type: AppointmentType;
      reason: string;
      doctor: {
        id: string;
        name: string;
        specialization: string;
        consultationFee: number;
      };
      patient: {
        id: string;
        name: string;
        phoneNumber: string;
      };
    };
  }>;
  getAppointmentStats(
    doctorId?: string,
    patientId?: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<IAppointmentStats>;
};

export interface ICreateAppointment {
  patientId: string;
  doctorId: string;
  appointmentDate: string; // YYYY-MM-DD format
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  type: AppointmentType;
  reason: string;
  symptoms?: string;
  notes?: string;
  isUrgent?: boolean;
  estimatedDuration?: number;
}

export interface IUpdateAppointment {
  appointmentDate?: string;
  startTime?: string;
  endTime?: string;
  status?: AppointmentStatus;
  type?: AppointmentType;
  reason?: string;
  symptoms?: string;
  diagnosis?: string;
  prescription?: string;
  notes?: string;
  isUrgent?: boolean;
  estimatedDuration?: number;
  actualDuration?: number;
  paymentStatus?: "pending" | "paid" | "refunded";
}

export interface ICancelAppointment {
  cancellationReason: string;
  cancelledBy: "patient" | "doctor" | "admin";
}

export interface IAppointmentQuery {
  patientId?: string;
  doctorId?: string;
  status?: AppointmentStatus;
  type?: AppointmentType;
  dateFrom?: string;
  dateTo?: string;
  isUrgent?: boolean;
  page?: number;
  limit?: number;
}

export interface IAppointmentStats {
  totalAppointments: number;
  scheduledAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  todayAppointments: number;
  upcomingAppointments: number;
  revenue: number;
}
