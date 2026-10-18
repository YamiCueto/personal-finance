import { AuthService } from '../services/auth.service';
import { FinancialConfig } from '../config/financial.config';

export async function resolveUserId(auth: AuthService, config: FinancialConfig): Promise<string> {
  if (config.providerMode === 'local-demo') {
    return auth.currentUser()?.id || 'default-user';
  }
  await auth.waitForInitialization();
  const user = auth.currentUser();
  if (!user?.id) {
    throw new Error('Sesión no autenticada: inicie sesión para continuar');
  }
  return user.id;
}
