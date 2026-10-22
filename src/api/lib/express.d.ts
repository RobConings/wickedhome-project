import type { SessionUser } from "@/features/auth/types/auth";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
