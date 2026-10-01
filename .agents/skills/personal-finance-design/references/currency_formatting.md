# Reference: COP Monetary Representation & Formatting Standards

## 1. Currency Specification
- **Base Currency**: COP (Colombian Peso, `$`).
- **Scope**: All financial amounts in the application must be modeled, calculated, and displayed consistently as COP.
- **Decimal Precision**:
  - Maximum decimal precision: **2 decimal places**.
  - Never display more than 2 decimal places.
  - Do NOT assume COP values are always integers. Preserve up to 2 decimal places when they exist (e.g., centavos from interest, taxes, fee splits, or fractional movements).

---

## 2. Colombian Presentation Standards
- **Thousands Separator**: Dot (`.`)
- **Decimal Separator**: Comma (`,`)
- **Symbol Placement**: Leading `$ ` (currency symbol with a space)
- **Formatting Examples**:
  - Integer amounts: `$ 1.250.000`
  - Decimal amounts: `$ 1.250.000,50`
  - Sub-thousand amounts: `$ 85.000` or `$ 85.000,25`
  - Zero/neutral: `$ 0` or `$ 0,00`

---

## 3. Storage & Arithmetic Rules (Critical for Data Integrity)
- **Avoid Floating-Point Arithmetic**:
  - JavaScript `Number` floating-point calculations (e.g. `0.1 + 0.2`) introduce rounding errors that corrupt financial balances.
  - Financial calculations must use integer arithmetic (representing cents: 1 COP = 100 cents) or an exact decimal arithmetic library.
- **Database Monetary Modeling**:
  - PostgreSQL tables must use exact numeric types: `NUMERIC(14, 2)` or `BIGINT` (in cents).
  - Floating-point types (`FLOAT`, `REAL`, `DOUBLE PRECISION`) are **strictly prohibited** for financial balances.
- **Separation of Concerns**:
  - Formatting (`$ 1.250.000,50`) is strictly a UI presentation concern.
  - Raw stored data in the database and API payloads must remain unformatted numeric values (`1250000.50`).

---

## 4. UI Rendering Constraints
- **Tabular Figures**: Always render financial amounts with `font-variant-numeric: tabular-nums` (or CSS class enforcing fixed-width numerals) so columns and decimal commas align vertically.
- **Rapid Scanning**: Keep the delta sign explicit (`+$ 3.500.000`, `-$ 1.250.000,50`).
