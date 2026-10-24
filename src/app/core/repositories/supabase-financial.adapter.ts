import { Injectable, inject } from '@angular/core';
import { DebtHistory, DebtReconciliation, ExistingDebtInput, ReconcileDebtInput, validateExistingDebt } from '../models/debt-tracking.model';
import { ObligationPayment } from '../models/financial-v2.model';
import { SupabaseService } from '../services/supabase.service';
import {
  AccountHistorySummary,
  DeleteAccountOptions,
  FinancialAccount,
  FinancialAccountDeletionAudit,
  FinancialAuditLogEntry,
  FinancialInstitution,
  CreditProduct,
  PeriodObligation,
  Income,
  InternalAccountTransfer,
  CreditCardPurchase,
} from '../models/financial-v2.model';
import {
  CreateAccountDTO,
  CreateCreditProductDTO,
  CreateCreditCardPurchaseDTO,
  GenerateInstallmentDTO,
  CreateIncomeDTO,
  CreateObligationDTO,
  FinancialOperationResult,
  ICreditProductRepository,
  IFinancialAccountRepository,
  IIncomeRepository,
  IPeriodObligationRepository,
  ITransactionalOperationRepository,
  RecordPaymentDTO,
  RecordRestructureDTO,
  RecordTransferDTO,
  ReverseOperationDTO,
} from './financial-repositories.contract';
import { FinancialCalculatorV2 } from '../services/financial-calculator-v2';

/**
 * Adaptador Remoto de Supabase.
 *
 * Arquitectura:
 * - Implementa los contratos de repositorio utilizando el cliente oficial de Supabase.
 * - Toda mutación monetaria se realiza exclusivamente a través de llamadas RPC (`supabase.rpc`)
 *   hacia las funciones PostgreSQL `SECURITY DEFINER` blindadas en V2 (`record_obligation_payment`,
 *   `record_internal_transfer`, `record_income`, `reverse_operation`, `record_debt_restructure`).
 * - Nunca ejecuta múltiples actualizaciones atómicas dispersas desde el frontend de Angular.
 * - El aislamiento multi-inquilino está gobernado en la base de datos por PostgreSQL RLS y `auth.uid()`.
 *
 * SEGURIDAD Y RESTRICCIÓN:
 * - Este adaptador está preparado arquitectónicamente para el momento en que se habilite la conexión remota,
 *   pero durante esta fase NO debe ejecutarse contra la base de datos principal de Supabase.
 */
