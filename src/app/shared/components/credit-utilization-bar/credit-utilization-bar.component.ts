import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-credit-utilization-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="utilization-box">
      <div class="util-row header-row">
        <span class="util-lbl">Cupo Aprobado</span>
        <span class="util-val tabular-nums">{{ approvedLimit() | currency:'COP':'symbol-narrow':'1.0-0':'es-CO' }}</span>
      </div>

      <div class="util-row">
        <span class="util-lbl">Cupo Utilizado</span>
        <span class="util-val tabular-nums" [class.val-red]="usedPercentage() > 50">
          {{ usedAmount() | currency:'COP':'symbol-narrow':'1.0-0':'es-CO' }}
        </span>
      </div>

      <!-- Barra de Progreso -->
      <div class="progress-track" role="progressbar" [attr.aria-valuenow]="usedPercentage()" aria-valuemin="0" aria-valuemax="100">
        <div
          class="progress-fill"
          [style.width.%]="clampedPercentage()"
          [class.high-alert]="usedPercentage() >= 75"
          [class.mid-alert]="usedPercentage() >= 40 && usedPercentage() < 75"
        ></div>
      </div>

      <div class="util-footer">
        <span class="util-pct">{{ usedPercentage() | number:'1.1-1':'es-CO' }}% utilizado</span>
        <span class="util-avail">
          Disponible: <strong class="tabular-nums text-green">{{ availableLimit() | currency:'COP':'symbol-narrow':'1.0-0':'es-CO' }}</strong>
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      .utilization-box {
        background: var(--s1);
        border: 1px solid var(--bd);
        border-radius: var(--r);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .util-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .header-row {
        border-bottom: 1px solid var(--bd2);
        padding-bottom: 6px;
      }

      .util-lbl {
        font-size: 12px;
        color: var(--t2);
      }

      .util-val {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 500;
        color: var(--t1);

        &.val-red {
          color: var(--red);
        }
      }

      .progress-track {
        height: 8px;
        background: var(--s2);
        border: 1px solid var(--bd2);
        border-radius: 4px;
        overflow: hidden;
        margin: 4px 0;
      }

      .progress-fill {
        height: 100%;
        border-radius: 4px;
        background: linear-gradient(90deg, var(--green), #4ADE80);
        transition: width 0.4s ease;

        &.mid-alert {
          background: linear-gradient(90deg, var(--amber), #FBBF24);
        }

        &.high-alert {
          background: linear-gradient(90deg, var(--red), #F87171);
        }
      }

      .util-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
      }

      .util-pct {
        color: var(--t3);
      }

      .util-avail {
        color: var(--t2);
      }
    `,
  ],
})
export class CreditUtilizationBarComponent {
  approvedLimit = input.required<number>();
  usedAmount = input.required<number>();

  availableLimit = computed(() => Math.max(0, this.approvedLimit() - this.usedAmount()));

  usedPercentage = computed(() => {
    if (this.approvedLimit() <= 0) return 0;
    return Math.min(100, (this.usedAmount() / this.approvedLimit()) * 100);
  });

  clampedPercentage = computed(() => Math.max(0, Math.min(100, this.usedPercentage())));
}
