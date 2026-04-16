import { Request, Response } from "express";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import config from "../../config";
import sendResponse from "../../shared/sendResponse";
import { User } from "../user/user.model";
import UnauthenticatedError from "../../errors/unauthenticated";
import CustomAPIError from "../../errors/custom-api";
import { StatusCodes } from "http-status-codes";
import NotFoundError from "../../errors/not-found";
import ForbiddenError from "../../errors/forbidden";
import { ILogin } from "./auth.type";

// login user
const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as ILogin;
  const user = await User.getUser(email);
  if (!user) {
    throw new UnauthenticatedError("Email or Password is incorrect");
  }

  const userStatus = user.status;

  if (userStatus === "declined") {
    throw new UnauthenticatedError("Email or Password is incorrect");
  }

  if (userStatus === "blocked") {
    throw new CustomAPIError(
      "Your user status is Suspended",
      StatusCodes.FORBIDDEN
    );
  }

  if (user.auth_type != "standard") {
    throw new CustomAPIError(
      "The account was registered using " +
        user.auth_type +
        ". Please use " +
        user.auth_type +
        "to sign in.",
      StatusCodes.FORBIDDEN
    );
  }

  if (!(await user.passwordMatched(password))) {
    throw new UnauthenticatedError("Email or Password is incorrect");
  }

  user.lastLoggedIn = new Date();

  await user.save();

  const accessToken = user.createJWT();

  const refreshToken = user.createJWT(true);

  if (refreshToken) {
    res.cookie("refreshToken", refreshToken, {
      secure: config.node_env === "production",
      httpOnly: true,
    });
  }

  const payload: any = {
    accessToken,
    user: user,
  };

  user.password = "";

  if (accessToken) {
    return sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "User logged in successfully",
      data: payload,
    });
  }
  throw new CustomAPIError("Access Token not Generated");
};

// register user
const register = async (req: Request, res: Response) => {
  const existingUser = await User.getUser(req.body.email);

  if (existingUser && existingUser.status == "declined") {
    throw new CustomAPIError(
      "Your Request was previously declined with this email",
      StatusCodes.CONFLICT
    );
  } else if (existingUser) {
    throw new CustomAPIError("Email Address Taken", StatusCodes.CONFLICT);
  }
  const newUser = new User({
    ...req.body,
  });

  const user = await newUser.save();

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "User registered successfully",
    data: user,
  });
};

//verify otp and code (send the otp code in body as {code:string})

// refresh token
const refreshTokenGenerate = async (req: Request, res: Response) => {
  const { refreshToken } = req.cookies;
  // try {
  const verifyToken = jwt.verify(
    refreshToken,
    config.jwt_refresh_secret as Secret
  );
  if (!verifyToken) {
    throw new CustomAPIError("Forbidden", StatusCodes.FORBIDDEN);
  }
  const { userID } = verifyToken as JwtPayload;
  // check user is valid
  const user = await User.findById(userID);
  if (!user) {
    throw new UnauthenticatedError("No Valid Logged in your Found");
  }

  const token = user.createJWT();

  res.cookie("refreshToken", refreshToken, {
    secure: config.node_env === "production",
    httpOnly: true,
  });
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Access token Refreshed Successfully",
    data: {
      accessToken: token,
    },
  });
};

const changePassword = async (req: Request, res: Response) => {
  const { oldpassword, newpassword } = req.body;

  let user;
  if (req.user) {
    user = await User.findById(req.user._id).select("+password");
  }

  if (!user) {
    throw new UnauthenticatedError("Invalid User");
  }

  if (!(await user.passwordMatched(oldpassword))) {
    throw new CustomAPIError("Invalid Current Password", StatusCodes.FORBIDDEN);
  }

  user.password = newpassword;
  user.passwordChangedAt = new Date();
  await user.save();

  return sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Password Changed Successfully",
    data: null,
  });
};

const adminResetPassword = async (req: Request, res: Response) => {
  const { id, newPassword } = req.body;
  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError("User Not Found");
  }

  const userStatus = user?.status;

  if (userStatus === "blocked" || userStatus === "pending") {
    throw new CustomAPIError(
      "User status is " + userStatus,
      StatusCodes.FORBIDDEN
    );
  }

  await User.findOneAndUpdate(
    {
      _id: id,
    },
    {
      password: newPassword,
      passwordChangedAt: new Date(),
    }
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Password is reset successfully!",
    data: null,
  });
};

// const forgetPassword = async (req: Request, res: Response) => {
//   const { email } = req.body;

//   const user = await User.getUser(email);
//   if (!user) {
//     throw new NotFoundError("User Not Found");
//   }

//   const userStatus = user?.status;

//   if (userStatus === "blocked" || userStatus === "pending") {
//     throw new CustomAPIError(
//       "User status is " + userStatus,
//       StatusCodes.FORBIDDEN
//     );
//   }

//   const jwtPayload = {
//     userID: user._id,
//     roles: user.roles,
//     email: user.email,
//   };

//   const resetToken = jwt.sign(jwtPayload, config.jwt_secret as string, {
//     expiresIn: "15m",
//   });

//   const resetUILink = `${config.frontend_url}/auth/reset-password?id=${user._id}&token=${resetToken} `;

//   sendEmail({
//     to: user.email,
//     html: `<div style="width: 500px; margin: 50px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; text-align: center; font-family: Arial, sans-serif; background-color: #f9f9f9;">
//     <p style="font-size: 18px; margin-bottom: 20px;"><strong>Forget Password - ${

//     }</strong></p>
//     <p style="color: #666; margin-bottom: 30px;">Please Click on the following link to reset your password</p>
//     <a href="${resetUILink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; font-size: 16px;">Reset Password</a>
//      <p style="margin-top: 30px;"><span style="">If you have not requested to reset your password you can safely ignore this email</span></p>
// </div>`,
//     subject: `Password Reset Link - ${
//       ConfigurationService.getDBConfigs().app_name
//     }`,
//   });

//   sendResponse(res, {
//     statusCode: StatusCodes.OK,
//     success: true,
//     message: "Reset link sent to your email",
//     data: null,
//   });
// };

const resetPassword = async (req: Request, res: Response) => {
  const user = req.user;
  const newPassword = req.body.newPassword;
  if (!user) {
    throw new UnauthenticatedError("Invalid User Credentials");
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  return sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Password Changed Successfully",
    data: null,
  });
};

const getselfInfo = async (req: Request, res: Response) => {
  const user = req.user;
  let payload: any = {
    user: user,
  };

  return sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User Info Retrieved",
    data: payload,
  });
};

const updateProfile = async (req: Request, res: Response) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new ForbiddenError("Access denied");
  }

  const updateData = req.body;

  // Update user profile fields
  const updatedUser = await User.findByIdAndUpdate(
    currentUser._id,
    updateData,
    { new: true, runValidators: true }
  ).select("-password");

  if (!updatedUser) {
    throw new NotFoundError("User not found");
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Profile updated successfully",
    data: updatedUser,
  });
};

export const AuthController = {
  login,
  register,
  refreshTokenGenerate,
  changePassword,
  adminResetPassword,
  resetPassword,
  getselfInfo,
  updateProfile,
};
