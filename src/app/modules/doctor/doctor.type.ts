import { Document, Model } from "mongoose";

export type Gender = "male" | "female" | "other";
export type Specialization =
  | "cardiology"
  | "dermatology"
  | "endocrinology"
  | "gastroenterology"
  | "general_medicine"
  | "neurology"
  | "oncology"
  | "orthopedics"
  | "pediatrics"
  | "psychiatry"
  | "radiology"
  | "surgery"
  | "urology"
  | "other";

export interface IDoctor extends Document {
  _id: any;
  user: any; // Reference to User model
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender;
  phoneNumber: string;
  specialization: Specialization;
  yearsOfExperience: number;
  bio?: string;
  consultationFee: number;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type DoctorModel = Model<IDoctor>;

export interface ICreateDoctor {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  phoneNumber: string;
  specialization: Specialization;
  yearsOfExperience: number;
  bio?: string;
  consultationFee: number;
  isAvailable?: boolean;
}

export interface IUpdateDoctor {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  phoneNumber?: string;
  specialization?: Specialization;
  yearsOfExperience?: number;
  bio?: string;
  consultationFee?: number;
  isAvailable?: boolean;
}
