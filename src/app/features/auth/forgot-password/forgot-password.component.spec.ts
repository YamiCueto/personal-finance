import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ForgotPasswordComponent } from './forgot-password.component';
import { AuthService } from '../../../core/services/auth.service';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let mockAuthService: { resetPasswordForEmail: any };

  beforeEach(async () => {
    mockAuthService = {
      resetPasswordForEmail: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render initial recovery form', () => {
    expect(component).toBeTruthy();
    expect(component.forgotForm.valid).toBe(false);
  });

  it('should validate invalid email input', () => {
    const emailCtrl = component.forgotForm.controls['email'];
    emailCtrl.setValue('not-an-email');
    expect(emailCtrl.valid).toBe(false);
    expect(emailCtrl.hasError('email')).toBe(true);
  });

  it('should display success notification on successful recovery request', async () => {
    mockAuthService.resetPasswordForEmail.mockResolvedValue({ success: true });

    component.forgotForm.controls['email'].setValue('user@example.com');
    await component.onSubmit();
    fixture.detectChanges();

    expect(mockAuthService.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com');
    expect(component.successMessage()).toContain('password recovery instructions have been dispatched');
    expect(component.errorMessage()).toBeNull();
  });

  it('should display error message on recovery failure', async () => {
    mockAuthService.resetPasswordForEmail.mockResolvedValue({
      success: false,
      error: 'Rate limit reached. Please wait.',
    });

    component.forgotForm.controls['email'].setValue('user@example.com');
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage()).toBe('Rate limit reached. Please wait.');
    expect(component.successMessage()).toBeNull();
  });
});
