import { Injectable, inject } from '@angular/core';
import {
  PERIOD_OBLIGATION_REPOSITORY,
  CreateObligationDTO,
  RecordPaymentDTO,
  FinancialOperationResult,
} from '../repositories/financial-repositories.contract';
import { PeriodObligation } from '../models/financial-v2.model';
import { AuthService } from './auth.service';
import { FINANCIAL_CONFIG } from '../config/financial.config';
import { resolveUserId } from '../utils/resolve-user-id';

@Injectable({
  providedIn: 'root',
})
export class PeriodObligationsService {
  private readonly repo = inject(PERIOD_OBLIGATION_REPOSITORY);
  private readonly auth = inject(AuthService);
  private readonly config = inject(FINANCIAL_CONFIG);

  private activePaymentIntents = new Set<string>();

  private resolveUserId(): Promise<string> {
    return resolveUserId(this.auth, this.config);
  }

  async getPeriodObligations(year: number, month: number): Promise<PeriodObligation[]> {
    return this.repo.getPeriodObligations(await this.resolveUserId(), year, month);
  }

  async getObligationById(obligationId: string): Promise<PeriodObligation | null> {
    return this.repo.getObligationById(await this.resolveUserId(), obligationId);
  }

  async createPeriodObligation(dto: CreateObligationDTO): Promise<PeriodObligation> {
    if (!dto.name || dto.name.trim().length === 0) {
      throw new Error('El nombre de la obligación es obligatorio');
    }
    if (dto.amount <= 0) {
      throw new Error('El monto de la obligación debe ser mayor a 0');
    }
    return this.repo.createPeriodObligation(await this.resolveUserId(), dto);
  }

  async recordPayment(dto: RecordPaymentDTO): Promise<FinancialOperationResult> {
    if (dto.amount <= 0) {
      throw new Error('El monto del pago debe ser mayor a 0');
    }

    const intentKey = `${dto.obligationId}:${dto.accountId}:${dto.amount}`;
    if (this.activePaymentIntents.has(intentKey)) {
      throw new Error('Ya hay una solicitud de pago en proceso para este compromiso. Por favor espere.');
    }

    this.activePaymentIntents.add(intentKey);

    try {
      const userId = await this.resolveUserId();
      const idempotencyKey = dto.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pay-${dto.obligationId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      return await this.repo.recordPayment(userId, {
        ...dto,
        idempotencyKey,
      });
    } finally {
      this.activePaymentIntents.delete(intentKey);
    }
  }
}
