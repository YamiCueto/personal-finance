import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import {
  PasswordRecoveryResult,
  PasswordUpdateResult,
  SignInResult,
  SignUpResult,
} from '../models/auth.model';
import { AUTH_MESSAGES } from '../config/auth-messages.config';

/**
 * Client-Side Authentication Service.
 *
 * Exclusively uses public browser-safe Supabase Auth endpoints.
 * Operates with zero admin/service_role privileges.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabaseService = inject(SupabaseService);

  readonly isInitialized = signal<boolean>(false);
  readonly currentUser = signal<User | null>(null);
  readonly currentSession = signal<Session | null>(null);
  readonly isAuthenticated = computed(() => !!this.currentUser());

  private readonly initPromise: Promise<void>;
  private resolveInit!: () => void;

  constructor() {
    this.initPromise = new Promise<void>((resolve) => {
      this.resolveInit = resolve;
    });

    this.initSession();
  }

  /**
   * Returns a promise that resolves once the local session has been restored
   * or determined to be absent. Essential for route guards to prevent redirect loops.
   */
  async waitForInitialization(): Promise<void> {
    if (this.isInitialized()) {
      return;
    }
    return this.initPromise;
  }

  private async initSession(): Promise<void> {
    try {
      const { data } = await this.supabaseService.clientInstance.auth.getSession();
      this.currentSession.set(data.session);
      this.currentUser.set(data.session?.user ?? null);
    } catch {
      // In offline or initial state, session defaults to null
      this.currentSession.set(null);
      this.currentUser.set(null);
    } finally {
      this.isInitialized.set(true);
      this.resolveInit();
    }

    this.supabaseService.clientInstance.auth.onAuthStateChange((_event, session) => {
      this.currentSession.set(session);
      this.currentUser.set(session?.user ?? null);
      if (!this.isInitialized()) {
        this.isInitialized.set(true);
        this.resolveInit();
      }
    });
  }

  /**
   * Authenticates an existing user account with email and password.
   *
   * @param email The user's email address
   * @param password The user's password
   */
  async signInWithPassword(email: string, password: string): Promise<SignInResult> {
    try {
      const { data, error } = await this.supabaseService.clientInstance.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return {
          success: false,
          user: null,
          session: null,
          error: this.normalizeAuthError(error),
        };
      }

      this.currentSession.set(data.session);
      this.currentUser.set(data.user);

      return {
        success: true,
        user: data.user,
        session: data.session,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : AUTH_MESSAGES.ERRORS.NETWORK_ERROR;
      return {
        success: false,
        user: null,
        session: null,
        error: message,
      };
    }
  }

  /**
   * Registers a new user account with email and password.
   *
   * @param email The user's email address
   * @param password The user's secure password
   */
  async signUp(email: string, password: string): Promise<SignUpResult> {
    try {
      const { data, error } = await this.supabaseService.clientInstance.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        return {
          success: false,
          user: null,
          session: null,
          requiresEmailConfirmation: false,
          error: this.normalizeAuthError(error),
        };
      }

      // In Supabase Auth, when email confirmation is enabled, user is returned but session is null
      const requiresEmailConfirmation = !!data.user && !data.session;

      if (data.session) {
        this.currentSession.set(data.session);
        this.currentUser.set(data.user);
      }

      return {
        success: true,
        user: data.user,
        session: data.session,
        requiresEmailConfirmation,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : AUTH_MESSAGES.ERRORS.NETWORK_ERROR;
      return {
        success: false,
        user: null,
        session: null,
        requiresEmailConfirmation: false,
        error: message,
      };
    }
  }

  /**
   * Terminates the current active session and resets local authentication state.
   */
  async signOut(): Promise<void> {
    try {
      await this.supabaseService.clientInstance.auth.signOut();
    } finally {
      this.currentSession.set(null);
      this.currentUser.set(null);
    }
  }

  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<PasswordRecoveryResult> {
    try {
      const redirectUri = redirectTo || new URL('auth/reset-password', document.baseURI).href;
      const { error } = await this.supabaseService.clientInstance.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: redirectUri,
        }
      );

      if (error) {
        return {
          success: false,
          error: this.normalizeAuthError(error),
        };
      }

      return {
        success: true,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : AUTH_MESSAGES.ERRORS.NETWORK_ERROR;
      return {
        success: false,
        error: message,
      };
    }
  }

  async updateUserPassword(password: string): Promise<PasswordUpdateResult> {
    try {
      const { data, error } = await this.supabaseService.clientInstance.auth.updateUser({
        password,
      });

      if (error) {
        return {
          success: false,
          user: null,
          error: this.normalizeAuthError(error),
        };
      }

      this.currentUser.set(data.user);

      return {
        success: true,
        user: data.user,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : AUTH_MESSAGES.ERRORS.NETWORK_ERROR;
      return {
        success: false,
        user: null,
        error: message,
      };
    }
  }

  private normalizeAuthError(error: AuthError): string {
    switch (error.code) {
      case 'invalid_credentials':
      case 'invalid_grant':
        return AUTH_MESSAGES.ERRORS.INVALID_CREDENTIALS;
      case 'email_not_confirmed':
        return AUTH_MESSAGES.ERRORS.EMAIL_NOT_CONFIRMED;
      case 'user_already_exists':
        return AUTH_MESSAGES.ERRORS.USER_ALREADY_EXISTS;
      case 'weak_password':
        return AUTH_MESSAGES.ERRORS.WEAK_PASSWORD;
      case 'over_email_send_rate_limit':
        return AUTH_MESSAGES.ERRORS.RATE_LIMIT;
      case 'validation_failed':
        return error.message || AUTH_MESSAGES.ERRORS.GENERIC_FAILURE;
      default:
        return error.message || AUTH_MESSAGES.ERRORS.GENERIC_FAILURE;
    }
  }
}
