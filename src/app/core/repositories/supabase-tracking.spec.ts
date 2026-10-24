import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFinancialAdapter } from './supabase-financial.adapter';
import { SupabaseService } from '../services/supabase.service';

describe('Contratos RPC de seguimiento y cuentas', () => {
  let adapter: SupabaseFinancialAdapter;
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset();
    TestBed.configureTestingModule({providers:[{provide:SupabaseService,useValue:{clientInstance:{rpc}}}]});
    adapter = TestBed.inject(SupabaseFinancialAdapter);
  });

  it('elimina, archiva y restaura exclusivamente por RPC con auditoría y propaga rechazo de dependencias', async () => {
    rpc.mockResolvedValue({data:null,error:null});
    await adapter.deleteAccount('user','account',{reason:'No usada',operationId:'op-1'});
    expect(rpc).toHaveBeenCalledWith('delete_financial_account',{p_user_id:'user',p_account_id:'account',p_reason:'No usada',p_operation_id:'op-1'});
    rpc.mockResolvedValue({error:{message:'La cuenta tiene historial financiero'}});
    await expect(adapter.deleteAccount('user','account')).rejects.toThrow(/historial/);

    rpc.mockResolvedValue({data:{id:'account',user_id:'user',name:'Cuenta',type:'SAVINGS',initial_balance:0,current_balance:0,is_archived:true},error:null});
    await adapter.archiveAccount('user','account','arch-key');
    expect(rpc).toHaveBeenCalledWith('archive_financial_account',{p_user_id:'user',p_account_id:'account',p_idempotency_key:'arch-key'});

    rpc.mockResolvedValue({data:{id:'account',user_id:'user',name:'Cuenta',type:'SAVINGS',initial_balance:0,current_balance:0,is_archived:false},error:null});
    await adapter.restoreAccount('user','account','rest-key');
    expect(rpc).toHaveBeenCalledWith('restore_financial_account',{p_user_id:'user',p_account_id:'account',p_idempotency_key:'rest-key'});
  });

  it('conserva fecha, referencia y ceros explícitos en el desglose', async () => {
    rpc.mockResolvedValue({data:{success:true,payment_id:'payment'},error:null});
    await adapter.recordPayment('user',{obligationId:'obligation',accountId:'account',amount:100,paymentDate:'2026-11-15',referenceNumber:'extracto',idempotencyKey:'key',allocation:{appliedToCapital:100,appliedToInterest:0,appliedToInsurance:0,appliedToFees:0}});
    expect(rpc).toHaveBeenCalledWith('record_obligation_payment',expect.objectContaining({p_payment_date:'2026-11-15',p_reference_number:'extracto',p_applied_to_interest:0,p_applied_to_insurance:0,p_applied_to_fees:0,p_idempotency_key:'key'}));
  });

  it('envía el saldo esperado para detectar una conciliación obsoleta', async () => {
    rpc.mockResolvedValue({data:{id:'r',credit_product_id:'credit',reported_balance:100,calculated_balance:90,difference:10},error:null});
    const dto = {creditProductId:'credit',statementDate:'2026-11-30',reportedBalance:100,expectedBalance:90,reason:'Extracto',idempotencyKey:'key'};
    const result = await adapter.reconcileDebt('user',dto);
    expect(rpc).toHaveBeenCalledWith('reconcile_debt',{p_user_id:'user',p_input:dto});
    expect(result.calculatedBalance).toBe(90);
    expect(result.creditProductId).toBe('credit');
  });

  it('normaliza campos monetarios string o nulos en pagos y conciliaciones evitando NaN', async () => {
    rpc.mockResolvedValue({data:{id:'r-str',user_id:'user',credit_product_id:'credit',statement_date:'2026-11-30',calculated_balance:'18000000.50',reported_balance:'17900000.25',difference:'-100000.25',reason:'Ajuste',idempotency_key:'k1',created_at:'2026-11-30T00:00:00Z'},error:null});
    const recon = await adapter.reconcileDebt('user',{creditProductId:'credit',statementDate:'2026-11-30',reportedBalance:17900000.25,expectedBalance:18000000.5,reason:'Ajuste',idempotencyKey:'k1'});
    expect(typeof recon.calculatedBalance).toBe('number');
    expect(recon.calculatedBalance).toBe(18000000.5);
    expect(recon.reportedBalance).toBe(17900000.25);
    expect(recon.difference).toBe(-100000.25);
    const mappedPayment = (adapter as any).mapObligationPayment({id:'p-1',user_id:'user',obligation_id:'ob-1',account_id:'acc-1',payment_type:'PARTIAL_PAYMENT',payment_date:'2026-11-15T10:00:00Z',amount:'250000.75',applied_to_capital:'70000.75',applied_to_interest:'150000',applied_to_insurance:null,applied_to_fees:'invalid',is_reversed:false});
    expect(mappedPayment.amount).toBe(250000.75);
    expect(mappedPayment.appliedToCapital).toBe(70000.75);
    expect(mappedPayment.appliedToInterest).toBe(150000);
    expect(mappedPayment.appliedToInsurance).toBe(0);
    expect(mappedPayment.appliedToFees).toBe(0);
    expect(Number.isNaN(mappedPayment.appliedToFees)).toBe(false);
    expect(mappedPayment.paymentDate).toBe('2026-11-15');
  });
});
