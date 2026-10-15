# Reference: Progressive Balance Ledger Mechanics

## 1. Visual & Mathematical Model

The Progressive Balance Engine models personal cashflow as an unbroken vertical descent:

```
[ INFLOW ANCHOR ]       +$ 3.500.000,00   Starting Liquid Capital
       │
       ├─── 1. Fixed Obligation (Rent)
       │    Amount:    -$ 1.200.000,00
       │    Balance:    $ 2.300.000,00   ← Running Subtotal
       │
       ├─── 2. Fixed Obligation (Utilities)
       │    Amount:      -$ 180.000,00
       │    Balance:    $ 2.120.000,00   ← Running Subtotal
       │
       ├─── 3. Long-Term Goal (Solar Reserve)
       │    Amount:      -$ 300.000,00
       │    Balance:    $ 1.820.000,00   ← Protected Goal Allocation
       │
       └─── 4. Variable / Pending (Groceries)
            Amount:      -$ 250.000,50   (Tentative / In-Flight with cents)
            Balance:    $ 1.569.999,50   ← Net Projected Disposable Liquidity
```

---

## 2. Layout Structure on Mobile (360px–430px)

1. **Sticky Liquidity Header**:
   - Compact top bar showing the current progressive balance and total monthly inflow in COP format (`$ 1.569.999,50`).
   - Updates dynamically as the user scrolls through consumption items.
2. **Timeline Ledger Stream**:
   - Single vertical spine connecting each event.
   - Cleared movements use solid indicators; pending movements use dashed or muted indicators.
   - Each movement item stacks:
     - Left: Category/Merchant & Date
     - Right: Delta (`-$ 180.000`) on top, resulting balance (`$ 2.120.000`) immediately underneath using tabular numerals (`tabular-nums`).
3. **Summary Footer / Bottom Navigation**:
   - Fixed thumb-reachable navigation.
   - Displays real-time breakdown: Inflow | Consumed | Net Available.

---

## 3. Responsive Adaptations (Preserving the Mental Model)

- **Tablet (768px)**:
  - The central progressive spine remains intact.
  - A right-hand context pane displays category allocation percentages and progress toward the solar milestone.
- **Laptop / Desktop (1024px – 1440px+)**:
  - Left pane: Inflow sources and recurring obligations calendar.
  - Center pane: The primary progressive balance ledger (the source of truth).
  - Right pane: Long-term capital goals, solar installation savings forecast, and scenario projection.
