# Personal Finance Management System

A personal financial management web application designed to replace spreadsheet-based financial tracking with a reactive, secure system.

## 🎯 Product Philosophy: The Progressive Balance Engine

The core financial experience is built around progressive capital consumption:

```
Income
  ↓
Expense / Obligation
  ↓
Remaining Balance
  ↓
Next Expense / Obligation
  ↓
Remaining Balance
```

Every monetary event directly and visibly reduces the remaining available capital, providing real-time visibility into financial trajectory, budget boundaries, and milestone progress (such as capital allocation for a home renewable energy / solar installation project).

## 📱 Mandatory Mobile-First Architecture

Mobile-First is a non-negotiable architectural constraint:
- **Primary Design Target (360px – 430px)**: The progressive financial waterfall, authentication, and core interactions must be fully readable, actionable, and ergonomic on standard mobile screens first.
- **Progressive Adaptation**: Expands progressively to 768px (tablet), 1024px (laptop), and 1440px+ (desktop) without breaking or altering the underlying financial mental model. Mobile-first does not mean mobile-only.
- **Single-Screen Clarity**: On mobile, the user must understand starting inflow, total consumed, what consumed it, remaining balance, and pending movements without jumping between screens.
- **Ergonomics & Typography**: Minimum 44px touch targets, tabular figures (`font-variant-numeric: tabular-nums`) for vertical balance scanning, and thumb-zone navigation.
- **Currency & Precision**: Base currency is COP (Colombian Peso) formatted as `$ 1.250.000` or `$ 1.250.000,50` (dot for thousands, comma for decimals, max 2 decimal places, exact numeric arithmetic).
- **Guiding Rule**: *"Every visual decision must answer: What financial information does this make easier to understand?"* Decorative tropes (generic SaaS cards, AI neon glows, banking marketing banners) are strictly prohibited.

## 🏗️ Architecture & Technology Stack

- **Frontend**: Angular (Standalone Components, Signals, Reactive Forms, SCSS)
- **Backend & Auth**: [Supabase](https://supabase.com/) (PostgreSQL with Row Level Security, Supabase Auth Email/Password)
- **Hosting**: GitHub Pages (Static SPA delivery with client-side fallback)
- **Security Perimeter**:
  - Zero private credentials (`service_role` keys, database passwords, signing secrets) in Git or client bundles.
  - Strict PostgreSQL Row Level Security (RLS) ensuring 100% of queries require an authenticated user context matching `auth.uid() = user_id`.
  - Public browser configuration limited strictly to the Supabase Project URL and Public Anon Key.

## 🚀 Sprint 0: Foundation & Security Baseline

- [x] Repository initialization & hardened `.gitignore`
- [ ] Angular 22 standalone foundation
- [ ] Supabase client integration & local CLI structure
- [ ] Email/Password authentication & route protection
- [ ] Synthetic RLS verification probe (no business tables in Sprint 0)
- [ ] Bundle secret audit & automated GitHub Pages deployment workflow

## 📜 Security Policy

- **No Real Financial Data in Git**: Real monetary numbers, bank records, and personal spreadsheets must never be committed.
- **Single-User Access**: Public user signups are restricted; only the verified account owner has access.
