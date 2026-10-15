import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly forgotForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async onSubmit(): Promise<void> {
    if (this.forgotForm.invalid || this.isSubmitting()) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isSubmitting.set(true);

    const { email } = this.forgotForm.getRawValue();

    try {
      const result = await this.authService.resetPasswordForEmail(email);

      if (result.success) {
        this.successMessage.set(
          'If an account exists with this email address, password recovery instructions have been dispatched. Please inspect your inbox and spam folder.'
        );
        this.forgotForm.reset();
      } else {
        this.errorMessage.set(result.error || 'Password reset request failed. Please try again.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  get email() {
    return this.forgotForm.get('email');
  }
}
