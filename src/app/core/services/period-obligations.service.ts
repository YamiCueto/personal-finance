import { Injectable, inject } from '@angular/core';
import {
  PERIOD_OBLIGATION_REPOSITORY,
  CreateObligationDTO,
  RecordPaymentDTO,
  FinancialOperationResult,
} from '../repositories/financial-repositories.contract';
import { PeriodObligation } from '../models/financial-v2.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class PeriodObligationsService {
  private readonly repo = inject(PERIOD_OBLIGATION_REPOSITORY);
  private readonly auth = inject(AuthService);

  // Registro de intenciones de pago en progreso para prevenir doble clic
  private activePaymentIntents = new Set<string>();

  private get userId(): string {
    return this.auth.currentUser()?.id || 'default-user';
  }

  async getPeriodObligations(year: number, month: number): Promise<PeriodObligation[]> {
    return this.repo.getPeriodObligations(this.userId, year, month);
  }

  async getObligationById(obligationId: string): Promise<PeriodObligation | null> {
    return this.repo.getObligationById(this.userId, obligationId);
  }

  async createPeriodObligation(dto: CreateObligationDTO): Promise<PeriodObligation> {
    if (!dto.name || dto.name.trim().length === 0) {
      throw new Error('El nombre de la obligación es obligatorio');
    }
    if (dto.amount <= 0) {
      throw new Error('El monto de la obligación debe ser mayor a 0');
    }
    return this.repo.createPeriodObligation(this.userId, dto);
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
      // Si no se proporcionó una clave de idempotencia, generar una determinista por intención
      const idempotencyKey = dto.idempotencyKey || `pay-${dto.obligationId}-${Date.now()}`;
      return await this.repo.recordPayment(this.userId, {
        ...dto,
        idempotencyKey,
      });
    } finally {
      this.activePaymentIntents.delete(intentKey);
    }
  }
}