@Injectable({
  providedIn: 'root',
})
export class SupabaseFinancialAdapter
  implements
    IFinancialAccountRepository,
    ICreditProductRepository,
    IPeriodObligationRepository,
    IIncomeRepository,
    ITransactionalOperationRepository
{
  private readonly supabase = inject(SupabaseService);

  private get client() {
    return this.supabase.clientInstance;
  }

  // --- REPOSITORIO DE CUENTAS ---

  async getInstitutions(userId: string): Promise<FinancialInstitution[]> {
    const { data, error } = await this.client
      .from('institutions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map(this.mapInstitution);
  }

  async createInstitution(userId: string, name: string, type: FinancialInstitution['type']): Promise<FinancialInstitution> {
    const { data, error } = await this.client
      .from('institutions')
      .insert({ user_id: userId, name, type, is_active: true })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapInstitution(data);
  }

  async getAccounts(userId: string): Promise<FinancialAccount[]> {
    const { data, error } = await this.client
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map(this.mapAccount);
  }

  async getAccountById(userId: string, accountId: string): Promise<FinancialAccount | null> {
    const { data, error } = await this.client
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('id', accountId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapAccount(data) : null;
  }

  async createAccount(userId: string, dto: CreateAccountDTO): Promise<FinancialAccount> {
    const { data, error } = await this.client
      .from('accounts')
      .insert({
        user_id: userId,
        institution_id: dto.institutionId,
        name: dto.name,
        type: dto.type,
        currency: 'COP',
        initial_balance: dto.initialBalance,
        current_balance: dto.initialBalance,
        statement_cutoff_day: dto.statementCutoffDay,
        color: dto.color,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapAccount(data);
  }

  async archiveAccount(userId: string, accountId: string, idempotencyKey?: string): Promise<void> {
    const payload: Record<string, unknown> = {
      p_user_id: userId,
      p_account_id: accountId,
    };
    if (idempotencyKey !== undefined) {
      payload['p_idempotency_key'] = idempotencyKey;
    }
    const { error } = await this.client.rpc('archive_financial_account', payload);
    if (error) throw new Error(error.message);
  }

  async restoreAccount(userId: string, accountId: string, idempotencyKey?: string): Promise<void> {
    const payload: Record<string, unknown> = {
      p_user_id: userId,
      p_account_id: accountId,
    };
    if (idempotencyKey !== undefined) {
      payload['p_idempotency_key'] = idempotencyKey;
    }
    const { error } = await this.client.rpc('restore_financial_account', payload);
    if (error) throw new Error(error.message);
  }

  async deleteAccount(userId: string, accountId: string, options?: DeleteAccountOptions): Promise<void> {
    const payload: Record<string, unknown> = {
      p_user_id: userId,
      p_account_id: accountId,
    };
    if (options?.reason !== undefined) {
      payload['p_reason'] = options.reason;
    }
    if (options?.operationId !== undefined) {
      payload['p_operation_id'] = options.operationId;
    }
    const { error } = await this.client.rpc('delete_financial_account', payload);
    if (error) throw new Error(error.message);
  }

  async getAccountDeletionAudit(userId: string): Promise<FinancialAccountDeletionAudit[]> {
    const { data, error } = await this.client
      .from('financial_account_deletion_audit')
      .select('*')
      .eq('owner_user_id', userId)
      .order('deleted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((raw: any) => this.mapAccountDeletionAudit(raw));
  }

  async getAccountAuditTrail(userId: string, accountId?: string): Promise<FinancialAuditLogEntry[]> {
    let query = this.client
      .from('financial_audit_log')
      .select('*')
      .eq('user_id', userId)
      .eq('entity_type', 'accounts')
      .order('created_at', { ascending: false });
    if (accountId) {
      query = query.eq('entity_id', accountId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map((raw: any) => this.mapFinancialAuditLog(raw));
  }

  async getAccountHistory(userId: string, accountId: string): Promise<AccountHistorySummary> {
    const [incomesRes, paymentsRes, transfersRes, auditRes] = await Promise.all([
      this.client.from('incomes').select('*').eq('user_id', userId).eq('account_id', accountId).order('received_date', { ascending: false }),
      this.client.from('obligation_payments').select('*').eq('user_id', userId).eq('account_id', accountId).order('payment_date', { ascending: false }),
      this.client.from('internal_transfers').select('*').eq('user_id', userId).or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`).order('transfer_date', { ascending: false }),
      this.getAccountAuditTrail(userId, accountId),
    ]);
    if (incomesRes.error || paymentsRes.error || transfersRes.error) {
      throw new Error((incomesRes.error || paymentsRes.error || transfersRes.error)!.message);
    }
    return {
      accountId,
      incomes: (incomesRes.data || []).map(this.mapIncome),
      payments: (paymentsRes.data || []).map((raw: any) => this.mapObligationPayment(raw)),
      transfers: (transfersRes.data || []).map((raw: any) => this.mapInternalTransfer(raw)),
      auditTrail: auditRes,
    };
  }

  // --- REPOSITORIO DE CRÉDITOS ---

  async getCreditProducts(userId: string): Promise<CreditProduct[]> {
    const { data, error } = await this.client
      .from('credit_products')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map(this.mapCreditProduct);
  }

  async registerExistingDebt(userId: string, dto: ExistingDebtInput): Promise<CreditProduct> {
    validateExistingDebt(dto);
    const { data, error } = await this.client.rpc('register_existing_debt', { p_user_id: userId, p_input: dto });
    if (error) throw new Error(error.message);
    return this.mapCreditProduct(data);
  }

  async getDebtHistory(userId: string, creditId: string): Promise<DebtHistory> {
    const { data: obligations, error } = await this.client.from('period_obligations').select('*').eq('user_id', userId).eq('credit_product_id', creditId).order('period_year').order('period_month');
    if (error) throw new Error(error.message);
    const ids = (obligations || []).map(o => o.id);
    const [payments, reconciliations] = await Promise.all([
      ids.length ? this.client.from('obligation_payments').select('*').eq('user_id', userId).in('obligation_id', ids).order('payment_date') : Promise.resolve({ data: [], error: null }),
      this.client.from('debt_reconciliations').select('*').eq('user_id', userId).eq('credit_product_id', creditId).order('statement_date'),
    ]);
    if (payments.error || reconciliations.error) throw new Error((payments.error || reconciliations.error)!.message);
    return {
      obligations: (obligations || []).map(this.mapPeriodObligation),
      payments: (payments.data || []).map(raw => this.mapObligationPayment(raw)),
      reconciliations: (reconciliations.data || []).map(raw => this.mapDebtReconciliation(raw)),
    };
  }

  async reconcileDebt(userId: string, dto: ReconcileDebtInput): Promise<DebtReconciliation> {
    const { data, error } = await this.client.rpc('reconcile_debt', { p_user_id: userId, p_input: dto });
    if (error) throw new Error(error.message);
    return this.mapDebtReconciliation(data);
  }

  private toFiniteMoney(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private mapObligationPayment(raw: any): ObligationPayment {
    return {
      id: String(raw.id || ''),
      userId: String(raw.user_id || raw.userId || ''),
      obligationId: String(raw.obligation_id || raw.obligationId || ''),
      accountId: String(raw.account_id || raw.accountId || ''),
      amount: this.toFiniteMoney(raw.amount),
      paymentType: raw.payment_type || raw.paymentType || 'REGULAR_INSTALLMENT',
      paymentDate: String(raw.payment_date || raw.paymentDate || '').slice(0, 10),
      appliedToCapital: this.toFiniteMoney(raw.applied_to_capital ?? raw.appliedToCapital),
      appliedToInterest: this.toFiniteMoney(raw.applied_to_interest ?? raw.appliedToInterest),
      appliedToInsurance: this.toFiniteMoney(raw.applied_to_insurance ?? raw.appliedToInsurance),
      appliedToFees: this.toFiniteMoney(raw.applied_to_fees ?? raw.appliedToFees),
      referenceNumber: raw.reference_number ?? raw.referenceNumber ?? undefined,
      idempotencyKey: raw.idempotency_key ?? raw.idempotencyKey ?? undefined,
      isReversed: Boolean(raw.is_reversed ?? raw.isReversed),
      reversedAt: raw.reversed_at ?? raw.reversedAt ?? undefined,
      reversalReason: raw.reversal_reason ?? raw.reversalReason ?? undefined,
      notes: raw.notes ?? undefined,
      createdAt: String(raw.created_at || raw.createdAt || ''),
    };
  }

  private mapDebtReconciliation(raw: any): DebtReconciliation {
    return {
      id: String(raw.id || ''),
      userId: String(raw.user_id || raw.userId || ''),
      creditProductId: String(raw.credit_product_id || raw.creditProductId || ''),
      statementDate: String(raw.statement_date || raw.statementDate || '').slice(0, 10),
      calculatedBalance: this.toFiniteMoney(raw.calculated_balance ?? raw.calculatedBalance),
      reportedBalance: this.toFiniteMoney(raw.reported_balance ?? raw.reportedBalance),
      difference: this.toFiniteMoney(raw.difference),
      reason: String(raw.reason || ''),
      idempotencyKey: String(raw.idempotency_key || raw.idempotencyKey || ''),
      createdAt: String(raw.created_at || raw.createdAt || ''),
    };
  }

  private mapAccountDeletionAudit(raw: any): FinancialAccountDeletionAudit {
    return {
      id: String(raw.id || ''),
      accountId: String(raw.account_id || raw.accountId || ''),
      accountName: String(raw.account_name || raw.accountName || ''),
      institutionId: raw.institution_id ?? raw.institutionId ?? undefined,
      accountType: raw.account_type || raw.accountType || 'SAVINGS',
      ownerUserId: String(raw.owner_user_id || raw.ownerUserId || ''),
      deletedBy: String(raw.deleted_by || raw.deletedBy || ''),
      deletedAt: String(raw.deleted_at || raw.deletedAt || ''),
      deletionReason: raw.deletion_reason ?? raw.deletionReason ?? undefined,
      operationId: String(raw.operation_id || raw.operationId || ''),
      metadata: typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {},
      isSimulatedLocal: false,
    };
  }

  private mapFinancialAuditLog(raw: any): FinancialAuditLogEntry {
    return {
      id: String(raw.id || ''),
      userId: String(raw.user_id || raw.userId || ''),
      eventType: String(raw.event_type || raw.eventType || ''),
      entityType: String(raw.entity_type || raw.entityType || ''),
      entityId: String(raw.entity_id || raw.entityId || ''),
      amount: raw.amount != null ? this.toFiniteMoney(raw.amount) : undefined,
      idempotencyKey: raw.idempotency_key ?? raw.idempotencyKey ?? undefined,
      payload: typeof raw.payload === 'object' && raw.payload !== null ? raw.payload : {},
      createdAt: String(raw.created_at || raw.createdAt || ''),
      isSimulatedLocal: false,
    };
  }

  private mapInternalTransfer(raw: any): InternalAccountTransfer {
    return {
      id: String(raw.id || ''),
      userId: String(raw.user_id || raw.userId || ''),
      fromAccountId: String(raw.from_account_id || raw.fromAccountId || ''),
      toAccountId: String(raw.to_account_id || raw.toAccountId || ''),
      amount: this.toFiniteMoney(raw.amount),
      feeAmount: this.toFiniteMoney(raw.fee_amount ?? raw.feeAmount),
      transferDate: String(raw.transfer_date || raw.transferDate || '').slice(0, 10),
      idempotencyKey: raw.idempotency_key ?? raw.idempotencyKey ?? undefined,
      isReversed: Boolean(raw.is_reversed ?? raw.isReversed),
      reversedAt: raw.reversed_at ?? raw.reversedAt ?? undefined,
      reversalReason: raw.reversal_reason ?? raw.reversalReason ?? undefined,
      notes: raw.notes ?? undefined,
      createdAt: String(raw.created_at || raw.createdAt || ''),
    };
  }

  async getCreditProductById(userId: string, creditId: string): Promise<CreditProduct | null> {
    const { data, error } = await this.client
      .from('credit_products')
      .select('*')
      .eq('user_id', userId)
      .eq('id', creditId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapCreditProduct(data) : null;
  }

  async createCreditProduct(userId: string, dto: CreateCreditProductDTO): Promise<CreditProduct> {
    const { data, error } = await this.client
      .from('credit_products')
      .insert({
        user_id: userId,
        institution_id: dto.institutionId,
        name: dto.name,
        type: dto.type,
        original_principal: dto.originalPrincipal,
        current_principal_balance: dto.originalPrincipal,
        nominal_rate_monthly: dto.nominalRateMonthly,
        effective_annual_rate: dto.effectiveAnnualRate,
        total_installments: dto.totalInstallments,
        remaining_installments: dto.totalInstallments,
        amortization_method: dto.amortizationMethod || 'FRENCH',
        associated_insurances_monthly: dto.associatedInsurancesMonthly || 0,
        approved_credit_limit: dto.approvedCreditLimit,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapCreditProduct(data);
  }

  async recordRestructure(userId: string, dto: RecordRestructureDTO): Promise<FinancialOperationResult> {
    const { data, error } = await this.client.rpc('record_debt_restructure', {
      p_user_id: userId,
      p_credit_product_id: dto.creditProductId,
      p_new_principal_balance: dto.newPrincipalBalance,
      p_new_effective_annual_rate: dto.newEffectiveAnnualRate,
      p_new_total_installments: dto.newTotalInstallments,
      p_refinancing_fees: dto.refinancingFees || 0,
      p_reason: dto.reason,
    });

    if (error) throw new Error(error.message);
    return {
      success: data.success,
      operationId: data.event_id,
      newBalance: data.new_principal_balance,
      message: 'Reestructuración aplicada exitosamente',
    };
  }

  async getCreditCardPurchases(userId: string, creditCardId?: string): Promise<CreditCardPurchase[]> {
    let query = this.client
      .from('credit_card_purchases')
      .select('*')
      .eq('user_id', userId)
      .order('purchase_date', { ascending: false });

    if (creditCardId) {
      query = query.eq('product_id', creditCardId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(this.mapCreditCardPurchase);
  }

  async createCreditCardPurchase(userId: string, dto: CreateCreditCardPurchaseDTO): Promise<CreditCardPurchase> {
    const { data, error } = await this.client.rpc('create_credit_card_purchase', {
      p_user_id: userId,
      p_credit_card_id: dto.creditCardId,
      p_description: dto.description,
      p_amount: dto.amount,
      p_total_installments: dto.totalInstallments,
      p_interest_rate_monthly: dto.interestRateMonthly ?? null,
      p_purchase_date: dto.purchaseDate ?? new Date().toISOString().substring(0, 10),
      p_idempotency_key: dto.idempotencyKey ?? null,
    });

    if (error) throw new Error(error.message);

    const { data: purchase, error: fetchError } = await this.client
      .from('credit_card_purchases')
      .select('*')
      .eq('id', data.purchase_id)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    return this.mapCreditCardPurchase(purchase);
  }

  async generateCreditInstallmentObligation(userId: string, dto: GenerateInstallmentDTO): Promise<PeriodObligation> {
    const product = await this.getCreditProductById(userId, dto.creditProductId);
    if (!product) {
      throw new Error('Producto de crédito no encontrado o no pertenece al usuario');
    }
    if (product.trackingStartDate) {
      const { data, error } = await this.client.rpc('generate_tracked_installment', { p_user_id: userId, p_credit_product_id: product.id, p_year: dto.periodYear, p_month: dto.periodMonth });
      if (error) throw new Error(error.message);
      return this.mapPeriodObligation(data);
    }

    const { data: existing, error: existingError } = await this.client
      .from('period_obligations')
      .select('*')
      .eq('user_id', userId)
      .eq('credit_product_id', dto.creditProductId)
      .eq('period_year', dto.periodYear)
      .eq('period_month', dto.periodMonth)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) return this.mapPeriodObligation(existing);

    let obName = '';
    let totalAmount = 0;
    let capitalComp = 0;
    let interestComp = 0;
    let insuranceComp = 0;
    let feesComp = 0;

    if (product.type === 'CREDIT_CARD') {
      const purchases = await this.getCreditCardPurchases(userId, product.id);
      const pendingPurchases = purchases.filter((p) => p.status === 'PENDING');
      const statement = FinancialCalculatorV2.calculateCreditCardStatement(pendingPurchases, product.managementFeeMonthly || 0);

      obName = `Extracto Tarjeta ${product.name} (${dto.periodMonth}/${dto.periodYear})`;
      totalAmount = statement.totalStatementAmount;
      capitalComp = statement.totalCapitalPayment;
      interestComp = statement.totalInterestPayment;
      insuranceComp = product.associatedInsurancesMonthly || 0;
      feesComp = statement.managementFee;
      totalAmount = FinancialCalculatorV2.fromCents(
        FinancialCalculatorV2.toCents(totalAmount) + FinancialCalculatorV2.toCents(insuranceComp)
      );
    } else {
      const remainingN = product.remainingInstallments || 12;
      const totalN = product.totalInstallments || 12;
      const installmentNum = totalN - remainingN + 1;

      let scheduleItem: any;
      if (product.amortizationMethod === 'GERMAN') {
        const schedule = FinancialCalculatorV2.generateGermanAmortizationSchedule(
          product.currentPrincipalBalance,
          product.nominalRateMonthly,
          remainingN,
          product.associatedInsurancesMonthly || 0
        );
        scheduleItem = schedule[0];
      } else {
        const schedule = FinancialCalculatorV2.generateFrenchAmortizationSchedule(
          product.currentPrincipalBalance,
          product.nominalRateMonthly,
          remainingN,
          product.associatedInsurancesMonthly || 0
        );
        scheduleItem = schedule[0];
      }

      if (!scheduleItem) {
        throw new Error('No se puede generar cuota: el crédito ya no tiene saldo pendiente');
      }

      obName = `Cuota ${installmentNum}/${totalN} ${product.name}`;
      totalAmount = scheduleItem.totalPayment;
      capitalComp = scheduleItem.principalPayment;
      interestComp = scheduleItem.interestPayment;
      insuranceComp = scheduleItem.insurancePayment;
      feesComp = product.managementFeeMonthly || 0;
    }

    const dueDay = product.paymentDueDay || product.duePaymentDay || product.statementCutoffDay || 15;
    const computedDueDate = dto.dueDate || `${dto.periodYear}-${String(dto.periodMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

    const { data: insertedOb, error: insertError } = await this.client
      .from('period_obligations')
      .insert({
        user_id: userId,
        credit_product_id: dto.creditProductId,
        source_type: 'CREDIT_INSTALLMENT',
        period_year: dto.periodYear,
        period_month: dto.periodMonth,
        name: obName,
        amount: totalAmount,
        amount_paid: 0,
        amount_pending: totalAmount,
        status: 'PENDING',
        due_date: computedDueDate,
        capital_component: capitalComp,
        interest_current_component: interestComp,
        interest_mora_component: 0,
        insurance_component: insuranceComp,
        other_fees_component: feesComp,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: deduped, error: dedupError } = await this.client
          .from('period_obligations')
          .select('*')
          .eq('user_id', userId)
          .eq('credit_product_id', dto.creditProductId)
          .eq('period_year', dto.periodYear)
          .eq('period_month', dto.periodMonth)
          .maybeSingle();
        if (dedupError) throw new Error(dedupError.message);
        if (deduped) return this.mapPeriodObligation(deduped);
      }
      throw new Error(insertError.message);
    }

    return this.mapPeriodObligation(insertedOb);
  }

  // --- REPOSITORIO DE OBLIGACIONES Y PAGOS RPC ---

  async getPeriodObligations(userId: string, year: number, month: number): Promise<PeriodObligation[]> {
    const { data, error } = await this.client
      .from('period_obligations')
      .select('*')
      .eq('user_id', userId)
      .eq('period_year', year)
      .eq('period_month', month)
      .order('order_index', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map(this.mapPeriodObligation);
  }

  async getObligationById(userId: string, obligationId: string): Promise<PeriodObligation | null> {
    const { data, error } = await this.client
      .from('period_obligations')
      .select('*')
      .eq('user_id', userId)
      .eq('id', obligationId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapPeriodObligation(data) : null;
  }

  async createPeriodObligation(userId: string, dto: CreateObligationDTO): Promise<PeriodObligation> {
    const { data, error } = await this.client
      .from('period_obligations')
      .insert({
        user_id: userId,
        credit_product_id: dto.creditProductId,
        source_type: dto.sourceType,
        period_year: dto.periodYear,
        period_month: dto.periodMonth,
        name: dto.name,
        amount: dto.amount,
        amount_paid: 0,
        amount_pending: dto.amount,
        status: 'PENDING',
        due_date: dto.dueDate,
        capital_component: dto.capitalComponent || dto.amount,
        interest_current_component: dto.interestCurrentComponent || 0,
        insurance_component: dto.insuranceComponent || 0,
        notes: dto.notes,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapPeriodObligation(data);
  }

  async recordPayment(userId: string, dto: RecordPaymentDTO): Promise<FinancialOperationResult> {
    const { data, error } = await this.client.rpc('record_obligation_payment', {
      p_user_id: userId,
      p_obligation_id: dto.obligationId,
      p_account_id: dto.accountId,
      p_amount: dto.amount,
      p_payment_type: dto.paymentType || 'REGULAR_INSTALLMENT',
      p_idempotency_key: dto.idempotencyKey || null,
      p_applied_to_capital: dto.allocation?.appliedToCapital ?? null,
      p_applied_to_interest: dto.allocation?.appliedToInterest ?? null,
      p_applied_to_insurance: dto.allocation?.appliedToInsurance ?? null,
      p_applied_to_fees: dto.allocation?.appliedToFees ?? null,
      p_reference_number: dto.referenceNumber || null,
      p_notes: dto.notes || null,
      p_payment_date: dto.paymentDate || new Date().toISOString().slice(0, 10),
    });

    if (error) throw new Error(error.message);
    return {
      success: data.success,
      operationId: data.payment_id,
      isReplayed: data.is_replayed,
      appliedToCapital: data.applied_to_capital,
      appliedToInterest: data.applied_to_interest,
      message: data.message || 'Pago procesado exitosamente',
    };
  }

  // --- REPOSITORIO DE INGRESOS RPC ---

  async getIncomes(userId: string, year: number, month: number): Promise<Income[]> {
    const { data, error } = await this.client
      .from('incomes')
      .select('*')
      .eq('user_id', userId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('is_reversed', false)
      .order('received_date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map(this.mapIncome);
  }

  async recordIncome(userId: string, dto: CreateIncomeDTO): Promise<FinancialOperationResult> {
    const { data, error } = await this.client.rpc('record_income', {
      p_user_id: userId,
      p_account_id: dto.accountId || null,
      p_period_year: dto.periodYear,
      p_period_month: dto.periodMonth,
      p_source_name: dto.sourceName,
      p_amount: dto.amount,
      p_received_date: dto.receivedDate || new Date().toISOString().substring(0, 10),
      p_idempotency_key: dto.idempotencyKey || null,
      p_notes: dto.notes || null,
    });

    if (error) throw new Error(error.message);
    return {
      success: data.success,
      operationId: data.income_id,
      isReplayed: data.is_replayed,
      message: data.message || 'Ingreso registrado exitosamente',
    };
  }

  // --- REPOSITORIO DE OPERACIONES ATÓMICAS (TRANSFERENCIAS Y REVERSOS) ---

  async recordTransfer(userId: string, dto: RecordTransferDTO): Promise<FinancialOperationResult> {
    const { data, error } = await this.client.rpc('record_internal_transfer', {
      p_user_id: userId,
      p_from_account_id: dto.fromAccountId,
      p_to_account_id: dto.toAccountId,
      p_amount: dto.amount,
      p_fee_amount: dto.feeAmount || 0,
      p_idempotency_key: dto.idempotencyKey || null,
      p_notes: dto.notes || null,
    });

    if (error) throw new Error(error.message);
    return {
      success: data.success,
      operationId: data.transfer_id,
      isReplayed: data.is_replayed,
      message: data.message || 'Transferencia ejecutada con éxito',
    };
  }

  async reverseOperation(userId: string, dto: ReverseOperationDTO): Promise<FinancialOperationResult> {
    const { data, error } = await this.client.rpc('reverse_operation', {
      p_user_id: userId,
      p_operation_type: dto.operationType,
      p_operation_id: dto.operationId,
      p_reason: dto.reason,
    });

    if (error) throw new Error(error.message);
    return {
      success: data.success,
      operationId: data.reversal_id,
      message: 'Operación revertida exitosamente',
    };
  }

  // --- MAPPEADORES DE PERSISTENCIA A MODELOS DE DOMINIO ---

  private mapInstitution(raw: any): FinancialInstitution {
    return {
      id: raw.id,
      userId: raw.user_id,
      name: raw.name,
      code: raw.code,
      type: raw.type,
      websiteUrl: raw.website_url,
      phoneContact: raw.phone_contact,
      isActive: raw.is_active,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }

  private mapAccount(raw: any): FinancialAccount {
    return {
      id: raw.id,
      userId: raw.user_id,
      institutionId: raw.institution_id,
      name: raw.name,
      type: raw.type,
      currency: raw.currency || 'COP',
      initialBalance: Number(raw.initial_balance || 0),
      currentBalance: Number(raw.current_balance || 0),
      statementCutoffDay: raw.statement_cutoff_day,
      color: raw.color,
      isArchived: raw.is_archived || false,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }

  private mapCreditProduct(raw: any): CreditProduct {
    return {
      id: raw.id,
      userId: raw.user_id,
      institutionId: raw.institution_id,
      name: raw.name,
      type: raw.type,
      status: raw.status,
      originalPrincipal: raw.original_principal == null ? null : Number(raw.original_principal),
      trackingStartDate: raw.tracking_start_date,
      openingPrincipalBalance: raw.opening_principal_balance == null ? undefined : Number(raw.opening_principal_balance),
      nextDueDate: raw.next_due_date,
      agreedInstallment: raw.agreed_installment == null ? undefined : Number(raw.agreed_installment),
      knownInterestMonthly: raw.known_interest_monthly == null ? undefined : Number(raw.known_interest_monthly),
      obligationKind: raw.obligation_kind,
      interestRateKnown: raw.nominal_rate_monthly != null,
      notes: raw.notes,
      currentPrincipalBalance: Number(raw.current_principal_balance || 0),
      approvedCreditLimit: raw.approved_credit_limit ? Number(raw.approved_credit_limit) : undefined,
      usedCreditLimit: raw.used_credit_limit ? Number(raw.used_credit_limit) : undefined,
      availableCreditLimit: raw.available_credit_limit ? Number(raw.available_credit_limit) : undefined,
      disbursementDate: raw.disbursement_date,
      statementCutoffDay: raw.statement_cutoff_day,
      duePaymentDay: raw.due_payment_day,
      paymentDueDay: raw.due_payment_day,
      totalInstallments: raw.total_installments,
      remainingInstallments: raw.remaining_installments,
      nominalRateMonthly: Number(raw.nominal_rate_monthly || 0),
      effectiveAnnualRate: Number(raw.effective_annual_rate || 0),
      capitalizationPeriod: raw.capitalization_period || 'MONTHLY',
      amortizationMethod: raw.amortization_method || 'FRENCH',
      associatedInsurancesMonthly: Number(raw.associated_insurances_monthly || 0),
      managementFeeMonthly: Number(raw.management_fee_monthly || 0),
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }

  private mapPeriodObligation(raw: any): PeriodObligation {
    return {
      id: raw.id,
      userId: raw.user_id,
      creditProductId: raw.credit_product_id,
      recurrentObligationId: raw.recurrent_obligation_id,
      sourceType: raw.source_type,
      periodYear: raw.period_year,
      periodMonth: raw.period_month,
      name: raw.name,
      amount: Number(raw.amount || 0),
      dueDate: raw.due_date,
      orderIndex: raw.order_index,
      status: raw.status,
      capitalComponent: Number(raw.capital_component || 0),
      interestCurrentComponent: Number(raw.interest_current_component || 0),
      interestMoraComponent: Number(raw.interest_mora_component || 0),
      insuranceComponent: Number(raw.insurance_component || 0),
      otherFeesComponent: Number(raw.other_fees_component || 0),
      amountPaid: Number(raw.amount_paid || 0),
      amountPending: Number(raw.amount_pending || 0),
      notes: raw.notes,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }

  private mapIncome(raw: any): Income {
    return {
      id: raw.id,
      userId: raw.user_id,
      accountId: raw.account_id,
      periodYear: raw.period_year,
      periodMonth: raw.period_month,
      sourceName: raw.source_name,
      amount: Number(raw.amount || 0),
      receivedDate: raw.received_date,
      isReversed: raw.is_reversed || false,
      notes: raw.notes,
      createdAt: raw.created_at,
    };
  }

  private mapCreditCardPurchase(raw: any): CreditCardPurchase {
    return {
      id: raw.id,
      productId: raw.product_id,
      userId: raw.user_id,
      purchaseDate: raw.purchase_date,
      description: raw.description,
      originalAmount: Number(raw.original_amount || 0),
      totalInstallments: raw.total_installments,
      remainingInstallments: raw.remaining_installments,
      interestRateMonthly: Number(raw.interest_rate_monthly || 0),
      monthlyCapital: Number(raw.monthly_capital || 0),
      monthlyInterest: Number(raw.monthly_interest || 0),
      status: raw.status,
      createdAt: raw.created_at,
    };
  }
}
