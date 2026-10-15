import { Injectable, inject } from '@angular/core';
import {
  FINANCIAL_ACCOUNT_REPOSITORY,
  CreateAccountDTO,
} from '../repositories/financial-repositories.contract';
import { FinancialAccount, FinancialInstitution } from '../models/financial-v2.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class FinancialAccountsService {
  private readonly repo = inject(FINANCIAL_ACCOUNT_REPOSITORY);
  private readonly auth = inject(AuthService);

  private get userId(): string {
    return this.auth.currentUser()?.id || 'default-user';
  }

  async getInstitutions(): Promise<FinancialInstitution[]> {
    return this.repo.getInstitutions(this.userId);
  }

  async createInstitution(name: string, type: FinancialInstitution['type']): Promise<FinancialInstitution> {
    if (!name || name.trim().length === 0) {
      throw new Error('El nombre de la institución es obligatorio');
    }
    return this.repo.createInstitution(this.userId, name, type);
  }

  async getAccounts(): Promise<FinancialAccount[]> {
    return this.repo.getAccounts(this.userId);
  }

  async getAccountById(accountId: string): Promise<FinancialAccount | null> {
    return this.repo.getAccountById(this.userId, accountId);
  }

  async createAccount(dto: CreateAccountDTO): Promise<FinancialAccount> {
    if (!dto.name || dto.name.trim().length === 0) {
      throw new Error('El nombre de la cuenta es obligatorio');
    }
    if (dto.initialBalance < 0) {
      throw new Error('El saldo inicial no puede ser negativo');
    }
    return this.repo.createAccount(this.userId, dto);
  }

  async archiveAccount(accountId: string): Promise<void> {
    return this.repo.archiveAccount(this.userId, accountId);
  }
}
