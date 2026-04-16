import { Request } from 'express';
import { IUser } from '../app/modules/user/user.type';


declare global {
  namespace Express {
    export interface Request {
      user?: IUser;
    }
  }
}