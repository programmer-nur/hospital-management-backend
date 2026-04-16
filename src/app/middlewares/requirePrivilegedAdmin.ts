
import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken'
import UnauthenticatedError from '../errors/unauthenticated';
import config from '../config';
import { User } from '../modules/user/user.model';
import NotFoundError from '../errors/not-found';
import sendResponse from '../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import ForbiddenError from '../errors/forbidden';
import { Admin } from '../modules/admin/admin.model';

const requirePrivilegedAdmin = async (req: Request, res: Response, next: NextFunction) => {

    try {

        const adminUser = req.user;

        if (!adminUser) {
            throw new ForbiddenError('User not logged in')
        }

        const admin = await Admin.findOne({ user: adminUser._id });

        if (!admin) {
            throw new ForbiddenError('User not admin')
        }

        if (admin.privileged) {
            admin.privileged = false;
            admin.save();
        } else {
            throw new ForbiddenError('Privileged Admin Required for this action')
        }

        next();
    } catch (error: any) {
        sendResponse(res, {
            statusCode: StatusCodes.FORBIDDEN,
            success: false,
            message: error.message,
            data: {},
        })
    }
};

export default requirePrivilegedAdmin;