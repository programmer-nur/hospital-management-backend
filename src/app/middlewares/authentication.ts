
import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken'
import UnauthenticatedError from '../errors/unauthenticated';
import config from '../config';
import { User } from '../modules/user/user.model';
import NotFoundError from '../errors/not-found';
import sendResponse from '../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';

const auth = async (req: Request, res: Response, next: NextFunction) => {

  try {
    //check header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer")) {
      throw new UnauthenticatedError("Auth Token Missing");
    }

    const token = authHeader.split(" ")[1];
    //console.log(token);

    const payload = jwt.verify(token, config.jwt_secret as Secret);
    const { userID, email, role } = payload as JwtPayload;

    const user = await User.findById(userID,);
    if (!user) {
      throw new NotFoundError("No User Found");
    }


    if (['blocked', 'pending', 'declined'].includes(user.status)) {
      throw new UnauthenticatedError("Invalid Auth Token");
    }


    req.user = user

    next();
  } catch (error: any) {
    sendResponse(res, {
      statusCode: StatusCodes.UNAUTHORIZED,
      success: false,
      message: error.message,
      data: {},
    })
  }
};

export default auth;