import { Document, Model } from "mongoose";

export type Gender = "male" | "female" | "other";
export type BloodGroup =
  | "A+"
  | "A-"
  | "B+"
  | "B-"
  | "AB+"
  | "AB-"
  | "O+"
  | "O-";

export interface IPatient extends Document {
  _id: any;
  user: any; // Reference to User model
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender;
  phoneNumber: string;
  bloodGroup?: BloodGroup;
  createdAt: Date;
  updatedAt: Date;
}

export type PatientModel = Model<IPatient>;

export interface ICreatePatient {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  phoneNumber: string;
  bloodGroup?: BloodGroup;
}

export interface IUpdatePatient {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  phoneNumber?: string;
  bloodGroup?: BloodGroup;
}
