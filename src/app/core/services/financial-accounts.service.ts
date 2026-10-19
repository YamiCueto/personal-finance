import { Injectable, inject } from '@angular/core';
import {
  FINANCIAL_ACCOUNT_REPOSITORY,
  CreateAccountDTO,
} from '../repositories/financial-repositories.contract';
import { FinancialAccount, FinancialInstitution } from '../models/financial-v2.model';
import { AuthService } from './auth.service';
import { FINANCIAL_CONFIG } from '../config/financial.config';
import { resolveUserId } from '../utils/resolve-user-id';

@Injectable({
  providedIn: 'root',
})
export class FinancialAccountsService {
  private readonly repo = inject(FINANCIAL_ACCOUNT_REPOSITORY);
  private readonly auth = inject(AuthService);
  private readonly config = inject(FINANCIAL_CONFIG);

  private resolveUserId(): Promise<string> {
    return resolveUserId(this.auth, this.config);
  }

  async getInstitutions(): Promise<FinancialInstitution[]> {
    return this.repo.getInstitutions(await this.resolveUserId());
  }

  async createInstitution(name: string, type: FinancialInstitution['type']): Promise<FinancialInstitution> {
    if (!name || name.trim().length === 0) {
      throw new Error('El nombre de la institución es obligatorio');
    }
    return this.repo.createInstitution(await this.resolveUserId(), name, type);
  }

  async getAccounts(): Promise<FinancialAccount[]> {
    return this.repo.getAccounts(await this.resolveUserId());
  }

  async getAccountById(accountId: string): Promise<FinancialAccount | null> {
    return this.repo.getAccountById(await this.resolveUserId(), accountId);
  }

  async createAccount(dto: CreateAccountDTO): Promise<FinancialAccount> {
    if (!dto.name || dto.name.trim().length === 0) {
      throw new Error('El nombre de la cuenta es obligatorio');
    }
    if (dto.initialBalance < 0) {
      throw new Error('El saldo inicial no puede ser negativo');
    }
    return this.repo.createAccount(await this.resolveUserId(), dto);
  }

  async archiveAccount(accountId: string): Promise<void> {
    return this.repo.archiveAccount(await this.resolveUserId(), accountId);
  }
}
