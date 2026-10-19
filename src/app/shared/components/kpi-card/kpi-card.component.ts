import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent, IconName } from '../icon/icon.component';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div
      class="kpi-card"
      [class]="colorClass()"
      [attr.data-testid]="testId() || null"
    >
      <div class="kpi-top">
        <span class="kpi-label">{{ label() }}</span>
        @if (icon()) {
          <app-icon [name]="icon()!" [size]="16" class="kpi-icon" />
        }
      </div>
      <div
        class="kpi-value tabular-nums"
        [class.negative]="negative()"
      >
        {{ value() }}
      </div>
      @if (sub()) {
        <span class="kpi-sub">{{ sub() }}</span>
      }
    </div>
  `,
  styles: [
    `
      .kpi-card {
        background: var(--s1);
        border: 1px solid var(--bd);
        border-radius: var(--r);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        transition: border-color 0.2s ease, transform 0.2s ease;
        position: relative;
        overflow: hidden;

        &:hover {
          border-color: var(--amber-dim);
        }

        &--green {
          border-color: rgba(34, 197, 94, 0.25);
          .kpi-value { color: var(--green); }
        }
        &--red {
          border-color: rgba(239, 68, 68, 0.25);
          .kpi-value { color: var(--red); }
        }
        &--amber {
          border-color: rgba(212, 160, 23, 0.3);
          .kpi-value { color: var(--amber); }
        }
        &--cyan {
          border-color: rgba(6, 182, 212, 0.25);
          .kpi-value { color: var(--cyan); }
        }
      }

      .kpi-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }

      .kpi-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--t2);
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .kpi-icon {
        color: var(--t3);
      }

      .kpi-value {
        font-family: var(--font-mono);
        font-size: 19px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--t1);
        line-height: 1.25;

        &.negative {
          color: var(--red) !important;
        }
      }

      .kpi-sub {
        font-size: 11px;
        color: var(--t3);
        margin-top: 6px;
        line-height: 1.3;
      }
    `,
  ],
})
export class KpiCardComponent {
  label = input.required<string>();
  value = input.required<string>();
  sub = input<string | null>(null);
  color = input<'neutral' | 'green' | 'red' | 'amber' | 'cyan'>('neutral');
  icon = input<IconName | null>(null);
  testId = input<string | null>(null);
  negative = input<boolean>(false);

  colorClass = computed(() => (this.color() !== 'neutral' ? `kpi-card--${this.color()}` : ''));
}
