import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalFinancialAdapter } from './local-financial.adapter';
import { ExistingDebtInput } from '../models/debt-tracking.model';
import { allocatePaymentCascade, debtOverallTotals, debtYearSummary } from '../services/debt-history';
import { FinancialFacade } from '../state/financial.facade';
import { provideFinancialCore } from '../providers/financial-core.provider';
import { AuthService } from '../services/auth.service';

describe('Deudas y cuentas: paridad del modo demo', () => {
  let repo: LocalFinancialAdapter;
  const user = 'empty-tracking';
  let input: ExistingDebtInput;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFinancialCore({providerMode: 'local-demo'}), { provide: AuthService, useValue: { currentUser: signal({id:user}) } }] });
    repo = TestBed.inject(LocalFinancialAdapter);
    repo.resetAll();
    const institution = await repo.createInstitution(user,'Entidad de prueba','BANK');
    input = { institutionId: institution.id, name: 'Vehículo', type: 'VEHICLE_LOAN', obligationKind: 'FINANCED_DEBT', openingPrincipalBalance: 18000000, trackingStartDate: '2026-10-24', nextDueDate: '2026-11-15', agreedInstallment: 750000, remainingInstallments: 24, knownInterestMonthly: 150000, insuranceMonthly: 30000, feesMonthly: 0, idempotencyKey: 'debt' };
  });

  async function scenario() {
    const product = await repo.registerExistingDebt(user,input);
    const account = await repo.createAccount(user,{name:'Fondos',type:'CASH',initialBalance:2000000});
    const obligation = await repo.generateCreditInstallmentObligation(user,{creditProductId:product.id,periodYear:2026,periodMonth:11});
    return { product, account, obligation };
  }

  it('registra saldo de corte, no inventa capital original y conserva doce meses por año', async () => {
    const {product} = await scenario();
    expect(product.originalPrincipal).toBeNull();
    const history = await repo.getDebtHistory(user,product.id);
    expect(history.payments).toHaveLength(0);
    const year = debtYearSummary(product,history,2026);
    expect(year.months).toHaveLength(12);
    expect(year.months[8].beforeTracking).toBe(true);
    expect(year.months[9].beforeTracking).toBe(false);
    expect(debtYearSummary(product,history,2027).opening).toBe(18000000);
  });

  it('impide cuotas anteriores, duplica solicitudes sin duplicar cuota ni deuda', async () => {
    const {product,obligation} = await scenario();
    expect((await repo.registerExistingDebt(user,input)).id).toBe(product.id);
    await expect(repo.registerExistingDebt(user,{...input,openingPrincipalBalance:1})).rejects.toThrow(/idempotencia/);
    await expect(repo.generateCreditInstallmentObligation(user,{creditProductId:product.id,periodYear:2026,periodMonth:9})).rejects.toThrow(/Sin historial/);
    expect((await repo.generateCreditInstallmentObligation(user,{creditProductId:product.id,periodYear:2026,periodMonth:11})).id).toBe(obligation.id);
  });

  it('ejemplo 750000 = capital 570000 + interés 150000 + seguro 30000; saldo 17430000', async () => {
    const {product,account,obligation} = await scenario();
    const dto = { obligationId:obligation.id,accountId:account.id,amount:750000,paymentDate:'2026-11-15',idempotencyKey:'payment',allocation:{appliedToCapital:570000,appliedToInterest:150000,appliedToInsurance:30000} };
    await repo.recordPayment(user,dto);
    expect((await repo.recordPayment(user,dto)).isReplayed).toBe(true);
    expect(product.currentPrincipalBalance).toBe(17430000);
    const facade = TestBed.inject(FinancialFacade);
    await facade.loadPeriodData({year:2026,month:11});
    expect(facade.netWorth()).toBe(-16180000);
    const history = await repo.getDebtHistory(user,product.id);
    expect(history.payments).toHaveLength(1);
    expect(debtYearSummary(product,history,2026).capital).toBe(570000);
    expect(debtYearSummary(product,history,2027).opening).toBe(17430000);
  });

  it('dos pagos parciales no vuelven a cobrar intereses ni seguro', async () => {
    const {product,account,obligation} = await scenario();
    for (const amount of [200000,550000]) await repo.recordPayment(user,{obligationId:obligation.id,accountId:account.id,amount,paymentDate:'2026-11-15'});
    expect(product.currentPrincipalBalance).toBe(17430000);
    expect(obligation.status).toBe('PAID');
    expect(product.remainingInstallments).toBe(23);
    await repo.recordPayment(user,{obligationId:obligation.id,accountId:account.id,amount:1000,paymentType:'PREPAYMENT_CAPITAL',paymentDate:'2026-11-16'});
    expect(product.remainingInstallments).toBe(23);
  });

  it('valida desglose y saldo antes de debitar la cuenta', async () => {
    const {product,account,obligation} = await scenario();
    await expect(repo.recordPayment(user,{obligationId:obligation.id,accountId:account.id,amount:10,allocation:{appliedToCapital:100}})).rejects.toThrow(/desglose/);
    expect(account.currentBalance).toBe(2000000);
    expect(product.currentPrincipalBalance).toBe(18000000);
  });

  it('reverso de abono extraordinario conserva cuota y registro; eliminación queda bloqueada', async () => {
    const {product,account,obligation} = await scenario();
    const payment = await repo.recordPayment(user,{obligationId:obligation.id,accountId:account.id,amount:100000,paymentType:'PREPAYMENT_CAPITAL',paymentDate:'2026-11-15'});
    await repo.reverseOperation(user,{operationType:'PAYMENT',operationId:payment.operationId,reason:'Corrección'});
    expect(product.currentPrincipalBalance).toBe(18000000);
    expect(obligation.amountPending).toBe(750000);
    expect((await repo.getDebtHistory(user,product.id)).payments[0].isReversed).toBe(true);
    await expect(repo.deleteAccount(user,account.id)).rejects.toThrow(/historial financiero/);
  });

  it('conciliación explícita cambia saldo con diferencia auditable y protege usuarios', async () => {
    const {product} = await scenario();
    const dto = { creditProductId:product.id,statementDate:'2026-10-31',reportedBalance:17900000,expectedBalance:18000000,reason:'Extracto',idempotencyKey:'recon' };
    const result = await repo.reconcileDebt(user,dto);
    expect(result.difference).toBe(-100000);
    expect((await repo.reconcileDebt(user,dto)).id).toBe(result.id);
    await expect(repo.getDebtHistory('empty-other',product.id)).rejects.toThrow();
    await expect(repo.reconcileDebt('empty-other',dto)).rejects.toThrow();
  });

  it('elimina cuenta sin movimientos y actualiza patrimonio y dashboard mediante signals', async () => {
    const facade = TestBed.inject(FinancialFacade);
    const account = await facade.createAccount({name:'Error',type:'CASH',initialBalance:123});
    expect(facade.totalLiquidBalance()).toBe(123);
    await facade.deleteAccount(account.id);
    expect(facade.accounts()).toHaveLength(0);
    expect(facade.netWorth()).toBe(0);
  });

  it('protege ingresos incluso revertidos y permite archivar sin perder referencias', async () => {
    const account = await repo.createAccount(user,{name:'Ingreso',type:'CASH',initialBalance:0});
    const income = await repo.recordIncome(user,{accountId:account.id,amount:100,sourceName:'Prueba',periodYear:2026,periodMonth:10});
    await repo.reverseOperation(user,{operationType:'INCOME',operationId:income.operationId,reason:'Corrección'});
    await expect(repo.deleteAccount(user,account.id)).rejects.toThrow(/historial financiero/);
    await repo.archiveAccount(user,account.id);
    expect((await repo.getAccountById(user,account.id))?.isArchived).toBe(true);
    await expect(repo.deleteAccount('empty-other',account.id)).rejects.toThrow(/no pertenece/);
  });

  it('protege ambos extremos de transferencias aunque se reviertan', async () => {
    const a = await repo.createAccount(user,{name:'Origen',type:'CASH',initialBalance:100});
    const b = await repo.createAccount(user,{name:'Destino',type:'CASH',initialBalance:0});
    const transfer = await repo.recordTransfer(user,{fromAccountId:a.id,toAccountId:b.id,amount:50});
    await repo.reverseOperation(user,{operationType:'TRANSFER',operationId:transfer.operationId,reason:'Corrección'});
    for (const id of [a.id,b.id]) await expect(repo.deleteAccount(user,id)).rejects.toThrow(/historial financiero/);
  });

  it('reverso entre diciembre y enero mantiene saldos históricos reproducibles y política contable consistente', async () => {
    const {product,account} = await scenario();
    const decOb = await repo.generateCreditInstallmentObligation(user,{creditProductId:product.id,periodYear:2026,periodMonth:12});
    const pay = await repo.recordPayment(user,{obligationId:decOb.id,accountId:account.id,amount:750000,paymentDate:'2026-12-15'});
    await repo.reverseOperation(user,{operationType:'PAYMENT',operationId:pay.operationId,reason:'Reverso en enero'});
    const history = await repo.getDebtHistory(user,product.id);
    history.payments[0].reversedAt = '2027-01-10';
    const summary2026 = debtYearSummary(product,history,2026);
    const summary2027 = debtYearSummary(product,history,2027);
    const overall = debtOverallTotals(history);
    expect(summary2026.opening).toBe(18000000);
    expect(summary2026.paid).toBe(750000);
    expect(summary2026.capital).toBe(570000);
    expect(summary2026.closing).toBe(17430000);
    expect(summary2027.opening).toBe(17430000);
    expect(summary2027.paid).toBe(-750000);
    expect(summary2027.capital).toBe(-570000);
    expect(summary2027.closing).toBe(18000000);
    expect(summary2026.months[11].payments).toHaveLength(1);
    expect(summary2027.months[0].payments).toHaveLength(1);
    expect(overall.paid).toBe(summary2026.paid + summary2027.paid);
    expect(overall.capital).toBe(summary2026.capital + summary2027.capital);
    expect(overall.interest).toBe(summary2026.interest + summary2027.interest);
    expect(overall.charges).toBe(0);
  });

  it('impide registrar ingresos, transferencias y pagos sobre cuentas archivadas conservando su historial', async () => {
    const {product,account,obligation} = await scenario();
    const second = await repo.createAccount(user,{name:'Secundaria',type:'SAVINGS',initialBalance:500000});
    await repo.recordIncome(user,{accountId:account.id,amount:100000,sourceName:'Nómina',periodYear:2026,periodMonth:10});
    await repo.archiveAccount(user,account.id);
    await expect(repo.recordIncome(user,{accountId:account.id,amount:50000,sourceName:'Extra',periodYear:2026,periodMonth:11})).rejects.toThrow(/archivada/);
    await expect(repo.recordTransfer(user,{fromAccountId:account.id,toAccountId:second.id,amount:10000})).rejects.toThrow(/archivada/);
    await expect(repo.recordTransfer(user,{fromAccountId:second.id,toAccountId:account.id,amount:10000})).rejects.toThrow(/archivada/);
    await expect(repo.recordPayment(user,{obligationId:obligation.id,accountId:account.id,amount:100000,paymentDate:'2026-11-15'})).rejects.toThrow(/archivada/);
    expect(await repo.getIncomes(user,2026,10)).toHaveLength(1);
    expect(await repo.getDebtHistory(user,product.id)).toBeDefined();
  });

  it('calcula automáticamente el desglose en cascada para pagos parciales sin cálculo manual', async () => {
    const {obligation} = await scenario();
    const first = allocatePaymentCascade(obligation,[],200000);
    expect(first).toEqual({appliedToFees:0,appliedToInsurance:30000,appliedToInterest:150000,appliedToCapital:20000});
  });

  it('archiva, restaura, consulta historial y registra auditoría local simulada de eliminación sin duplicados', async () => {
    const facade = TestBed.inject(FinancialFacade);
    const created = await facade.createAccount({name:'Temporal Demo',type:'SAVINGS',initialBalance:50000});
    await facade.archiveAccount(created.id,'arch-demo-1');
    await facade.archiveAccount(created.id,'arch-demo-2');
    expect(facade.accounts().find(a => a.id === created.id)?.isArchived).toBe(true);
    await facade.restoreAccount(created.id,'rest-demo-1');
    const restored = facade.accounts().find(a => a.id === created.id)!;
    expect(restored.id).toBe(created.id);
    expect(restored.isArchived).toBe(false);
    await facade.restoreAccount(created.id,'rest-demo-2');
    const historyBeforeDelete = await facade.getAccountHistory(created.id);
    expect(historyBeforeDelete.auditTrail.filter(e => e.eventType === 'ACCOUNT_ARCHIVED')).toHaveLength(1);
    expect(historyBeforeDelete.auditTrail.filter(e => e.eventType === 'ACCOUNT_RESTORED')).toHaveLength(1);
    await facade.deleteAccount(created.id,{reason:'Prueba de auditoría local',operationId:'op-del-demo-1'});
    const delAudit = await facade.getAccountDeletionAudit();
    expect(delAudit).toHaveLength(1);
    expect(delAudit[0].accountId).toBe(created.id);
    expect(delAudit[0].ownerUserId).toBe(user);
    expect(delAudit[0].deletedBy).toBe(user);
    expect(delAudit[0].deletionReason).toBe('Prueba de auditoría local');
    expect(delAudit[0].isSimulatedLocal).toBe(true);
  });
});
