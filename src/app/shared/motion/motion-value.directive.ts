import { DestroyRef, Directive, ElementRef, effect, inject, input, signal, untracked } from '@angular/core';

@Directive({ selector: '[appMotionValue]', exportAs: 'motionValue' })
export class MotionValueDirective {
  readonly appMotionValue = input.required<number>();
  readonly motionToken = input('--motion-number');
  readonly value = signal(0);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  private frame = 0;

  constructor() {
    const finish = () => {
      cancelAnimationFrame(this.frame);
      this.value.set(this.appMotionValue());
    };
    this.media?.addEventListener('change', finish);
    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.media?.removeEventListener('change', finish);
    });
    effect(onCleanup => {
      const target = this.appMotionValue();
      const token = this.motionToken();
      const from = untracked(this.value);
      cancelAnimationFrame(this.frame);
      if (this.media?.matches || from === target) {
        this.value.set(target);
        return;
      }
      const duration = parseFloat(getComputedStyle(this.element.nativeElement).getPropertyValue(token)) || 600;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        this.value.set(progress === 1 ? target : from + (target - from) * (1 - (1 - progress) ** 3));
        if (progress < 1) this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
      onCleanup(() => cancelAnimationFrame(this.frame));
    });
  }
}
