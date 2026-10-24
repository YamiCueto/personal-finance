import { EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { CanActivateFn, GuardResult, Routes } from '@angular/router';

const lazyAuthGuard: CanActivateFn = async (route, state) => {
  const injector = inject(EnvironmentInjector);
  const { authGuard } = await import('./core/guards/auth.guard');
  return runInInjectionContext(injector, () => authGuard(route, state)) as Promise<GuardResult>;
};

const lazyGuestGuard: CanActivateFn = async (route, state) => {
  const injector = inject(EnvironmentInjector);
  const { guestGuard } = await import('./core/guards/guest.guard');
  return runInInjectionContext(injector, () => guestGuard(route, state)) as Promise<GuardResult>;
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    path: 'app',
    canActivate: [lazyAuthGuard],
    loadChildren: () =>
      import('./features/app-shell/app-shell.component').then((m) => m.APP_SHELL_ROUTES),
  },
  {
    path: 'auth/login',
    canActivate: [lazyGuestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/signup',
    canActivate: [lazyGuestGuard],
    loadComponent: () =>
      import('./features/auth/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'auth/forgot-password',
    canActivate: [lazyGuestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent
      ),
  },
  {
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent
      ),
  },
  {
    path: '**',
    redirectTo: 'app',
  },
];
