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
