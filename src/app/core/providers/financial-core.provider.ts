import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  FINANCIAL_CONFIG,
  FinancialConfig,
  DEFAULT_FINANCIAL_CONFIG,
} from '../config/financial.config';
import {
  FINANCIAL_ACCOUNT_REPOSITORY,
  CREDIT_PRODUCT_REPOSITORY,
  PERIOD_OBLIGATION_REPOSITORY,
  INCOME_REPOSITORY,
  TRANSACTIONAL_OPERATION_REPOSITORY,
} from '../repositories/financial-repositories.contract';
import { LocalFinancialAdapter } from '../repositories/local-financial.adapter';
import { SupabaseFinancialAdapter } from '../repositories/supabase-financial.adapter';

/**
 * Proveedor de integración de la infraestructura financiera.
 * Selecciona e inyecta la implementación del repositorio adecuada según `providerMode`.
 * Por defecto está configurado en `local-demo` para total seguridad.
 */
export function provideFinancialCore(config: Partial<FinancialConfig> = {}): EnvironmentProviders {
  const finalConfig: FinancialConfig = {
    ...DEFAULT_FINANCIAL_CONFIG,
    ...config,
  };

  const useLocal = finalConfig.providerMode === 'local-demo';

  return makeEnvironmentProviders([
    {
      provide: FINANCIAL_CONFIG,
      useValue: finalConfig,
    },
    {
      provide: FINANCIAL_ACCOUNT_REPOSITORY,
      useExisting: useLocal ? LocalFinancialAdapter : SupabaseFinancialAdapter,
    },
    {
      provide: CREDIT_PRODUCT_REPOSITORY,
      useExisting: useLocal ? LocalFinancialAdapter : SupabaseFinancialAdapter,
    },
    {
      provide: PERIOD_OBLIGATION_REPOSITORY,
      useExisting: useLocal ? LocalFinancialAdapter : SupabaseFinancialAdapter,
    },
    {
      provide: INCOME_REPOSITORY,
      useExisting: useLocal ? LocalFinancialAdapter : SupabaseFinancialAdapter,
    },
    {
      provide: TRANSACTIONAL_OPERATION_REPOSITORY,
      useExisting: useLocal ? LocalFinancialAdapter : SupabaseFinancialAdapter,
    },
  ]);
}
