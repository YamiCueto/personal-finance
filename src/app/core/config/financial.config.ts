import { InjectionToken } from '@angular/core';

/**
 * Modo de proveedor financiero para la capa de integración.
 * - 'local-demo': Adaptador en memoria con datos ficticios, determinista y seguro para desarrollo sin tocar la BD.
 * - 'supabase': Adaptador remoto Supabase Client con RPCs y RLS (preparado pero NO ejecutado en esta fase).
 */
export type FinancialProviderMode = 'local-demo' | 'supabase';

export interface FinancialConfig {
  readonly providerMode: FinancialProviderMode;
  readonly defaultCurrency: 'COP';
  readonly isDemoIndicatorEnabled: boolean;
}

export const DEFAULT_FINANCIAL_CONFIG: FinancialConfig = {
  providerMode: 'local-demo',
  defaultCurrency: 'COP',
  isDemoIndicatorEnabled: true,
};

export const FINANCIAL_CONFIG = new InjectionToken<FinancialConfig>('FINANCIAL_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_FINANCIAL_CONFIG,
});
