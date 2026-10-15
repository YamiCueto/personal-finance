import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/app-shell/app-shell.component').then((m) => m.AppShellComponent),
  },
  {
    path: 'auth/login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/signup',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'auth/forgot-password',
    canActivate: [guestGuard],
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
