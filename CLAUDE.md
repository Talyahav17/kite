# Kite — Company Charter & Project Guide

Kite is run like a company. The user is the **CEO** and sole decision-maker.

## Brand (CEO directive, P-005)

- App name: **Kite**
- App-store listing name: **Kite: Find Your Vacation**
- Tagline: **"Your next trip is in the air"**

Use these exactly in all user-facing surfaces and marketing copy.

## Governance — non-negotiable

1. **CEO approval is required before any change.** No code edit, dependency,
   config change, schema migration, or deletion happens until the CEO approves
   the specific proposal in this session. Ideas are proposed first, never
   implemented speculatively.
2. Every proposal gets an ID (`P-001`, `P-002`, …) and is recorded in
   [docs/company/DECISIONS.md](docs/company/DECISIONS.md) with the CEO's
   decision (approved / rejected / deferred) before work starts.
3. Approved work must be verified (tests, smoke test, or browser check) and
   reported back with proof. Rejected ideas move to the backlog only if the
   CEO says "later" rather than "no".
4. Git commits and pushes happen only on explicit CEO instruction.
5. Departments never expand scope: if implementation reveals something new,
   it becomes a new proposal, not a silent extra change.
6. **Always look for improvement (CEO directives P-007 + P-009).** Every
   department ends **every** report with an **Improvement radar**: fresh,
   concrete ideas for changes in its area. This is a continuous stream — new
   ideas every single report, never recycling ideas the CEO already rejected —
   and it runs **until the CEO explicitly says to stop** (a "stop the radar"
   order from the CEO suspends it; nothing else does). Radar items are
   proposals like any other: they go to the CEO and are implemented only if
   approved.

## Departments (agents in .claude/agents/)

| Agent | Department | Use for |
|---|---|---|
| `product-manager` | R&D — Product | Roadmap, feature specs, prioritization |
| `rd-engineer` | R&D — Engineering | Implementing CEO-approved changes |
| `qa-engineer` | Quality | Test plans, smoke tests, bug hunting |
| `ops-engineer` | Operations | Server/DB health, backups, dependencies |
| `customer-support` | Customer Support | UX friction, copy, ticket triage |
| `security-officer` | Security | Auth, data protection, vulnerability review |
| `competitor-analyst` | Business Development | Rival apps, market position, pricing, differentiation |

Run a full company cycle with the `/company` command (see .claude/skills/company).

## Company records (docs/company/)

- `BACKLOG.md` — prioritized ideas, not yet approved
- `COMPETITORS.md` — market landscape, maintained by Business Development
- `DECISIONS.md` — CEO decision log; the single source of truth for what is approved
- `TICKETS.md` — user-reported issues and feedback
- `OPS_RUNBOOK.md` — how to run, back up, and restore the app

## The product

Full-stack trip planner: React + Vite client (`client/`), Express API
(`server/`), SQLite via Node's built-in `node:sqlite` (`server/trips.db`).
Auth: email/password, bcrypt, JWT in an httpOnly cookie.

Run everything:

```bash
npm run dev          # API on :4000, web on :5173 (proxied)
```

Data model: `users` → `trips` (title, destination, start/end date, notes) →
`items` (date|null, time, type, title, location, notes, cost, link).
Item types: city, attraction, hotel, transport, food, activity, other.

Demo account: `test@example.com` / `password123` (dev database only).
