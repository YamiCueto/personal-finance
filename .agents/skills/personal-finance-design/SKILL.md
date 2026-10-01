---
name: personal-finance-design
description: >-
  Enforces the visual identity, progressive balance narrative, and mobile-first 
  ergonomics for the Personal Finance control system. Consult this skill whenever 
  designing or implementing UI, layouts, styles, or components.
---

# Personal Finance Design System

A domain-specific design skill for the Personal Finance management system, replacing generic dashboard tropes with a dedicated progressive financial control ledger.

---

## 1. Core Visual Narrative: The Progressive Balance Engine

The core financial experience is built around progressive capital consumption:

```
Income (Inflow Anchor)
  ↓
Expense / Obligation (Deduction with delta)
  ↓
Remaining Balance (Running subtotal)
  ↓
Next Movement
  ↓
Remaining Balance
```

The progressive balance is the primary information hierarchy. Every movement visibly updates the remaining available capital.

- For complete layout mechanics, consult [references/progressive_balance.md](./references/progressive_balance.md).
- For strictly prohibited aesthetic patterns, consult [references/anti_patterns.md](./references/anti_patterns.md).

---

## 2. Viewport Hierarchy & Progressive Enhancement

1. **360px – 430px (Primary Design Target)**:
   - Single-column linear waterfall ledger.
   - All critical metrics visible in one view: Total Entered, Total Consumed, Consumption Details, Remaining Liquidity, and Pending Obligations.
   - Touch targets $\ge 44\text{px}$.
   - Bottom navigation for thumb access.
2. **768px (Tablet)**:
   - Expands the progressive ledger with inline contextual insights without fragmenting the central balance column.
3. **1024px (Laptop) & 1440px+ (Desktop)**:
   - Multi-column control console layout: Progressive ledger remains central, accompanied by obligation timelines and long-term goal simulators.

> **Key Rule**: Mobile-first does NOT mean mobile-only. The information architecture originates at 360–430px and progressively enhances for larger screens without modifying the underlying financial mental model.

---

## 3. Visual Direction Protocol

When the UI design phase commences, no visual direction will be applied unilaterally. Three distinct aesthetic directions must be presented for selection:

1. **Precision Control Console**: Clean, high-density, technical aesthetic with subtle dividing lines, dark/light contrast, and high-legibility tabular numerals.
2. **Editorial Ledger**: Monochromatic structure with high typographic contrast, generous functional whitespace, and clean accounting dividers.
3. **Tactile Cashflow Stream**: Vertical progress indicators connecting inflows directly to running balances, emphasizing liquidity thresholds and trajectory.

*(No visual direction is selected yet. Alternatives must be reviewed before writing components or themes.)*

---

## 4. Financial Legibility & Ergonomics
- **Tabular Figures**: All currency figures MUST enforce `font-variant-numeric: tabular-nums` to guarantee vertical decimal and column alignment.
- **Delta + Subtotal Pairing**: Every transaction line displays both its individual movement (`-$ 1.250.000`) and the resulting balance (`$ 2.250.000`).
- **Solar Milestone Visibility**: The long-term renewable energy capital allocation is treated as a dedicated milestone tier, visually protected from everyday operational expenses.

---

## 5. COP Monetary Representation & Precision
- **Base Currency**: COP (Colombian Peso).
- **Colombian Presentation**: Thousands separated by dot (`.`), decimals separated by comma (`,`), e.g., `$ 1.250.000` or `$ 1.250.000,50`.
- **Decimal Precision**: Maximum 2 decimal places. Never display more than 2 decimal places.
- **Exact Numeric Representation**: Avoid floating-point arithmetic. Database storage must use exact numeric types (`NUMERIC(14, 2)` or `BIGINT` in cents).
- Detailed guide: [references/currency_formatting.md](./references/currency_formatting.md).

