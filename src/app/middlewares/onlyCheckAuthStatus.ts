
import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken'
import config from '../config';
import { User } from '../modules/user/user.model';

const onlyCheckAuthStatus = async (req: Request, res: Response, next: NextFunction) => {

  try {
    //check header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer")) {
     return next();
    }

    const token = authHeader.split(" ")[1];
    //console.log(token);

    const payload = jwt.verify(token, config.jwt_secret as Secret);
    const { userID, email, role } = payload as JwtPayload;

    const user = await User.findById(userID,);
    if (user) {
        req.user = user
    }

    next();
  } catch (error: any) {
    next();
  }
};

export default onlyCheckAuthStatus;