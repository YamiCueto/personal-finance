import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';
import { AuthStoryComponent } from '../auth-story.component';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Custom validator requiring at least one letter and one numeric digit.
 */
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

/**
 * Custom cross-field validator ensuring password and password confirmation match.
 */
export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('passwordConfirmation')?.value;

  if (password && confirmation && password !== confirmation) {
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-signup',
  imports: [BrandLogoComponent, AuthStoryComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss',
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly showPassword = signal<boolean>(false);
  readonly showConfirmation = signal<boolean>(false);

  readonly signupForm: FormGroup = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8), passwordStrengthValidator()]],
      passwordConfirmation: ['', [Validators.required]],
    },
    { validators: [passwordMatchValidator] }
  );

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  toggleConfirmationVisibility(): void {
    this.showConfirmation.update((visible) => !visible);
  }

  async onSubmit(): Promise<void> {
    if (this.signupForm.invalid || this.isSubmitting()) {
      this.signupForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isSubmitting.set(true);

    const { email, password } = this.signupForm.getRawValue();

    try {
      const result = await this.authService.signUp(email, password);

      if (result.success) {
        if (result.requiresEmailConfirmation) {
          this.successMessage.set(
            '¡Registro de cuenta iniciado! Te hemos enviado un correo de confirmación. Por favor verifica tu dirección para activar tu bóveda.'
          );
        } else {
          this.successMessage.set('¡Cuenta registrada exitosamente! Bienvenido a tu bóveda personal.');
        }
        this.signupForm.reset();
      } else {
        this.errorMessage.set(result.error || 'Error en el registro. Por favor verifica tus datos e intenta nuevamente.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  get email() {
    return this.signupForm.get('email');
  }

  get password() {
    return this.signupForm.get('password');
  }

  get passwordConfirmation() {
    return this.signupForm.get('passwordConfirmation');
  }

  get hasPasswordMismatch(): boolean {
    return (
      !!this.signupForm.hasError('passwordMismatch') &&
      !!this.passwordConfirmation?.touched &&
      !!this.password?.touched
    );
  }
}
