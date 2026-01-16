import type { User as AppUser } from "../../shared/schema";

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

export {};

