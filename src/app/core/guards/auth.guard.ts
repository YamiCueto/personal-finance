import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Route guard restricting access to authenticated vault sessions.
 *
 * Waits for session restoration on startup to avoid false redirects or loops.
 * Redirects unauthenticated requests to /auth/login preserving target returnUrl.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForInitialization();

  if (authService.isAuthenticated()) {
    return true;
  }

  const queryParams = state.url && state.url !== '/app' && state.url !== '/' ? { returnUrl: state.url } : {};
  return router.createUrlTree(['/auth/login'], { queryParams });
};
