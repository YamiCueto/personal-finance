import { Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-account-delete-dialog',
  template: `
    <dialog #dialog aria-labelledby="account-confirm-title" aria-describedby="account-confirm-description" (cancel)="cancel($event)">
      @if (mode() === 'archive') {
        <h2 id="account-confirm-title">¿Archivar esta cuenta?</h2>
        <p id="account-confirm-description">Estás a punto de archivar la cuenta <strong>{{ name() }}</strong>. Conservará todos sus datos y movimientos históricos, se retirará de los selectores operativos y podrás restaurarla cuando lo necesites.</p>
      } @else {
        <h2 id="account-confirm-title">¿Eliminar esta cuenta?</h2>
        <p id="account-confirm-description">Estás a punto de eliminar definitivamente la cuenta <strong>{{ name() }}</strong>. Esta acción solo procede si no existen movimientos registrados y no se puede deshacer.</p>
        <label class="reason-field">
          <span>Motivo de eliminación (opcional)</span>
          <input type="text" [value]="reason()" [disabled]="busy()" (input)="reasonChange.emit($any($event.target).value)" placeholder="Ej. Cuenta creada por error" />
        </label>
      }
      @if (error()) { <p role="alert" class="error-banner">{{ error() }}</p> }
      <div class="actions">
        <button type="button" autofocus [disabled]="busy()" (click)="dismiss.emit()">Cancelar</button>
        @if (mode() === 'archive') {
          <button class="archive-confirm" type="button" [disabled]="busy()" (click)="confirm.emit()">{{ busy() ? 'Archivando…' : 'Archivar cuenta' }}</button>
        } @else {
          @if (hasHistory()) {
            <button class="archive-confirm" type="button" [disabled]="busy()" (click)="archive.emit()">Archivar cuenta</button>
          }
          <button class="danger" type="button" [disabled]="busy()" (click)="confirm.emit()">{{ busy() ? 'Eliminando…' : 'Eliminar cuenta' }}</button>
        }
      </div>
    </dialog>
  `,
  styles: `
    dialog { box-sizing: border-box; width: min(460px, calc(100vw - 32px)); border: 1px solid var(--border-color, #64746d); border-radius: 20px; padding: 24px; color: var(--text-primary, #162b22); background: var(--bg-surface, #fff); }
    dialog::backdrop { background: #001a13aa; backdrop-filter: blur(4px); }
    h2 { margin: 0 0 16px; font-size: 1.35rem; } p { line-height: 1.6; overflow-wrap: anywhere; }
    .reason-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; font-size: 0.9rem; }
    .reason-field input { min-height: 44px; padding: 8px 12px; border: 1px solid #718078; border-radius: 10px; font: inherit; color: inherit; background: transparent; }
    .error-banner { padding: 10px 12px; border-radius: 10px; background: #a329291a; border: 1px solid #a32929; color: #a32929; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 24px; }
    button { min-height: 44px; border: 1px solid #718078; border-radius: 10px; padding: 10px 16px; font: inherit; color: inherit; background: transparent; cursor: pointer; }
    button.danger { background: #a32929; color: #fff; border-color: #a32929; }
    button.archive-confirm { background: #1d4d3c; color: #fff; border-color: #1d4d3c; }
    button:disabled { opacity: .6; cursor: wait; }
    :host-context([data-theme="dark"]) dialog { background: #111b17; color: #edf5ef; }
    :host-context([data-theme="dark"]) .error-banner { color: #ff9c9c; border-color: #ff9c9c; }
  `,
})
export class AccountDeleteDialogComponent {
  readonly name = input.required<string>();
  readonly mode = input<'delete' | 'archive'>('delete');
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly hasHistory = input(false);
  readonly reason = input('');
  readonly reasonChange = output<string>();
  readonly confirm = output<void>();
  readonly archive = output<void>();
  readonly dismiss = output<void>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() { afterNextRender(() => this.dialog().nativeElement.showModal()); }

  cancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.dismiss.emit();
  }
}
