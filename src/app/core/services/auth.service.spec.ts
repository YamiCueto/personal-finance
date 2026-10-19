import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockSupabaseService: Partial<SupabaseService>;
  let mockSignUp: any;
  let mockSignInWithPassword: any;
  let mockSignOut: any;
  let mockGetSession: any;
  let mockOnAuthStateChange: any;

  beforeEach(() => {
    mockSignUp = vi.fn();
    mockSignInWithPassword = vi.fn();
    mockSignOut = vi.fn().mockResolvedValue({ error: null });
    mockGetSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange = vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    mockSupabaseService = {
      clientInstance: {
        auth: {
          signUp: mockSignUp,
          signInWithPassword: mockSignInWithPassword,
          signOut: mockSignOut,
          getSession: mockGetSession,
          onAuthStateChange: mockOnAuthStateChange,
        },
      } as any,
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should initialize and reach initialized state', async () => {
    await service.waitForInitialization();
    expect(service.isInitialized()).toBe(true);
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should handle successful registration with email confirmation required', async () => {
    const mockUser = { id: 'usr-123', email: 'test@example.com' };
    mockSignUp.mockResolvedValue({
      data: { user: mockUser, session: null },
      error: null,
    });

    const result = await service.signUp('test@example.com', 'SecureP@ss123');

    expect(result.success).toBe(true);
    expect(result.user).toEqual(mockUser as any);
    expect(result.requiresEmailConfirmation).toBe(true);
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'SecureP@ss123',
    });
  });

  it('should handle registration failure with normalized error message', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already exists' },
    });

    const result = await service.signUp('existing@example.com', 'SecureP@ss123');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Ya existe una cuenta');
  });

  it('should handle successful login with password', async () => {
    const mockUser = { id: 'usr-456', email: 'owner@example.com' };
    const mockSession = { access_token: 'token-123', user: mockUser };
    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    const result = await service.signInWithPassword('owner@example.com', 'ValidPass1');

    expect(result.success).toBe(true);
    expect(service.currentUser()).toEqual(mockUser as any);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should handle login failure with normalized credentials error', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    const result = await service.signInWithPassword('owner@example.com', 'WrongPass1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Correo o contraseña incorrectos');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should clear authentication state on signOut', async () => {
    const mockUser = { id: 'usr-789', email: 'owner@example.com' };
    service.currentUser.set(mockUser as any);
    service.currentSession.set({} as any);

    await service.signOut();

    expect(mockSignOut).toHaveBeenCalled();
    expect(service.currentUser()).toBeNull();
    expect(service.currentSession()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should call resetPasswordForEmail with trimmed email and default redirect', async () => {
    (mockSupabaseService.clientInstance as any).auth.resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ error: null });

    const result = await service.resetPasswordForEmail('  test@example.com  ');

    expect(result.success).toBe(true);
    expect(
      (mockSupabaseService.clientInstance as any).auth.resetPasswordForEmail
    ).toHaveBeenCalledWith('test@example.com', {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
  });

  it('should call updateUser with new password', async () => {
    const updatedUser = { id: 'usr-123', email: 'user@example.com' };
    (mockSupabaseService.clientInstance as any).auth.updateUser = vi
      .fn()
      .mockResolvedValue({ data: { user: updatedUser }, error: null });

    const result = await service.updateUserPassword('NewPassword123!');

    expect(result.success).toBe(true);
    expect(result.user).toEqual(updatedUser as any);
    expect(service.currentUser()).toEqual(updatedUser as any);
  });
});
