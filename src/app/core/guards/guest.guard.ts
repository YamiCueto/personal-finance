import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Route guard redirecting authenticated users away from public auth routes
 * directly to the secured application shell.
 */
export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForInitialization();

  if (authService.isAuthenticated()) {
    return router.createUrlTree(['/app']);
  }

  return true;
};
