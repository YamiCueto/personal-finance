import { Component, input } from '@angular/core';
import { BRAVISO_MARK, BRAVISO_WORDMARK } from '../../brand/brand-shapes';

@Component({
  selector: 'app-brand-logo',
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" [attr.viewBox]="compact() ? '0 0 64 64' : '0 0 254 64'" role="img" aria-label="BRAVISO" focusable="false">
      <path class="brand-mark" [attr.d]="mark" fill="currentColor" fill-rule="evenodd" />
      @if (!compact()) {
        <path class="brand-wordmark" [attr.d]="wordmark" transform="translate(70 18)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="round" />
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex-shrink: 0; width: 156px; color: var(--accent); vertical-align: middle; }
    :host(.compact) { width: 32px; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
  `,
  host: { '[class.compact]': 'compact()', '[class.brand-intro]': 'intro()' },
})
export class BrandLogoComponent {
  readonly compact = input(false);
  readonly intro = input(false);
  readonly mark = BRAVISO_MARK;
  readonly wordmark = BRAVISO_WORDMARK;
}
