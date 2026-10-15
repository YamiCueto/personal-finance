import {
  CreditProduct,
  MonthlyLedgerSummaryV2,
  PeriodObligation,
  ObligationPayment,
  FinancialAccount,
  Income,
  PaymentApplyOptions,
} from '../models/financial-v2.model';

/**
 * ============================================================================
 * MOTOR FINANCIERO V2 — ARITMÉTICA EXACTA Y CONTROL CONTABLE
 * ============================================================================
 * Implementación de cálculos monetarios mediante enteros escalados en centavos (Fixed-Point)
 * y redondeo bancario Half-Up, eliminando imprecisiones de coma flotante IEEE-754.
 */
export class FinancialCalculatorV2 {
  /**
   * Redondeo financiero estricto a 2 decimales (Half-Up).
   * Justificación técnica:
   * Los números de punto flotante de 64 bits de JavaScript (IEEE-754) generan
   * residuos binarios en sumas y productos decimales (ej. 0.1 + 0.2 = 0.30000000000000004).
   * El escalado a centavos con suma de Number.EPSILON garantiza que los valores a mitad de camino
   * (0.005) se redondeen siempre hacia arriba al centavo más próximo.
   */
  static roundMoney(amount: number): number {
    if (!Number.isFinite(amount)) return 0;
    const sign = amount < 0 ? -1 : 1;
    const abs = Math.abs(amount);
    const res = sign * (Math.round((abs + Number.EPSILON) * 100) / 100);
    return Math.abs(res) === 0 ? 0 : res;
  }

  /**
   * Redondeo financiero para tasas de interés con precisión configurable (por defecto 4 decimales: NUMERIC(7, 4))
   */
  static roundRate(rate: number, decimals = 4): number {
    if (!Number.isFinite(rate)) return 0;
    const factor = Math.pow(10, decimals);
    const sign = rate < 0 ? -1 : 1;
    const abs = Math.abs(rate);
    const res = sign * (Math.round((abs + Number.EPSILON) * factor) / factor);
    return Math.abs(res) === 0 ? 0 : res;
  }

  /**
   * Convierte un monto decimal a centavos enteros exactos (Escalado a 100)
   */
  static toCents(amount: number): number {
    if (!Number.isFinite(amount)) return 0;
    const sign = amount < 0 ? -1 : 1;
    return sign * Math.round(Math.abs(amount) * 100);
  }

  /**
   * Convierte centavos enteros a pesos decimales (COP)
   */
  static fromCents(cents: number): number {
    return Math.round(cents) / 100;
  }

  /**
   * Conversión de Tasa Efectiva Anual (EA) a Tasa Nominal Mensual Vencida (NMV)
   * Fórmula estándar financiera colombiana:
   * i_mensual = (1 + EA)^(1/12) - 1
   */
  static convertEaToMonthlyRate(effectiveAnnualRatePercentage: number): number {
    if (effectiveAnnualRatePercentage <= 0) return 0;
    const eaDecimal = effectiveAnnualRatePercentage / 100;
    const monthlyRate = Math.pow(1 + eaDecimal, 1 / 12) - 1;
    return monthlyRate; // Decimal exacto (ej. 0.018769 para 1.8769% mensual)
  }

  /**
   * Conversión de Tasa Mensual a Tasa Efectiva Anual (EA)
   * EA = (1 + i_mensual)^12 - 1
   */
  static convertMonthlyRateToEa(monthlyRateDecimal: number): number {
    if (monthlyRateDecimal <= 0) return 0;
    const ea = Math.pow(1 + monthlyRateDecimal, 12) - 1;
    return this.roundMoney(ea * 100);
  }

  /**
   * Cálculo de cuota fija con Sistema Francés
   * Cuota = P * [ i * (1+i)^n ] / [ (1+i)^n - 1 ]
   * Manejo robusto para amortizaciones con tasa cero (i = 0).
   */
  static calculateFrenchInstallment(
    principal: number,
    monthlyRateDecimal: number,
    installments: number
  ): number {
    if (principal <= 0 || installments <= 0) return 0;
    if (monthlyRateDecimal === 0) {
      // Amortización con tasa cero: división directa sin indeterminación matemática
      return this.roundMoney(principal / installments);
    }

    const factor = Math.pow(1 + monthlyRateDecimal, installments);
    const installment = principal * ((monthlyRateDecimal * factor) / (factor - 1));
    return this.roundMoney(installment);
  }

