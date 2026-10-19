import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: { signInWithPassword: any };
  let router: Router;

  beforeEach(async () => {
    mockAuthService = {
      signInWithPassword: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create login component with invalid pristine form', () => {
    expect(component).toBeTruthy();
    expect(component.loginForm.valid).toBe(false);
  });

  it('should validate email format and required password', () => {
    component.loginForm.setValue({
      email: 'not-an-email',
      password: '',
    });

    expect(component.loginForm.get('email')?.hasError('email')).toBe(true);
    expect(component.loginForm.get('password')?.hasError('required')).toBe(true);
  });

  it('should navigate to /app on successful authentication', async () => {
    mockAuthService.signInWithPassword.mockResolvedValue({
      success: true,
      user: { id: 'usr-1', email: 'owner@example.com' },
      session: { access_token: 'token' },
    });

    component.loginForm.setValue({
      email: 'owner@example.com',
      password: 'CorrectPassword1',
    });

    await component.onSubmit();

    expect(mockAuthService.signInWithPassword).toHaveBeenCalledWith('owner@example.com', 'CorrectPassword1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app');
  });

  it('should display error message on invalid credentials', async () => {
    mockAuthService.signInWithPassword.mockResolvedValue({
      success: false,
      user: null,
      session: null,
      error: 'Correo o contraseña incorrectos. Por favor verifica tus credenciales.',
    });

    component.loginForm.setValue({
      email: 'owner@example.com',
      password: 'WrongPassword',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toContain('Correo o contraseña incorrectos');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(true);
  });
});
