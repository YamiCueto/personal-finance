import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-obligation-status-badge',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <span class="status-badge" [class]="badgeClass()">
      @if (status() === 'PAID') {
        <app-icon name="check-circle" [size]="12" />
        <span>PAGADO</span>
      } @else if (status() === 'PARTIAL') {
        <app-icon name="alert" [size]="12" />
        <span>PARCIAL</span>
      } @else {
        <app-icon name="exclamation-circle" [size]="12" />
        <span>POR PAGAR</span>
      }
    </span>
  `,
  styles: [
    `
      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        flex-shrink: 0;

        &--paid {
          background: var(--green-bg);
          color: var(--green);
          border: 1px solid rgba(34, 197, 94, 0.25);
        }

        &--partial {
          background: var(--amber-bg);
          color: var(--amber);
          border: 1px solid rgba(212, 160, 23, 0.25);
        }

        &--pending {
          background: var(--red-bg);
          color: var(--red);
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
      }
    `,
  ],
})
export class ObligationStatusBadgeComponent {
  status = input.required<'PAID' | 'PARTIAL' | 'PENDING' | string>();

  badgeClass = computed(() => {
    const s = this.status().toUpperCase();
    if (s === 'PAID') return 'status-badge--paid';
    if (s === 'PARTIAL') return 'status-badge--partial';
    return 'status-badge--pending';
  });
}