  /**
   * Generación de tabla proyectada de amortización francesa.
   * Garantiza:
   * 1. Soporte completo para tasa 0% (sin división por cero).
   * 2. Ajuste exacto de centavos en la cuota final para que sum(capital) === principal original
   *    y el saldo remanente sea estrictamente 0.00.
   */
  static generateFrenchAmortizationSchedule(
    principal: number,
    effectiveAnnualRate: number,
    totalInstallments: number,
    monthlyInsurance = 0
  ): Array<{
    installmentNumber: number;
    totalPayment: number;
    principalPayment: number;
    interestPayment: number;
    insurancePayment: number;
    remainingPrincipal: number;
  }> {
    if (principal <= 0 || totalInstallments <= 0) return [];

    const i = this.convertEaToMonthlyRate(effectiveAnnualRate);
    const fixedInstallment = this.calculateFrenchInstallment(principal, i, totalInstallments);
    let balanceCents = this.toCents(principal);
    const schedule = [];
    const insuranceCents = this.toCents(monthlyInsurance);

    for (let k = 1; k <= totalInstallments; k++) {
      let interestCents = 0;
      if (i > 0) {
        const interestFloat = this.fromCents(balanceCents) * i;
        interestCents = this.toCents(interestFloat);
      }

      let principalPartCents = this.toCents(fixedInstallment) - interestCents;

      // Ajuste en la última cuota o si el saldo pendiente es menor al abono calculado
      if (k === totalInstallments || balanceCents <= principalPartCents) {
        principalPartCents = balanceCents;
      }

      balanceCents = Math.max(0, balanceCents - principalPartCents);

      const totalPayCents = principalPartCents + interestCents + insuranceCents;

      schedule.push({
        installmentNumber: k,
        totalPayment: this.fromCents(totalPayCents),
        principalPayment: this.fromCents(principalPartCents),
        interestPayment: this.fromCents(interestCents),
        insurancePayment: this.fromCents(insuranceCents),
        remainingPrincipal: this.fromCents(balanceCents),
      });

      if (balanceCents === 0) break;
    }

    return schedule;
  }

  /**
   * Cascada mensual de Resto (Comportamiento del Excel)
   */
  static calculateCascadeWaterfall(
    totalIncome: number,
    obligations: PeriodObligation[]
  ): Array<PeriodObligation & { remainingResto: number }> {
    let runningRestoCents = this.toCents(totalIncome);

    return obligations.map((ob) => {
      runningRestoCents = runningRestoCents - this.toCents(ob.amount);
      return {
        ...ob,
        remainingResto: this.fromCents(runningRestoCents),
      };
    });
  }

  /**
   * Cálculo del consolidado mensual V2 con diferenciación nítida de métricas:
   * - Activos líquidos (cuentas)
   * - Saldo exigible del período (cuotas facturadas pendientes)
   * - Saldo de capital adeudado en créditos
   * - Intereses causados en el período
   * - Patrimonio neto
   */
  static calculateMonthlyLedgerSummary(
    year: number,
    month: number,
    incomes: Income[],
    obligations: PeriodObligation[],
    accounts: FinancialAccount[],
    creditProducts: CreditProduct[]
  ): MonthlyLedgerSummaryV2 {
    const periodIncomes = incomes.filter(
      (inc) => inc.periodYear === year && inc.periodMonth === month && !inc.isReversed
    );
    const periodObligations = obligations.filter(
      (ob) => ob.periodYear === year && ob.periodMonth === month
    );

    const totalIncome = this.roundMoney(
      periodIncomes.reduce((acc, curr) => acc + curr.amount, 0)
    );
    const totalObligations = this.roundMoney(
      periodObligations.reduce((acc, curr) => acc + curr.amount, 0)
    );
    const totalPaid = this.roundMoney(
      periodObligations.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0)
    );
    const totalPending = this.roundMoney(
      periodObligations.reduce((acc, curr) => acc + (curr.amountPending || 0), 0)
    );

