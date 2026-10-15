import { Injectable, inject } from '@angular/core';
import {
  TRANSACTIONAL_OPERATION_REPOSITORY,
  RecordTransferDTO,
  ReverseOperationDTO,
  FinancialOperationResult,
} from '../repositories/financial-repositories.contract';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class FinancialOperationsService {
  private readonly repo = inject(TRANSACTIONAL_OPERATION_REPOSITORY);
  private readonly auth = inject(AuthService);

  private activeTransferIntents = new Set<string>();

  private get userId(): string {
    return this.auth.currentUser()?.id || 'default-user';
  }

  async recordTransfer(dto: RecordTransferDTO): Promise<FinancialOperationResult> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new Error('La cuenta origen y destino deben ser distintas');
    }
    if (dto.amount <= 0) {
      throw new Error('El monto de la transferencia debe ser mayor a 0');
    }

    const intentKey = `${dto.fromAccountId}->${dto.toAccountId}:${dto.amount}`;
    if (this.activeTransferIntents.has(intentKey)) {
      throw new Error('Ya hay una transferencia en proceso entre estas dos cuentas. Por favor espere.');
    }

    this.activeTransferIntents.add(intentKey);

    try {
      const idempotencyKey = dto.idempotencyKey || `tr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      return await this.repo.recordTransfer(this.userId, {
        ...dto,
        idempotencyKey,
      });
    } finally {
      this.activeTransferIntents.delete(intentKey);
    }
  }

  async reverseOperation(dto: ReverseOperationDTO): Promise<FinancialOperationResult> {
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new Error('Debe indicarse un motivo justificativo para el reverso financiero');
    }
    return this.repo.reverseOperation(this.userId, dto);
  }
}
