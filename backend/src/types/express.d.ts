import type { AuthUser } from '../middleware/auth.middleware.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
