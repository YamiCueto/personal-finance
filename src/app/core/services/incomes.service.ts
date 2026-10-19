import { Injectable, inject } from '@angular/core';
import {
  INCOME_REPOSITORY,
  CreateIncomeDTO,
  FinancialOperationResult,
} from '../repositories/financial-repositories.contract';
import { Income } from '../models/financial-v2.model';
import { AuthService } from './auth.service';
import { FINANCIAL_CONFIG } from '../config/financial.config';
import { resolveUserId } from '../utils/resolve-user-id';

@Injectable({
  providedIn: 'root',
})
export class IncomesService {
  private readonly repo = inject(INCOME_REPOSITORY);
  private readonly auth = inject(AuthService);
  private readonly config = inject(FINANCIAL_CONFIG);

  private activeIncomeIntents = new Set<string>();

  private resolveUserId(): Promise<string> {
    return resolveUserId(this.auth, this.config);
  }

  async getIncomes(year: number, month: number): Promise<Income[]> {
    return this.repo.getIncomes(await this.resolveUserId(), year, month);
  }

  async recordIncome(dto: CreateIncomeDTO): Promise<FinancialOperationResult> {
    if (dto.amount <= 0) {
      throw new Error('El monto del ingreso debe ser mayor a 0');
    }
    if (!dto.sourceName || dto.sourceName.trim().length === 0) {
      throw new Error('La fuente o concepto del ingreso es obligatoria');
    }

    const intentKey = `${dto.periodYear}-${dto.periodMonth}:${dto.sourceName}:${dto.amount}`;
    if (this.activeIncomeIntents.has(intentKey)) {
      throw new Error('Ya se está procesando un ingreso idéntico en este instante.');
    }

    this.activeIncomeIntents.add(intentKey);

    try {
      const userId = await this.resolveUserId();
      const idempotencyKey = dto.idempotencyKey || `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      return await this.repo.recordIncome(userId, {
        ...dto,
        idempotencyKey,
      });
    } finally {
      this.activeIncomeIntents.delete(intentKey);
    }
  }
}
