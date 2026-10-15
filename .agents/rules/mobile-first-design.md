# Rule: Mandatory Mobile-First Financial Architecture

## 1. Core Mandate
Mobile-First is a mandatory architectural constraint for this project. Never design desktop first and "make it responsive later".

### Viewport Target Hierarchy:
1. **360px – 430px (Primary Design Target)**:
   All interfaces, navigation, forms, and financial ledgers must be designed, styled, and verified here first.
2. **768px (Tablet)**:
   Progressive adaptation providing secondary context without breaking the primary flow.
3. **1024px (Laptop)**:
   Expanded control console layout.
4. **1440px+ (Desktop)**:
   High-density financial workstation layout.

> **Crucial Clarification**: Mobile-first does NOT mean mobile-only. The information architecture must originate at 360px–430px and progressively enhance for tablet and desktop without changing the underlying financial mental model.

---

## 2. Core Guiding Heuristic
Every visual decision must answer:
> **"What financial information does this make easier to understand?"**

- Decorative styling without functional financial purpose is strictly prohibited.
- High contrast, intentional whitespace, and readable typography take precedence over visual ornamentation.

---

## 3. Information Architecture Requirements on Mobile (360px–430px)
Without navigating through multiple screens, the user must be able to understand:
1. How much money entered (Inflow Anchor)
2. How much has been consumed
3. What consumed it
4. What remains (Progressive Available Balance)
5. What is still pending (Committed vs. Tentative Obligations)

---

## 4. Interaction & Ergonomic Standards
- **Touch Targets**: All interactive elements (buttons, inputs, toggles, row actions) must have a touch target of at least **44px × 44px**.
- **Typography**: All financial numbers and currency amounts must use `font-variant-numeric: tabular-nums` to enable effortless vertical scanning.
- **One Primary Action**: Exactly one clear primary action per screen.
- **Navigation**: Use bottom navigation bars on mobile viewports for thumb-friendly reachability.

---

## 5. COP Monetary Representation & Arithmetic Precision
- **Base Currency**: COP (Colombian Peso).
- **Presentation Standard**:
  - Thousands separator: dot (`.`)
  - Decimal separator: comma (`,`)
  - Leading symbol: `$ `
  - Examples: `$ 1.250.000` or `$ 1.250.000,50`
- **Decimal Precision**: Maximum 2 decimal places. Never display more than 2 decimal places. Do not assume COP is integer-only; preserve up to 2 decimal places when they exist.
- **Arithmetic Integrity**: Avoid floating-point arithmetic. Database storage must use exact numeric types (`NUMERIC(14, 2)` or `BIGINT` in cents). Formatting is strictly a presentation concern.
- **Tabular Numerals**: All financial amounts in the UI must enforce tabular numerals (`font-variant-numeric: tabular-nums`).

---

## 6. UI Generation Protocol
Before generating or modifying any UI component, HTML, or SCSS:
1. Consult both `ui-ux-pro-max` (general UX/ergonomics) and `personal-finance-design` (domain financial system).
2. Adhere strictly to the three visual direction options (Precision Control Console, Editorial Ledger, Tactile Cashflow Stream) once an alternative is approved.
3. Verify at 360px viewport before considering wider breakpoints.

