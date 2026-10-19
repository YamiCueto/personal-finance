import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../../core/services/auth.service';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockAuthService: {
    waitForInitialization: any;
    isAuthenticated: any;
    updateUserPassword: any;
    signOut: any;
  };

  beforeEach(async () => {
    mockAuthService = {
      waitForInitialization: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(true),
      updateUserPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render initial reset form', () => {
    expect(component).toBeTruthy();
    expect(component.resetForm.valid).toBe(false);
  });

  it('should validate password mismatch', () => {
    component.resetForm.controls['password'].setValue('ValidPassword123');
    component.resetForm.controls['passwordConfirmation'].setValue('DifferentPassword456');

    expect(component.resetForm.hasError('passwordMismatch')).toBe(true);
  });

  it('should submit updated password on valid input', async () => {
    mockAuthService.updateUserPassword.mockResolvedValue({ success: true, user: null });

    component.resetForm.controls['password'].setValue('StrongPassword123!');
    component.resetForm.controls['passwordConfirmation'].setValue('StrongPassword123!');

    await component.onSubmit();
    fixture.detectChanges();

    expect(mockAuthService.updateUserPassword).toHaveBeenCalledWith('StrongPassword123!');
    expect(component.successMessage()).toContain('actualizada exitosamente');
  });
});
