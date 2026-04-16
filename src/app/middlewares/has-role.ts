import { Request, Response, NextFunction } from "express";
import UnauthenticatedError from "../errors/unauthenticated";
import ForbiddenError from "../errors/forbidden";

const hasRole =
  (...requiredAnyRole: string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthenticatedError("Invalid logged In User");
    }

    const roles = [];
    roles.push(...req.user.roles);

    if (req.user.roles.includes("superadmin")) {
      next();
      return;
    }

    // match required permissions

    for (const role of requiredAnyRole) {
      if (roles.includes(role)) {
        next();
        return;
      }
    }

    throw new ForbiddenError("You dont have permission to perform this task!");
  };

export default hasRole;
