import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LOCALE_ID, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { AppShellComponent } from './app-shell.component';
import { AuthService } from '../../core/services/auth.service';
import { User } from '@supabase/supabase-js';

import { provideFinancialCore } from '../../core/providers/financial-core.provider';

registerLocaleData(localeEsCo, 'es-CO');

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;
  let mockAuthService: {
    currentUser: ReturnType<typeof signal<User | null>>;
    signOut: any;
  };
  let router: Router;

  const fakeUser: Partial<User> = {
    id: 'user-uuid-1234',
    email: 'operative@vault.secure',
  };

  beforeEach(async () => {
    mockAuthService = {
      currentUser: signal(fakeUser as User),
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([]),
        provideFinancialCore({ providerMode: 'local-demo' }),
        { provide: AuthService, useValue: mockAuthService },
        { provide: LOCALE_ID, useValue: 'es-CO' },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app shell component', () => {
    expect(component).toBeTruthy();
  });

  it('should display the authenticated user email', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const emailEl = compiled.querySelector('[data-testid="user-email"]');
    expect(emailEl?.textContent).toContain('operative@vault.secure');
  });

  it('should call signOut and navigate to /auth/login on sign out click', async () => {
    await component.onSignOut();
    expect(mockAuthService.signOut).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});
