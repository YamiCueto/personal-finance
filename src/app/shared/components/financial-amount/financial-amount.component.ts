import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-financial-amount',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="financial-amount tabular-nums"
      [class.size-lg]="size() === 'lg'"
      [class.size-sm]="size() === 'sm'"
      [class.negative]="isNegative()"
      [class.positive]="isPositive()"
    >
      {{ prefix() }}{{ formattedAmount() }}
    </span>
  `,
  styles: [
    `
      .financial-amount {
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
        font-weight: 500;
        color: var(--t1);
        display: inline-block;

        &.size-lg {
          font-size: 22px;
          font-weight: 700;
        }

        &.size-sm {
          font-size: 12px;
        }

        &.negative {
          color: var(--red);
        }

        &.positive {
          color: var(--green);
        }
      }
    `,
  ],
})
export class FinancialAmountComponent {
  amount = input.required<number>();
  size = input<'sm' | 'md' | 'lg'>('md');
  showSign = input<boolean>(false);
  digitsInfo = input<string>('1.0-0');

  isNegative = computed(() => this.amount() < 0);
  isPositive = computed(() => this.showSign() && this.amount() > 0);

  prefix = computed(() => {
    if (this.showSign() && this.amount() > 0) return '+';
    return '';
  });

  formattedAmount = computed(() => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: this.digitsInfo().includes('.2') ? 2 : 0,
      minimumFractionDigits: this.digitsInfo().includes('.2') ? 2 : 0,
    }).format(this.amount());
  });
}
