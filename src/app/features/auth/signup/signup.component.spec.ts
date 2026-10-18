import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SignupComponent } from './signup.component';
import { AuthService } from '../../../core/services/auth.service';

describe('SignupComponent', () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;
  let mockAuthService: { signUp: any };

  beforeEach(async () => {
    mockAuthService = {
      signUp: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the signup component with pristine invalid form', () => {
    expect(component).toBeTruthy();
    expect(component.signupForm.valid).toBe(false);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should require a valid email address format', () => {
    const emailCtrl = component.signupForm.get('email');
    emailCtrl?.setValue('invalid-email');
    expect(emailCtrl?.hasError('email')).toBe(true);

    emailCtrl?.setValue('valid.user@example.com');
    expect(emailCtrl?.valid).toBe(true);
  });

  it('should enforce password length and character complexity', () => {
    const passwordCtrl = component.signupForm.get('password');

    // Too short
    passwordCtrl?.setValue('short1');
    expect(passwordCtrl?.hasError('minlength')).toBe(true);

    // Only letters (no number)
    passwordCtrl?.setValue('onlyletterslong');
    expect(passwordCtrl?.hasError('passwordStrength')).toBe(true);

    // Only numbers (no letter)
    passwordCtrl?.setValue('1234567890');
    expect(passwordCtrl?.hasError('passwordStrength')).toBe(true);

    // Valid combination
    passwordCtrl?.setValue('ValidP@ss123');
    expect(passwordCtrl?.valid).toBe(true);
  });

  it('should validate password confirmation matching', () => {
    component.signupForm.patchValue({
      email: 'user@example.com',
      password: 'SecurePassword1',
      passwordConfirmation: 'DifferentPassword2',
    });

    expect(component.signupForm.hasError('passwordMismatch')).toBe(true);

    component.signupForm.patchValue({
      passwordConfirmation: 'SecurePassword1',
    });

    expect(component.signupForm.hasError('passwordMismatch')).toBe(false);
  });

  it('should submit valid credentials and display confirmation message on success', async () => {
    mockAuthService.signUp.mockResolvedValue({
      success: true,
      user: { id: 'user-001', email: 'owner@example.com' },
      session: null,
      requiresEmailConfirmation: true,
    });

    component.signupForm.setValue({
      email: 'owner@example.com',
      password: 'SecurePassword1',
      passwordConfirmation: 'SecurePassword1',
    });

    await component.onSubmit();

    expect(mockAuthService.signUp).toHaveBeenCalledWith('owner@example.com', 'SecurePassword1');
    expect(component.successMessage()).toContain('correo de confirmación');
    expect(component.errorMessage()).toBeNull();
  });

  it('should display error message on registration failure', async () => {
    mockAuthService.signUp.mockResolvedValue({
      success: false,
      user: null,
      session: null,
      requiresEmailConfirmation: false,
      error: 'Ya existe una cuenta registrada con este correo electrónico.',
    });

    component.signupForm.setValue({
      email: 'existing@example.com',
      password: 'SecurePassword1',
      passwordConfirmation: 'SecurePassword1',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toContain('Ya existe una cuenta');
    expect(component.successMessage()).toBeNull();
  });

  it('should toggle password field visibility states', () => {
    expect(component.showPassword()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(true);

    expect(component.showConfirmation()).toBe(false);
    component.toggleConfirmationVisibility();
    expect(component.showConfirmation()).toBe(true);
  });
});
