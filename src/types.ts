export const roles = [
  "Customer",
  "Service Advisor",
  "Service Technician",
  "Administrator"
] as const;

export type Role = (typeof roles)[number];

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
