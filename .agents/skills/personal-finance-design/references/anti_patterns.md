# Reference: Prohibited Aesthetic & UX Anti-Patterns

To preserve the utility and identity of the Personal Finance system, the following design tropes are strictly prohibited:

---

## 1. The Generic SaaS Admin Dashboard
- **Prohibited**: A horizontal row of 4 interchangeable statistic cards with colored icons (e.g., "Total Income", "Total Spent", "Transactions", "Active Goals").
- **Why**: Fragmenting data into independent boxes destroys the progressive narrative of money moving step-by-step from inflow to remaining balance.

---

## 2. Decorative Banking App Tropes
- **Prohibited**: Marketing banners, credit card promotional carousels, account upgrade prompts, or cluttered product carousels.
- **Why**: This is a personal financial control workstation for a single user, not an institutional marketing portal.

---

## 3. AI-Generated Aesthetic Cliches
- **Prohibited**: Gratuitous neon glows, low-contrast translucent glassmorphic panels that obscure numerical legibility, floating glowing orbs, or animated particle backgrounds.
- **Why**: Financial numbers require maximum legibility, high contrast, and zero visual distortion.

---

## 4. Default Framework Starters
- **Prohibited**: Unmodified Bootstrap or Material Design default components (e.g., standard blue primary buttons, basic Material cards, generic table borders).
- **Why**: The system requires an intentional typographic and architectural identity tailored specifically for financial tracking.

---

## 5. Desktop-First Retrofitting
- **Prohibited**: Writing styles for 1440px and adding `@media (max-width: 768px)` overrides as an afterthought.
- **Why**: Responsive retrofitting results in cramped mobile layouts, misplaced action buttons, and small touch targets. All styling starts at 360px and scales upward via `min-width` queries.

---

## 6. Meaningless Charts
- **Prohibited**: Donut charts or wavy area graphs that don't directly answer how much money remains or what consumed it.
- **Why**: Visualizations must provide immediate decision-making utility, not decorative fill.
