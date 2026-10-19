import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-credit-card-visual',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="credit-card-visual"
      [class.mastercard]="isMastercard()"
      [class.visa]="isVisa()"
      role="img"
      [attr.aria-label]="ariaLabel()"
    >
      <div class="card-glass-glow" aria-hidden="true"></div>

      <!-- Top Row: Bank / Product Name and Contactless -->
      <div class="card-header">
        <span class="card-bank-name">{{ bankName() }}</span>
        <div class="card-contactless" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8.5 16.5a5 5 0 0 1 0-9" stroke-linecap="round" />
            <path d="M12 19a8.5 8.5 0 0 0 0-14" stroke-linecap="round" />
            <path d="M15.5 21.5a12 12 0 0 0 0-19" stroke-linecap="round" />
          </svg>
        </div>
      </div>

      <!-- Middle: Metallic Smart Chip -->
      <div class="card-chip-container" aria-hidden="true">
        <div class="card-chip">
          <div class="chip-line"></div>
          <div class="chip-line"></div>
        </div>
      </div>

      <!-- Card Number Masked -->
      <div class="card-number tabular-nums">
        <span>••••</span>
        <span>••••</span>
        <span>••••</span>
        <span class="last-digits">{{ lastFourDigits() }}</span>
      </div>

      <!-- Bottom Row: Cardholder, Expiry, Brand -->
      <div class="card-footer">
        <div class="card-meta">
          <div class="meta-item">
            <span class="meta-label">TITULAR</span>
            <span class="meta-value">{{ holderName() }}</span>
          </div>
          @if (cutoffDay()) {
            <div class="meta-item">
              <span class="meta-label">CORTE / PAGO</span>
              <span class="meta-value tabular-nums">Día {{ cutoffDay() }}</span>
            </div>
          }
        </div>

        <!-- Network Brand Indicator -->
        <div class="card-network-badge">
          @if (isMastercard()) {
            <div class="mastercard-circles" aria-label="Mastercard">
              <span class="circle circle-red"></span>
              <span class="circle circle-orange"></span>
            </div>
          } @else {
            <span class="visa-text" aria-label="VISA">VISA</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .credit-card-visual {
        background: linear-gradient(135deg, #172030 0%, #1e293d 50%, #172030 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 18px;
        padding: 20px;
        position: relative;
        overflow: hidden;
        color: var(--t1);
        box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 190px;
        aspect-ratio: 1.586;
        max-width: 380px;
        width: 100%;
        margin: 0 auto;

        &.mastercard {
          background: linear-gradient(135deg, #1A1D24 0%, #252834 50%, #191B24 100%);
          border-color: rgba(212, 160, 23, 0.25);
        }

        &.visa {
          background: linear-gradient(135deg, #131E30 0%, #1B2C47 50%, #10192A 100%);
          border-color: rgba(6, 182, 212, 0.25);
        }
      }

      .card-glass-glow {
        position: absolute;
        top: -40px;
        right: -40px;
        width: 140px;
        height: 140px;
        border-radius: 50%;
        background: var(--amber-bg);
        filter: blur(20px);
        pointer-events: none;
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 1;
      }

      .card-bank-name {
        font-family: var(--font-display);
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--amber);
      }

      .card-contactless {
        color: var(--t2);
      }

      .card-chip-container {
        margin: 12px 0 8px;
        z-index: 1;
      }

      .card-chip {
        width: 40px;
        height: 28px;
        background: linear-gradient(135deg, #d4af37 0%, #aa8012 100%);
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
        padding: 4px;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);

        .chip-line {
          height: 1px;
          background: rgba(0, 0, 0, 0.35);
          width: 100%;
        }
      }

      .card-number {
        font-family: var(--font-mono);
        font-size: 16px;
        letter-spacing: 0.18em;
        color: var(--t1);
        display: flex;
        gap: 12px;
        z-index: 1;
        margin: 8px 0;

        .last-digits {
          color: var(--amber);
          font-weight: 600;
        }
      }

      .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        z-index: 1;
      }

      .card-meta {
        display: flex;
        gap: 18px;
      }

      .meta-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .meta-label {
        font-size: 8px;
        font-weight: 600;
        color: var(--t3);
        letter-spacing: 0.06em;
      }

      .meta-value {
        font-size: 12px;
        font-weight: 600;
        color: var(--t1);
        text-transform: uppercase;
      }

      .card-network-badge {
        display: flex;
        align-items: center;
      }

      .visa-text {
        font-family: var(--font-display);
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.05em;
        color: #FFFFFF;
        font-style: italic;
      }

      .mastercard-circles {
        display: flex;
        position: relative;
        width: 36px;
        height: 22px;

        .circle {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          position: absolute;
          top: 0;

          &-red {
            left: 0;
            background: #EB001B;
            opacity: 0.9;
          }
          &-orange {
            right: 0;
            background: #F79E1B;
            opacity: 0.85;
          }
        }
      }
    `,
  ],
})
export class CreditCardVisualComponent {
  bankName = input.required<string>();
  holderName = input<string>('Yamid Cueto');
  lastFourDigits = input<string>('4829');
  cutoffDay = input<number | null>(null);
  network = input<string>('VISA');

  isMastercard = computed(() => this.network().toUpperCase().includes('MASTER'));
  isVisa = computed(() => !this.isMastercard());

  ariaLabel = computed(() => `Tarjeta de crédito ${this.bankName()} terminada en ${this.lastFourDigits()}`);
}
