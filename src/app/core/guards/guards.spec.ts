import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';
import { AuthService } from '../services/auth.service';

describe('Auth & Guest Guards', () => {
  let mockAuthService: {
    waitForInitialization: any;
    isAuthenticated: any;
  };
  let mockRouter: {
    createUrlTree: any;
  };

  beforeEach(() => {
    mockAuthService = {
      waitForInitialization: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn(),
    };

    mockRouter = {
      createUrlTree: vi.fn((commands, extras) => ({ commands, extras })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  describe('authGuard', () => {
    it('should allow access when authenticated', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      const state = { url: '/app' } as RouterStateSnapshot;

      const result = await TestBed.runInInjectionContext(() => authGuard({} as any, state));

      expect(mockAuthService.waitForInitialization).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to /auth/login with returnUrl', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const state = { url: '/app/settings' } as RouterStateSnapshot;

      const result = await TestBed.runInInjectionContext(() => authGuard({} as any, state));

      expect(result).toEqual({
        commands: ['/auth/login'],
        extras: { queryParams: { returnUrl: '/app/settings' } },
      } as any);
    });
  });

  describe('guestGuard', () => {
    it('should allow unauthenticated access to auth pages', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);

      const result = await TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));

      expect(result).toBe(true);
    });

    it('should redirect authenticated users to /app', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);

      const result = await TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));

      expect(result).toEqual({
        commands: ['/app'],
        extras: undefined,
      } as any);
    });
  });
});
