import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

export function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = control.value || '';
    if (!value) return null;

    const hasLetter = /[a-zA-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);

    if (!hasLetter || !hasNumber) {
      return { passwordStrength: true };
    }
    return null;
  };
}

export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('passwordConfirmation')?.value;

  if (password && confirmation && password !== confirmation) {
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly showPassword = signal<boolean>(false);
  readonly showConfirmation = signal<boolean>(false);
  readonly isRecoverySessionValid = signal<boolean>(true);

  readonly resetForm: FormGroup = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(8), passwordStrengthValidator()]],
      passwordConfirmation: ['', [Validators.required]],
    },
    { validators: [passwordMatchValidator] }
  );

  async ngOnInit(): Promise<void> {
    await this.authService.waitForInitialization();

    if (!this.authService.isAuthenticated()) {
      const hash = window.location.hash;
      const hasRecoveryTokens = hash.includes('access_token') || hash.includes('type=recovery');

      if (!hasRecoveryTokens) {
        this.isRecoverySessionValid.set(false);
        this.errorMessage.set(
          'Recovery link is invalid or has expired. Please request a new password recovery link.'
        );
      }
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  toggleConfirmationVisibility(): void {
    this.showConfirmation.update((visible) => !visible);
  }

  async onSubmit(): Promise<void> {
    if (this.resetForm.invalid || this.isSubmitting() || !this.isRecoverySessionValid()) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isSubmitting.set(true);

    const { password } = this.resetForm.getRawValue();

    try {
      const result = await this.authService.updateUserPassword(password);

      if (result.success) {
        this.successMessage.set('Master vault password updated successfully! Redirecting to sign in...');
        this.resetForm.reset();
        setTimeout(async () => {
          await this.authService.signOut();
          await this.router.navigate(['/auth/login']);
        }, 2000);
      } else {
        this.errorMessage.set(result.error || 'Password update failed. Please try requesting a new recovery link.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  get password() {
    return this.resetForm.get('password');
  }

  get passwordConfirmation() {
    return this.resetForm.get('passwordConfirmation');
  }

  get hasPasswordMismatch(): boolean {
    return (
      !!this.resetForm.hasError('passwordMismatch') &&
      !!this.passwordConfirmation?.touched &&
      !!this.password?.touched
    );
  }
}
