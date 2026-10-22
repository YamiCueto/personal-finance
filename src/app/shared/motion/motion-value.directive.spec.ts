import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MotionValueDirective } from './motion-value.directive';

@Component({ imports: [MotionValueDirective], template: '<span [appMotionValue]="target()" #value="motionValue">{{ value.value() }}</span>' })
class Host { readonly target = signal(100); }

describe('MotionValueDirective', () => {
  let frames: Map<number, FrameRequestCallback>;
  let next: number;
  let reduced: boolean;
  let mediaChange: () => void;
  const remove = vi.fn();
  beforeEach(() => {
    frames = new Map(); next = 0; reduced = false;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, cb: () => void) => { mediaChange = cb; }, removeEventListener: remove }));
    TestBed.configureTestingModule({ imports: [Host] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  function advance(milliseconds: number) {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(performance.now() + milliseconds));
  }
  it('ends at the exact latest target after interruption, including negative amounts', () => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    advance(150); fixture.detectChanges();
    expect(Number(fixture.nativeElement.textContent)).toBeGreaterThan(0);
    expect(Number(fixture.nativeElement.textContent)).toBeLessThan(100);
    fixture.componentInstance.target.set(-1234.56); fixture.detectChanges();
    advance(700); fixture.detectChanges();
    expect(Number(fixture.nativeElement.textContent)).toBe(-1234.56);
    expect(frames.size).toBe(0);
    fixture.componentInstance.target.set(-1234.56); fixture.detectChanges();
    expect(frames.size).toBe(0);
  });
  it('finishes immediately with reduced motion and reacts to preference changes', () => {
    reduced = true;
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    expect(Number(fixture.nativeElement.textContent)).toBe(100);
    expect(frames.size).toBe(0);
    reduced = false; fixture.componentInstance.target.set(900); fixture.detectChanges();
    expect(frames.size).toBe(1);
    reduced = true; mediaChange(); fixture.detectChanges();
    expect(Number(fixture.nativeElement.textContent)).toBe(900);
    expect(frames.size).toBe(0);
  });
  it('cancels pending frames and removes the media listener on destruction', () => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    expect(frames.size).toBe(1);
    fixture.destroy();
    expect(frames.size).toBe(0);
    expect(remove).toHaveBeenCalledWith('change', mediaChange);
  });
});
