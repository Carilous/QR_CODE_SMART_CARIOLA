import User from '../models/User.js';
import { verifySessionToken } from '../utils/auth.token.js';

export async function optionalAuth(request, response, next) {
  const token = request.cookies?.smartqr_session;
  if (!token) return next();

  try {
    const payload = verifySessionToken(token);
    const user = await User.findById(payload.sub);

    if (!user || user.status !== 'active' || user.authVersion !== payload.version) {
      return response.status(401).json({ error: 'Session is no longer valid.' });
    }

    request.user = user;
    return next();
  } catch {
    return response.status(401).json({ error: 'Session is no longer valid.' });
  }
}

export function requireAuth(request, response, next) {
  return optionalAuth(request, response, () => {
    if (!request.user) return response.status(401).json({ error: 'Authentication required.' });
    return next();
  });
}

export function requireRoles(...roles) {
  return (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}