import mongoose, { Document, Schema } from "mongoose";

export interface IAdmin extends Document {
  user: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  privileged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      unique: true,
      validate: {
        validator: function (v: string) {
          return /^\+?[\d\s-()]+$/.test(v);
        },
        message: "Please provide a valid phone number",
      },
    },
    privileged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Admin = mongoose.model<IAdmin>("Admin", adminSchema);