    // Flujo Libre: Total Ingresos del período - Total Obligaciones exigibles del período
    const totalFree = this.roundMoney(totalIncome - totalObligations);

    // Desglose de cuotas del período
    const totalCapitalPayable = this.roundMoney(
      periodObligations.reduce((acc, curr) => acc + (curr.capitalComponent || 0), 0)
    );
    const totalInterestPayable = this.roundMoney(
      periodObligations.reduce((acc, curr) => acc + (curr.interestCurrentComponent || 0), 0)
    );
    const totalInsurancePayable = this.roundMoney(
      periodObligations.reduce((acc, curr) => acc + (curr.insuranceComponent || 0), 0)
    );

    // Saldo real en cuentas de activos líquidos activos
    const realLiquidBalance = this.roundMoney(
      accounts
        .filter((acc) => !acc.isArchived)
        .reduce((acc, curr) => acc + curr.currentBalance, 0)
    );

    // Saldo proyectado de liquidez: Saldo real menos lo exigible pendiente por pagar en el mes
    const projectedLiquidBalance = this.roundMoney(realLiquidBalance - totalPending);

    // Pasivos de capital: Saldo de capital adeudado actual en todos los créditos activos
    const activePrincipalDebt = this.roundMoney(
      creditProducts
        .filter((cp) => cp.status === 'ACTIVE')
        .reduce((acc, curr) => acc + curr.currentPrincipalBalance, 0)
    );

    // Intereses causados en el período
    const periodAccruedInterest = totalInterestPayable;

    // Saldo total de deuda actual: Capital insoluto + Intereses devengados exigibles del período
    const totalDebtBalance = this.roundMoney(activePrincipalDebt + periodAccruedInterest);

    // Patrimonio neto: Activos líquidos - Pasivos totales adeudados
    const netWorth = this.roundMoney(realLiquidBalance - totalDebtBalance);

