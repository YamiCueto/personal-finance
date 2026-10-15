import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/**
 * Minimal authenticated shell placeholder.
 *
 * Verifies that protected routing and session persistence work.
 * Does not implement financial domain features yet.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.authService.currentUser;

  async onSignOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/auth/login']);
  }
}
