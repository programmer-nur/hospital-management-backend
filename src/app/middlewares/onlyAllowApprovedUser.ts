
import { NextFunction, Request, Response } from 'express';
import UnauthenticatedError from '../errors/unauthenticated';


const onlyAllowApprovedUser = async (req: Request, res: Response, next: NextFunction) => {

  const loggedInUser = req.user
  if (!loggedInUser) {
    throw new UnauthenticatedError('User not logged in');
  }

  if (loggedInUser.status != 'approved') {
    throw new UnauthenticatedError('User does not have permission to perform this Request');
  }

  next();

};

export default onlyAllowApprovedUser;