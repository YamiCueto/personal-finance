import { User, Session } from '@supabase/supabase-js';

/**
 * Result of an email/password registration attempt.
 */
export interface SignUpResult {
  readonly success: boolean;
  readonly user: User | null;
  readonly session: Session | null;
  readonly requiresEmailConfirmation: boolean;
  readonly error?: string;
}

/**
 * Result of an email/password authentication attempt.
 */
export interface SignInResult {
  readonly success: boolean;
  readonly user: User | null;
  readonly session: Session | null;
  readonly error?: string;
}

export interface PasswordRecoveryResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface PasswordUpdateResult {
  readonly success: boolean;
  readonly user: User | null;
  readonly error?: string;
}
