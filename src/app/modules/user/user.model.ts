import bcrypt from "bcrypt";
import { Schema, model } from "mongoose";
import { IUser, UserModel } from "./user.type";
import config from "../../config";
import jwt from "jsonwebtoken";

// mongoose user schema
const userSchema = new Schema<IUser, UserModel>(
  {
    email: {
      type: String,
      required: [true, "Email is Required"],
      unique: true,
    },
    password: {
      type: String,
      select: false,
    },

    auth_type: {
      type: String,
      enum: ["standard", "google", "facebook"],
      default: "standard",
    },

    email_verified: {
      type: Date,
      default: null,
    },

    onboarding: {
      type: Date,
      default: null,
    },

    roles: {
      type: [String],
      default: ["client"],
    },
    permissions: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "blocked", "declined", "hold"],
      default: "pending",
    },

    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },
    lastLoggedIn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  }
);

// user exist inject function
userSchema.statics.getUser = async function (
  email: string
): Promise<IUser | null> {
  return await User.findOne({ email }).select("+password");
};
// user password match inject function
userSchema.methods.passwordMatched = async function (given: string) {
  return await bcrypt.compare(given, this.password);
};

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(config.bcrypt_salt_rounds);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

userSchema.methods.createJWT = function (refresh?: boolean): string {
  let expire_time;
  let secret;
  if (refresh) {
    expire_time = config.jwt_refresh_expire as string;
  } else {
    expire_time = config.jwt_expire as string;
  }
  if (refresh) {
    secret = config.jwt_refresh_secret as string;
  } else {
    secret = config.jwt_secret as string;
  }
  return jwt.sign(
    {
      userID: this._id,
      email: this.email,
      roles: this.roles,
      email_verified: this.email_verified,
      onboarding: this.onboarding,
      status: this.status,
    },
    secret,
    {
      expiresIn: expire_time,
    }
  );
};

// set '' after saving password
userSchema.post("save", function (doc, next) {
  doc.password = "";
  next();
});

export const User = model<IUser, UserModel>("User", userSchema);
