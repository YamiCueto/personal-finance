import { Injectable, inject } from '@angular/core';
import {
  CREDIT_PRODUCT_REPOSITORY,
  CreateCreditProductDTO,
  CreateCreditCardPurchaseDTO,
  GenerateInstallmentDTO,
  FinancialOperationResult,
  RecordRestructureDTO,
} from '../repositories/financial-repositories.contract';
import { CreditProduct, CreditCardPurchase, PeriodObligation } from '../models/financial-v2.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class CreditProductsService {
  private readonly repo = inject(CREDIT_PRODUCT_REPOSITORY);
  private readonly auth = inject(AuthService);

  private get userId(): string {
    return this.auth.currentUser()?.id || 'default-user';
  }

  async getCreditProducts(): Promise<CreditProduct[]> {
    return this.repo.getCreditProducts(this.userId);
  }

  async getCreditProductById(creditId: string): Promise<CreditProduct | null> {
    return this.repo.getCreditProductById(this.userId, creditId);
  }

  async createCreditProduct(dto: CreateCreditProductDTO): Promise<CreditProduct> {
    if (!dto.name || dto.name.trim().length === 0) {
      throw new Error('El nombre del producto de crédito es obligatorio');
    }
    if (dto.type === 'CREDIT_CARD') {
      if (!dto.approvedCreditLimit || dto.approvedCreditLimit <= 0) {
        throw new Error('El cupo aprobado de la tarjeta de crédito debe ser mayor a 0');
      }
    } else {
      if (dto.originalPrincipal <= 0) {
        throw new Error('El monto del crédito debe ser mayor a 0');
      }
    }
    return this.repo.createCreditProduct(this.userId, dto);
  }

  async recordRestructure(dto: RecordRestructureDTO): Promise<FinancialOperationResult> {
    if (dto.newPrincipalBalance < 0) {
      throw new Error('El nuevo saldo de capital no puede ser negativo');
    }
    if (dto.newTotalInstallments <= 0) {
      throw new Error('El plazo de cuotas debe ser mayor a cero');
    }
    return this.repo.recordRestructure(this.userId, dto);
  }

  async getCreditCardPurchases(creditCardId?: string): Promise<CreditCardPurchase[]> {
    return this.repo.getCreditCardPurchases(this.userId, creditCardId);
  }

  async createCreditCardPurchase(dto: CreateCreditCardPurchaseDTO): Promise<CreditCardPurchase> {
    if (dto.amount <= 0) {
      throw new Error('El valor de la compra debe ser mayor a 0');
    }
    if (dto.totalInstallments < 1) {
      throw new Error('El número de cuotas debe ser como mínimo 1');
    }
    return this.repo.createCreditCardPurchase(this.userId, dto);
  }

  async generateCreditInstallmentObligation(dto: GenerateInstallmentDTO): Promise<PeriodObligation> {
    return this.repo.generateCreditInstallmentObligation(this.userId, dto);
  }
}
