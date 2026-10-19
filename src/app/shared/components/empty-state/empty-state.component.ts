import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent, IconName } from '../icon/icon.component';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="empty-state-card">
      <div class="empty-icon-box" aria-hidden="true">
        <app-icon [name]="icon()" [size]="28" />
      </div>
      <h3 class="empty-title">{{ title() }}</h3>
      <p class="empty-desc">{{ description() }}</p>
      @if (actionLabel()) {
        <button type="button" class="empty-action-btn" (click)="actionClicked.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .empty-state-card {
        background: var(--s1);
        border: 1px dashed var(--bd);
        border-radius: var(--r);
        padding: 32px 20px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin: 16px 0;
      }

      .empty-icon-box {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--amber-bg);
        border: 1px solid var(--amber-dim);
        color: var(--amber);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
      }

      .empty-title {
        font-family: var(--font-display);
        font-size: 16px;
        font-weight: 700;
        color: var(--t1);
        margin: 0;
      }

      .empty-desc {
        font-size: 13px;
        color: var(--t2);
        max-width: 380px;
        margin: 0;
        line-height: 1.45;
      }

      .empty-action-btn {
        margin-top: 8px;
        padding: 9px 18px;
        background: var(--amber);
        color: #0C1018;
        border: none;
        border-radius: var(--rsm);
        font-family: var(--font-display);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.2s ease;

        &:hover {
          opacity: 0.9;
        }
      }
    `,
  ],
})
export class EmptyStateComponent {
  title = input.required<string>();
  description = input.required<string>();
  icon = input<IconName>('document-text');
  actionLabel = input<string | null>(null);
  actionClicked = output<void>();
}
