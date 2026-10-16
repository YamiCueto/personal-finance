import { describe, it, expect } from 'vitest';
import { FinancialCalculatorV2 } from './financial-calculator-v2';
import {
  CreditProduct,
  FinancialAccount,
  Income,
  PeriodObligation,
  ObligationPayment,
} from '../models/financial-v2.model';

describe('FinancialCalculatorV2 — Motor Financiero Riguroso', () => {
  describe('Aritmética Exacta, Tasas y Amortizaciones', () => {
    it('debe convertir correctamente tasa EA a NMV (Efectiva Anual a Nominal Mensual)', () => {
      // Caso real: 25.00% EA
      // i = (1 + 0.25)^(1/12) - 1 = 0.018769... (~1.8769% mensual)
      const monthlyRate = FinancialCalculatorV2.convertEaToMonthlyRate(25);
      expect(monthlyRate).toBeCloseTo(0.018769, 5);

      // Reversión a EA
      const reconstructedEa = FinancialCalculatorV2.convertMonthlyRateToEa(monthlyRate);
      expect(reconstructedEa).toBe(25);
    });

    it('debe soportar amortización con tasa cero sin divisiones por cero ni errores de redondeo', () => {
      const principal = 1200000;
      const n = 12;
      const cuotaTasaCero = FinancialCalculatorV2.calculateFrenchInstallment(principal, 0, n);
      expect(cuotaTasaCero).toBe(100000);

      const schedule = FinancialCalculatorV2.generateFrenchAmortizationSchedule(principal, 0, n);
      expect(schedule.length).toBe(12);

      // Cada cuota debe tener exactamente 0 interés y 100,000 capital
      schedule.forEach((item) => {
        expect(item.interestPayment).toBe(0);
        expect(item.principalPayment).toBe(100000);
        expect(item.totalPayment).toBe(100000);
      });

      // El saldo final es exactamente 0
      expect(schedule[11].remainingPrincipal).toBe(0);
    });

    it('debe calcular amortización con redondeos ajustando el centavo en la última cuota', () => {
      // 1,000,000 a 3 meses con tasa del 15% EA
      const principal = 1000000;
      const ea = 15;
      const n = 3;

      const schedule = FinancialCalculatorV2.generateFrenchAmortizationSchedule(principal, ea, n);
      expect(schedule.length).toBe(3);

      // Suma total de capital pagado debe ser exactamente igual al capital prestado
      const sumCapital = schedule.reduce((acc, curr) => acc + curr.principalPayment, 0);
      expect(FinancialCalculatorV2.roundMoney(sumCapital)).toBe(principal);
      expect(schedule[2].remainingPrincipal).toBe(0);
    });

    it('debe calcular la cuota fija francesa de crédito vehicular', () => {
      const principal = 50000000;
      const ea = 18;
      const n = 60;
      const iMonthly = FinancialCalculatorV2.convertEaToMonthlyRate(ea);

      const cuotaFija = FinancialCalculatorV2.calculateFrenchInstallment(principal, iMonthly, n);
      expect(cuotaFija).toBeGreaterThan(1200000);
      expect(cuotaFija).toBeLessThan(1300000);

      const schedule = FinancialCalculatorV2.generateFrenchAmortizationSchedule(principal, ea, n, 50000);
      expect(schedule.length).toBe(60);
      expect(schedule[0].interestPayment).toBeGreaterThan(schedule[0].principalPayment);
      expect(schedule[59].principalPayment).toBeGreaterThan(schedule[59].interestPayment);
      expect(schedule[59].remainingPrincipal).toBe(0);
    });
  });

  describe('Aplicación de Pagos, Desglose y Prevención de Errores', () => {
    const baseObligation: PeriodObligation = {
      id: 'ob-1',
      userId: 'user-1',
      sourceType: 'CREDIT_INSTALLMENT',
      periodYear: 2026,
      periodMonth: 1,
      name: 'Cuota Vehículo Occidente',
      amount: 1250000,
      status: 'PENDING',
      capitalComponent: 800000,
      interestCurrentComponent: 400000,
      interestMoraComponent: 0,
      insuranceComponent: 50000,
      otherFeesComponent: 0,
      amountPaid: 0,
      amountPending: 1250000,
      orderIndex: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const baseAccount: FinancialAccount = {
      id: 'acc-1',
      userId: 'user-1',
      name: 'Cuenta Nómina',
      type: 'SAVINGS',
      currency: 'COP',
      initialBalance: 5000000,
      currentBalance: 5000000,
      isArchived: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    it('debe aplicar un pago parcial con prelación contractual sin inventar comisiones', () => {
      // Pago de 500,000 en cuota de 1,250,000 (Seguro: 50k, Interés: 400k, Capital: 800k)
      // Prelación estándar:
      // 1. Seguros: 50,000
      // 2. Intereses: 400,000
      // 3. Capital: restante 50,000
      // 4. Comisiones: 0 (nunca inventadas)
      const result = FinancialCalculatorV2.applyPayment(baseObligation, 500000, baseAccount);

      expect(result.updatedAccount.currentBalance).toBe(4500000);
      expect(result.updatedObligation.status).toBe('PARTIAL');
      expect(result.updatedObligation.amountPaid).toBe(500000);
      expect(result.updatedObligation.amountPending).toBe(750000);

      expect(result.generatedPayment.appliedToInsurance).toBe(50000);
      expect(result.generatedPayment.appliedToInterest).toBe(400000);
      expect(result.generatedPayment.appliedToCapital).toBe(50000);
      expect(result.generatedPayment.appliedToFees).toBe(0);
      expect(
        result.generatedPayment.appliedToInsurance +
          result.generatedPayment.appliedToInterest +
          result.generatedPayment.appliedToCapital +
          result.generatedPayment.appliedToFees
      ).toBe(500000);
    });

    it('debe aplicar un pago completo cambiando el estado a PAID', () => {
      const result = FinancialCalculatorV2.applyPayment(baseObligation, 1250000, baseAccount);

      expect(result.updatedAccount.currentBalance).toBe(3750000);
      expect(result.updatedObligation.status).toBe('PAID');
      expect(result.updatedObligation.amountPaid).toBe(1250000);
      expect(result.updatedObligation.amountPending).toBe(0);
      expect(result.generatedPayment.paymentType).toBe('FULL_PAYMENT');
      expect(result.generatedPayment.appliedToCapital).toBe(800000);
      expect(result.generatedPayment.appliedToInterest).toBe(400000);
      expect(result.generatedPayment.appliedToInsurance).toBe(50000);
      expect(result.generatedPayment.appliedToFees).toBe(0);
    });

    it('debe aplicar un pago extraordinario a capital (PREPAYMENT_CAPITAL)', () => {
      const result = FinancialCalculatorV2.applyPayment(baseObligation, 2000000, baseAccount, {
        allocationMethod: 'CAPITAL_PREPAYMENT',
      });

      expect(result.updatedAccount.currentBalance).toBe(3000000);
      expect(result.generatedPayment.paymentType).toBe('PREPAYMENT_CAPITAL');
      expect(result.generatedPayment.appliedToCapital).toBe(2000000);
      expect(result.generatedPayment.appliedToInterest).toBe(0);
      expect(result.generatedPayment.appliedToInsurance).toBe(0);
      expect(result.generatedPayment.appliedToFees).toBe(0);
    });

    it('debe rechazar un intento de sobrepago con una excepción explícita', () => {
      // Intentar pagar 1,500,000 en cuota de 1,250,000 sin ser prepago
      expect(() => {
        FinancialCalculatorV2.applyPayment(baseObligation, 1500000, baseAccount);
      }).toThrowError(/Intento de sobrepago/);
    });

    it('debe rechazar un pago si la cuenta no tiene fondos suficientes', () => {
      const poorAccount: FinancialAccount = {
        ...baseAccount,
        currentBalance: 100000,
      };

      expect(() => {
        FinancialCalculatorV2.applyPayment(baseObligation, 500000, poorAccount);
      }).toThrowError(/Saldo insuficiente/);
    });

    it('debe validar un desglose explícito verificado y rechazar si no cuadra exactamente', () => {
      // Desglose que no suma el total del pago
      expect(() => {
        FinancialCalculatorV2.applyPayment(baseObligation, 500000, baseAccount, {
          allocationMethod: 'EXPLICIT_BREAKDOWN',
          breakdown: {
            appliedToCapital: 200000,
            appliedToInterest: 200000,
            // Suma 400,000, falta 100,000
          },
        });
      }).toThrowError(/Inconsistencia en desglose explícito/);

      // Desglose correcto
      const validResult = FinancialCalculatorV2.applyPayment(baseObligation, 500000, baseAccount, {
        allocationMethod: 'EXPLICIT_BREAKDOWN',
        breakdown: {
          appliedToCapital: 300000,
          appliedToInterest: 150000,
          appliedToInsurance: 50000,
          appliedToFees: 0,
        },
      });

      expect(validResult.generatedPayment.appliedToCapital).toBe(300000);
      expect(validResult.generatedPayment.appliedToInterest).toBe(150000);
      expect(validResult.generatedPayment.appliedToInsurance).toBe(50000);
    });

    it('debe revertir un pago de manera atómica restituyendo saldos', () => {
      // 1. Aplicamos pago
      const paymentResult = FinancialCalculatorV2.applyPayment(baseObligation, 500000, baseAccount);

      // 2. Revertimos el pago
      const reversal = FinancialCalculatorV2.reversePayment(
        paymentResult.generatedPayment,
        paymentResult.updatedObligation,
        paymentResult.updatedAccount,
        'Error operativo en conciliación bancaria'
      );

      // La cuenta recupera el saldo exacto
      expect(reversal.updatedAccount.currentBalance).toBe(5000000);
      // La obligación vuelve a quedar pendiente en su totalidad
      expect(reversal.updatedObligation.amountPaid).toBe(0);
      expect(reversal.updatedObligation.amountPending).toBe(1250000);
      expect(reversal.updatedObligation.status).toBe('PENDING');
      // El registro queda marcado como revertido
      expect(reversal.reversedPayment.isReversed).toBe(true);
      expect(reversal.reversedPayment.reversalReason).toBe('Error operativo en conciliación bancaria');
    });
  });

  describe('Reestructuración / Rediferido de Deuda', () => {
    it('debe registrar el evento de rediferido conservando las condiciones previas y actualizando el crédito', () => {
      const credit: CreditProduct = {
        id: 'credit-card-1',
        userId: 'user-1',
        institutionId: 'inst-1',
        name: 'RappiCard Visa',
        type: 'CREDIT_CARD',
        status: 'ACTIVE',
        originalPrincipal: 10000000,
        currentPrincipalBalance: 8500000,
        nominalRateMonthly: 2.1,
        effectiveAnnualRate: 28.5,
        totalInstallments: 12,
        remainingInstallments: 8,
        capitalizationPeriod: 'MONTHLY',
        amortizationMethod: 'FRENCH',
        associatedInsurancesMonthly: 0,
        managementFeeMonthly: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };

      const result = FinancialCalculatorV2.restructureCreditProduct(
        credit,
        8500000, // Nuevo saldo (o consolidado)
        19.5, // Nueva tasa EA más favorable
        36, // Plazo ampliado a 36 meses
        'Alivio financiero por rediferido total de saldo de tarjeta'
      );

      // Auditoría histórica
      expect(result.restructureEvent.previousPrincipalBalance).toBe(8500000);
      expect(result.restructureEvent.previousEffectiveAnnualRate).toBe(28.5);
      expect(result.restructureEvent.previousRemainingInstallments).toBe(8);
      expect(result.restructureEvent.newEffectiveAnnualRate).toBe(19.5);
      expect(result.restructureEvent.newTotalInstallments).toBe(36);
      expect(result.restructureEvent.reason).toContain('Alivio financiero');

      // Producto actualizado
      expect(result.updatedProduct.status).toBe('RESTRUCTURED');
      expect(result.updatedProduct.effectiveAnnualRate).toBe(19.5);
      expect(result.updatedProduct.totalInstallments).toBe(36);
      expect(result.updatedProduct.remainingInstallments).toBe(36);
    });
  });

  describe('Consolidado Mensual, Resto y Patrimonio Neto Riguroso', () => {
    it('debe calcular métricas del mes diferenciando saldo exigible, capital adeudado y patrimonio neto', () => {
      const incomes: Income[] = [
        {
          id: 'inc-1',
          userId: 'u1',
          periodYear: 2026,
          periodMonth: 1,
          sourceName: 'Salario',
          amount: 6000000,
          receivedDate: '2026-01-15',
          createdAt: '2026-01-15',
        },
      ];

      const obligations: PeriodObligation[] = [
        {
          id: 'o-1',
          userId: 'u1',
          sourceType: 'CREDIT_INSTALLMENT',
          periodYear: 2026,
          periodMonth: 1,
          name: 'Crédito Occidente',
          amount: 1500000,
          status: 'PAID',
          capitalComponent: 1000000,
          interestCurrentComponent: 450000,
          interestMoraComponent: 0,
          insuranceComponent: 50000,
          otherFeesComponent: 0,
          amountPaid: 1500000,
          amountPending: 0,
          orderIndex: 1,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 'o-2',
          userId: 'u1',
          sourceType: 'RECURRENT_EXPENSE',
          periodYear: 2026,
          periodMonth: 1,
          name: 'SURA Salud',
          amount: 500000,
          status: 'PENDING',
          capitalComponent: 0,
          interestCurrentComponent: 0,
          interestMoraComponent: 0,
          insuranceComponent: 500000,
          otherFeesComponent: 0,
          amountPaid: 0,
          amountPending: 500000,
          orderIndex: 2,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      const accounts: FinancialAccount[] = [
        {
          id: 'acc-1',
          userId: 'u1',
          name: 'Ahorros',
          type: 'SAVINGS',
          currency: 'COP',
          initialBalance: 4500000,
          currentBalance: 4500000,
          isArchived: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      const credits: CreditProduct[] = [
        {
          id: 'c-1',
          userId: 'u1',
          institutionId: 'inst-1',
          name: 'Crédito Occidente',
          type: 'VEHICLE_LOAN',
          status: 'ACTIVE',
          originalPrincipal: 40000000,
          currentPrincipalBalance: 28000000,
          nominalRateMonthly: 1.4,
          effectiveAnnualRate: 18.16,
          capitalizationPeriod: 'MONTHLY',
          amortizationMethod: 'FRENCH',
          associatedInsurancesMonthly: 50000,
          managementFeeMonthly: 0,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      const summary = FinancialCalculatorV2.calculateMonthlyLedgerSummary(
        2026,
        1,
        incomes,
        obligations,
        accounts,
        credits
      );

      // Fórmulas Excel
      expect(summary.totalIncome).toBe(6000000);
      expect(summary.totalObligations).toBe(2000000);
      expect(summary.totalFree).toBe(4000000); // Libre = 6M - 2M
      expect(summary.totalPaid).toBe(1500000);
      expect(summary.totalPending).toBe(500000); // Exigible pendiente en el mes

      // Liquidez real vs proyectada
      expect(summary.realLiquidBalance).toBe(4500000);
      expect(summary.projectedLiquidBalance).toBe(4000000);

      // Diferenciación de pasivos: Capital vs Intereses causados
      expect(summary.activePrincipalDebt).toBe(28000000);
      expect(summary.periodAccruedInterest).toBe(450000);
      expect(summary.totalDebtBalance).toBe(28450000);

      // Patrimonio neto = Activos líquidos (4.5M) - Pasivos totales (28.45M) = -23.95M
      expect(summary.netWorth).toBe(-23950000);
      expect(summary.isDebtCalculationDefinitive).toBe(true);

      // Cascada de Resto
      const cascade = FinancialCalculatorV2.calculateCascadeWaterfall(summary.totalIncome, obligations);
      expect(cascade[0].remainingResto).toBe(4500000);
      expect(cascade[1].remainingResto).toBe(4000000);
    });
  });

  describe('Sprint 2 / Fase 3: Motor Avanzado de Amortizaciones, Tarjetas y Simulaciones', () => {
    it('debe convertir exactamente entre EA y NMV según la convención colombiana', () => {
      // 25.00% EA
      const nmv = FinancialCalculatorV2.convertEaToNmv(25);
      expect(nmv).toBeCloseTo(22.52, 1);

      // Reversión NMV -> EA
      const eaReconstructed = FinancialCalculatorV2.convertNmvToEa(nmv);
      expect(eaReconstructed).toBeCloseTo(25, 1);

      // Tasa 0%
      expect(FinancialCalculatorV2.convertEaToNmv(0)).toBe(0);
      expect(FinancialCalculatorV2.convertNmvToEa(0)).toBe(0);
    });

    it('debe generar cronograma de amortización alemán con capital constante y saldo final exactamente en 0 COP', () => {
      const principal = 12000000;
      const rateMonthly = 1.5;
      const n = 12;
      const insurance = 25000;

      const schedule = FinancialCalculatorV2.generateGermanAmortizationSchedule(principal, rateMonthly, n, insurance);
      expect(schedule.length).toBe(12);

      // En el sistema alemán, el abono a capital es constante: 12,000,000 / 12 = 1,000,000
      for (let i = 0; i < 11; i++) {
        expect(schedule[i].principalPayment).toBe(1000000);
      }
      // La cuota total decrece a medida que disminuye el interés
      expect(schedule[0].totalPayment).toBeGreaterThan(schedule[11].totalPayment);
      expect(schedule[0].interestPayment).toBeGreaterThan(schedule[11].interestPayment);

      // Saldo final en exactamente 0
      expect(schedule[11].remainingPrincipal).toBe(0);

      // Suma de capitales exactamente igual al capital original
      const sumCap = schedule.reduce((sum, item) => sum + item.principalPayment, 0);
      expect(FinancialCalculatorV2.roundMoney(sumCap)).toBe(principal);
    });

    it('debe generar amortización alemana con tasa 0% (Crédito B)', () => {
      const principal = 6000000;
      const rateMonthly = 0;
      const n = 6;

      const schedule = FinancialCalculatorV2.generateGermanAmortizationSchedule(principal, rateMonthly, n, 0);
      expect(schedule.length).toBe(6);

      schedule.forEach((item) => {
        expect(item.principalPayment).toBe(1000000);
        expect(item.interestPayment).toBe(0);
        expect(item.totalPayment).toBe(1000000);
      });
      expect(schedule[5].remainingPrincipal).toBe(0);
    });

    it('debe simular abono extraordinario reduciendo plazo (REDUCE_TERM)', () => {
      const principal = 30000000;
      const ea = 18.86;
      const remainingN = 48;
      const prepayment = 5000000;

      const sim = FinancialCalculatorV2.simulatePrepayment(
        principal,
        ea,
        remainingN,
        prepayment,
        'REDUCE_TERM',
        45000
      );

      expect(sim.previousPrincipal).toBe(30000000);
      expect(sim.simulatedPrincipal).toBe(25000000);
      expect(sim.newRemainingInstallments).toBeLessThan(remainingN);
      expect(sim.estimatedInterestSavings).toBeGreaterThan(0);
      expect(sim.newInstallment).toBe(sim.originalInstallment);
    });

    it('debe simular abono extraordinario reduciendo cuota (REDUCE_INSTALLMENT)', () => {
      const principal = 30000000;
      const ea = 18.86;
      const remainingN = 48;
      const prepayment = 5000000;

      const sim = FinancialCalculatorV2.simulatePrepayment(
        principal,
        ea,
        remainingN,
        prepayment,
        'REDUCE_INSTALLMENT',
        45000
      );

      expect(sim.previousPrincipal).toBe(30000000);
      expect(sim.simulatedPrincipal).toBe(25000000);
      expect(sim.newRemainingInstallments).toBe(remainingN);
      expect(sim.newInstallment).toBeLessThan(sim.originalInstallment);
      expect(sim.estimatedInterestSavings).toBeGreaterThan(0);
    });

    it('debe simular rediferidos de deuda comparando costos actuales vs propuestos', () => {
      const principal = 10000000;
      const currentEa = 29.12;
      const currentN = 12;
      const proposedEa = 22.0;
      const proposedN = 24;

      const sim = FinancialCalculatorV2.simulateRedeferred(
        principal,
        currentEa,
        currentN,
        proposedEa,
        proposedN
      );

      expect(sim.currentPrincipal).toBe(10000000);
      expect(sim.currentRemainingInstallments).toBe(12);
      expect(sim.proposedInstallments).toBe(24);
      // Al extender a 24 meses la cuota mensual disminuye
      expect(sim.proposedInstallment).toBeLessThan(sim.currentInstallment);
      // Se calculan las diferencias de costo
      expect(sim.totalCostDifference).toBeDefined();
      expect(sim.interestDifference).toBeDefined();
    });

    it('debe calcular extracto de tarjeta de crédito a partir de compras diferidas activas', () => {
      const purchases = [
        {
          id: 'p1',
          description: 'MacBook',
          originalAmount: 4800000,
          totalInstallments: 24,
          remainingInstallments: 12,
          interestRateMonthly: 2.15,
          status: 'PENDING' as const,
        },
        {
          id: 'p2',
          description: 'Mercado',
          originalAmount: 450000,
          totalInstallments: 1,
          remainingInstallments: 1,
          interestRateMonthly: 0,
          status: 'PENDING' as const,
        },
      ];

      const statement = FinancialCalculatorV2.calculateCreditCardStatement(purchases, 28500);

      expect(statement.activePurchasesCount).toBe(2);
      // Capital p1: 4800000 / 24 = 200,000
      // Capital p2: 450000 / 1 = 450,000
      expect(statement.totalCapitalPayment).toBe(650000);
      expect(statement.managementFee).toBe(28500);
      expect(statement.totalInterestPayment).toBeGreaterThan(0);
      expect(statement.totalStatementAmount).toBe(
        FinancialCalculatorV2.roundMoney(650000 + statement.totalInterestPayment + 28500)
      );
    });
  });
});
