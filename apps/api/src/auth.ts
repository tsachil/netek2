import type { Request, Response, NextFunction } from "express";
import { UserRole, UserStatus, type UserRoleValue, type UserStatusValue } from "./prismaEnums";

export type SessionUser = {
  id: string;
  role: UserRoleValue;
  branchCode: string | null;
  status: UserStatusValue;
};

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
  return next();
}

export function requireRole(roles: UserRoleValue[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.session.user;
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    return next();
  };
}

export function requireActive(req: Request, res: Response, next: NextFunction) {
  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
  if (user.status !== UserStatus.ACTIVE) {
    return res.status(403).json({ error: "INACTIVE" });
  }
  return next();
}