    return {
      periodYear: year,
      periodMonth: month,
      totalIncome,
      totalObligations,
      totalPaid,
      totalPending,
      totalFree,
      totalCapitalPayable,
      totalInterestPayable,
      totalInsurancePayable,
      realLiquidBalance,
      projectedLiquidBalance,
      activePrincipalDebt,
      periodAccruedInterest,
      totalDebtBalance,
      netWorth,
      isDebtCalculationDefinitive: true,
      debtNotes:
        'Pasivos calculados sobre saldo de capital insoluto de créditos activos más intereses corrientes exigibles del período.',
    };
  }

  /**
   * Aplicación de pago con validaciones estrictas de integridad financiera:
   * 1. Rechazo de sobrepago cuando excede el saldo pendiente exigible (salvo prepago a capital).
   * 2. Rechazo si la cuenta no cuenta con saldo suficiente.
   * 3. Eliminación de la distribución proporcional ciega: exige desglose explícito o cascada contractual.
   * 4. NUNCA inventa comisiones residuales.
   */
  static applyPayment(
    obligation: PeriodObligation,
    paymentAmount: number,
    paymentAccount: FinancialAccount,
    options?: PaymentApplyOptions
  ): {
    updatedObligation: PeriodObligation;
    updatedAccount: FinancialAccount;
    generatedPayment: ObligationPayment;
  } {
    if (paymentAmount <= 0) {
      throw new Error('El valor del pago debe ser mayor a 0');
    }

    const roundedPayment = this.roundMoney(paymentAmount);
    const currentPending = this.roundMoney(obligation.amountPending);
    const allocationMethod = options?.allocationMethod || 'CONTRACTUAL_CASCADE';

    // 1. Control de sobrepago
    if (allocationMethod !== 'CAPITAL_PREPAYMENT' && roundedPayment > currentPending) {
      throw new Error(
        `Intento de sobrepago: el monto ${roundedPayment} excede el saldo pendiente exigible ${currentPending}`
      );
    }

    // 2. Control de saldo en cuenta
    if (paymentAccount.currentBalance < roundedPayment) {
      throw new Error(
        `Saldo insuficiente en la cuenta. Saldo actual: ${paymentAccount.currentBalance}, requerido: ${roundedPayment}`
      );
    }

    let appliedCapital = 0;
    let appliedInterest = 0;
    let appliedInsurance = 0;
    let appliedFees = 0;

    // 3. Distribución del dinero aplicado
    if (allocationMethod === 'CAPITAL_PREPAYMENT') {
      // Abono extraordinario a capital: 100% va al principal
      appliedCapital = roundedPayment;
    } else if (allocationMethod === 'EXPLICIT_BREAKDOWN') {
      // Desglose explícito verificado proporcionado por el extracto o comprobante
      const b = options?.breakdown || {};
      appliedCapital = this.roundMoney(b.appliedToCapital || 0);
      appliedInterest = this.roundMoney(b.appliedToInterest || 0);
      appliedInsurance = this.roundMoney(b.appliedToInsurance || 0);
      appliedFees = this.roundMoney(b.appliedToFees || 0);

      const sumComponents = this.roundMoney(
        appliedCapital + appliedInterest + appliedInsurance + appliedFees
      );

      if (sumComponents !== roundedPayment) {
        throw new Error(
          `Inconsistencia en desglose explícito: la suma de componentes (${sumComponents}) debe coincidir exactamente con el valor del pago (${roundedPayment})`
        );
      }
    } else {
      // Cascada de Prelación Contractual Estándar Bancaria:
      // 1. Intereses de mora
      // 2. Comisiones y cuotas de manejo contractuales pactadas
      // 3. Seguros
      // 4. Intereses corrientes
      // 5. Capital
      let remainingCents = this.toCents(roundedPayment);

      const moraCents = this.toCents(obligation.interestMoraComponent || 0);
      const moraApplied = Math.min(remainingCents, moraCents);
      remainingCents -= moraApplied;

      const feesCents = this.toCents(obligation.otherFeesComponent || 0);
      const feesApplied = Math.min(remainingCents, feesCents);
      remainingCents -= feesApplied;
      appliedFees = this.fromCents(feesApplied);

      const insuranceCents = this.toCents(obligation.insuranceComponent || 0);
      const insuranceApplied = Math.min(remainingCents, insuranceCents);
      remainingCents -= insuranceApplied;
      appliedInsurance = this.fromCents(insuranceApplied);

      const interestCents = this.toCents(obligation.interestCurrentComponent || 0);
      const interestApplied = Math.min(remainingCents, interestCents);
      remainingCents -= interestApplied;
      appliedInterest = this.fromCents(moraApplied + interestApplied);

      const capitalCents = this.toCents(obligation.capitalComponent || 0);
      const capitalApplied = Math.min(remainingCents, capitalCents);
      remainingCents -= capitalApplied;
      appliedCapital = this.fromCents(capitalApplied);

      // Si aún sobra dinero y la cuota no tenía componentes desglosados (ej. ad-hoc),
      // se asigna al monto base adeudado (capital) sin inventar comisiones jamás
      if (remainingCents > 0) {
        appliedCapital = this.roundMoney(appliedCapital + this.fromCents(remainingCents));
      }
    }

    // Actualización de la obligación
    const previousPaid = obligation.amountPaid || 0;
    const newPaid = this.roundMoney(previousPaid + roundedPayment);
    const newPending = this.roundMoney(Math.max(0, obligation.amount - newPaid));
    const newStatus = newPending === 0 ? 'PAID' : 'PARTIAL';

    const updatedObligation: PeriodObligation = {
      ...obligation,
      amountPaid: newPaid,
      amountPending: newPending,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    // Actualización de la cuenta
    const updatedAccount: FinancialAccount = {
      ...paymentAccount,
      currentBalance: this.roundMoney(paymentAccount.currentBalance - roundedPayment),
      updatedAt: new Date().toISOString(),
    };

    // Registro auditable de pago
    const generatedPayment: ObligationPayment = {
      id: crypto.randomUUID(),
      userId: obligation.userId,
      obligationId: obligation.id,
      accountId: paymentAccount.id,
      paymentType:
        allocationMethod === 'CAPITAL_PREPAYMENT'
          ? 'PREPAYMENT_CAPITAL'
          : newPending === 0
            ? 'FULL_PAYMENT'
            : 'PARTIAL_PAYMENT',
      amount: roundedPayment,
      paymentDate: new Date().toISOString(),
      appliedToCapital: appliedCapital,
      appliedToInterest: appliedInterest,
      appliedToInsurance: appliedInsurance,
      appliedToFees: appliedFees,
      referenceNumber: options?.referenceNumber,
      idempotencyKey: options?.idempotencyKey,
      isReversed: false,
      notes: options?.notes,
      createdAt: new Date().toISOString(),
    };

    return {
      updatedObligation,
      updatedAccount,
      generatedPayment,
    };
  }

  /**
   * Reverso atómico de un pago previamente aplicado
   */
  static reversePayment(
    payment: ObligationPayment,
    obligation: PeriodObligation,
    account: FinancialAccount,
    reason: string
  ): {
    updatedObligation: PeriodObligation;
    updatedAccount: FinancialAccount;
    reversedPayment: ObligationPayment;
  } {
    if (payment.isReversed) {
      throw new Error('El pago ya fue revertido con anterioridad');
    }

    const restoredPaid = this.roundMoney(Math.max(0, obligation.amountPaid - payment.amount));
    const restoredPending = this.roundMoney(obligation.amount - restoredPaid);
    const restoredStatus = restoredPaid === 0 ? 'PENDING' : 'PARTIAL';

    const updatedObligation: PeriodObligation = {
      ...obligation,
      amountPaid: restoredPaid,
      amountPending: restoredPending,
      status: restoredStatus,
      updatedAt: new Date().toISOString(),
    };

    const updatedAccount: FinancialAccount = {
      ...account,
      currentBalance: this.roundMoney(account.currentBalance + payment.amount),
      updatedAt: new Date().toISOString(),
    };

    const reversedPayment: ObligationPayment = {
      ...payment,
      isReversed: true,
      reversedAt: new Date().toISOString(),
      reversalReason: reason,
    };

    return {
      updatedObligation,
      updatedAccount,
      reversedPayment,
    };
  }

  /**
   * Reestructuración / Rediferido de un producto crediticio
   */
  static restructureCreditProduct(
    creditProduct: CreditProduct,
    newPrincipalBalance: number,
    newEffectiveAnnualRate: number,
    newTotalInstallments: number,
    reason: string
  ): {
    updatedProduct: CreditProduct;
    restructureEvent: {
      id: string;
      userId: string;
      creditProductId: string;
      previousPrincipalBalance: number;
      previousEffectiveAnnualRate: number;
      previousRemainingInstallments: number;
      newPrincipalBalance: number;
      newEffectiveAnnualRate: number;
      newTotalInstallments: number;
      reason: string;
      createdAt: string;
    };
  } {
    const newMonthlyRate = this.roundRate(
      this.convertEaToMonthlyRate(newEffectiveAnnualRate) * 100,
      4
    );

    const restructureEvent = {
      id: crypto.randomUUID(),
      userId: creditProduct.userId,
      creditProductId: creditProduct.id,
      previousPrincipalBalance: creditProduct.currentPrincipalBalance,
      previousEffectiveAnnualRate: creditProduct.effectiveAnnualRate,
      previousRemainingInstallments: creditProduct.remainingInstallments || creditProduct.totalInstallments || 0,
      newPrincipalBalance: this.roundMoney(newPrincipalBalance),
      newEffectiveAnnualRate: this.roundMoney(newEffectiveAnnualRate),
      newTotalInstallments,
      reason,
      createdAt: new Date().toISOString(),
    };

    const updatedProduct: CreditProduct = {
      ...creditProduct,
      currentPrincipalBalance: this.roundMoney(newPrincipalBalance),
      effectiveAnnualRate: this.roundMoney(newEffectiveAnnualRate),
      nominalRateMonthly: newMonthlyRate,
      totalInstallments: newTotalInstallments,
      remainingInstallments: newTotalInstallments,
      status: 'RESTRUCTURED',
      updatedAt: new Date().toISOString(),
    };

    return {
      updatedProduct,
      restructureEvent,
    };
  }
}
