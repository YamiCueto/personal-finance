import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-period-selector',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <nav class="period-selector-nav" aria-label="Selector de Período Mensual">
      <div class="period-stepper">
        <button
          type="button"
          class="step-btn"
          (click)="prevMonth()"
          aria-label="Mes anterior"
          title="Mes anterior"
        >
          <app-icon name="chevron-left" [size]="16" />
        </button>

        <span class="active-period-label">
          {{ monthsList[selectedMonth() - 1].label }} {{ selectedYear() }}
        </span>

        <button
          type="button"
          class="step-btn"
          (click)="nextMonth()"
          aria-label="Mes siguiente"
          title="Mes siguiente"
        >
          <app-icon name="chevron-right" [size]="16" />
        </button>
      </div>

      <div class="months-carousel">
        @for (m of monthsList; track m.value) {
          <button
            type="button"
            class="month-pill"
            [class.active]="selectedMonth() === m.value"
            (click)="monthChanged.emit(m.value)"
          >
            {{ m.label }}
          </button>
        }
      </div>
    </nav>
  `,
  styles: [
    `
      .period-selector-nav {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
      }

      .period-stepper {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        background: var(--s1);
        border: 1px solid var(--bd);
        border-radius: var(--rsm);
        padding: 6px 12px;
      }

      .step-btn {
        width: 32px;
        height: 32px;
        min-height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--s2);
        border: 1px solid var(--bd2);
        border-radius: 6px;
        color: var(--t2);
        cursor: pointer;
        transition: color 0.15s ease, border-color 0.15s ease;

        &:hover {
          color: var(--amber);
          border-color: var(--amber-dim);
        }
      }

      .active-period-label {
        font-family: var(--font-display);
        font-size: 14px;
        font-weight: 700;
        color: var(--t1);
        letter-spacing: -0.01em;
      }

      .months-carousel {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 4px;
        scrollbar-width: none;
        &::-webkit-scrollbar { display: none; }
      }

      .month-pill {
        flex: 0 0 auto;
        padding: 6px 14px;
        background: var(--s1);
        border: 1px solid var(--bd);
        border-radius: 999px;
        color: var(--t2);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        white-space: nowrap;

        &:hover {
          color: var(--t1);
          border-color: var(--amber-dim);
        }

        &.active {
          background: var(--amber-bg);
          border-color: var(--amber);
          color: var(--amber);
          font-weight: 700;
        }
      }
    `,
  ],
})
export class PeriodSelectorComponent {
  selectedYear = input.required<number>();
  selectedMonth = input.required<number>();
  monthChanged = output<number>();

  readonly monthsList = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

  prevMonth(): void {
    const cur = this.selectedMonth();
    const next = cur > 1 ? cur - 1 : 12;
    this.monthChanged.emit(next);
  }

  nextMonth(): void {
    const cur = this.selectedMonth();
    const next = cur < 12 ? cur + 1 : 1;
    this.monthChanged.emit(next);
  }
}
