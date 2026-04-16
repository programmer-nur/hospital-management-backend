/* eslint-disable no-unused-vars */
import { Document, Model } from "mongoose";

export interface IUserName {
  firstName: string;
  lastName?: string;
}

export interface IUser extends Document {
  _id: any;
  email: string;
  password: string;
  auth_type: "standard" | "google" | "facebook";
  email_verified: Date | null;
  onboarding: Date | null;
  roles: string[];
  permissions: string[];
  status: "pending" | "approved" | "blocked" | "declined" | "hold";
  passwordChangedAt?: Date;
  lastLoggedIn: Date;
  createdAt: Date;
  updatedAt: Date;
  passwordMatched(givenPassword: string): Promise<boolean>;
  createJWT(refresh?: boolean): string;
}

export type UserModel = {
  getUser(email: string): Promise<IUser | null>;
} & Model<IUser>;
