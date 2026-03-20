# Hall of Fame Contest Tab — Design Document
**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Add a dedicated **Hall of Fame** tab to the employee dashboard that presents the current quarter's CEO's Club contest as a celebration/trophy-room experience. This is distinct from the existing **CEO's Club** tab, which shows a dense ranked leaderboard. The Hall of Fame tab is visual-first and contest-oriented.

---

## Goals

- Give CEO's Club winners a celebratory showcase (not just a table row)
- Surface contest timeline so all employees know where they stand in the quarter
- Lay groundwork for historical Hall of Fame (future quarters — "coming soon" for now)

---

## Non-Goals

- No new API endpoint (reuses existing `/api/hof/ceos-club` data)
- No prize/reward details section
- No historical winner data (placeholder only)
- No changes to the existing CEO's Club tab

---

## Data Source

Reuses the existing `hofData` state already fetched from `/api/hof/ceos-club` at login in `app/dashboard/page.tsx`. No additional API calls or loading states required.

Key fields used:
- `hofData.quarter` — `quarter_label`, `quarter_start`, `quarter_end`
- `hofData.b2b` / `hofData.b2c` — ranked entries with `is_ceos_club`, `name`, `branch`, `zone`, `trail`, `fees`, `netSales`, `newSips`, `achievementPct`, `rank`
- `hofData.userSegment` — determines default segment shown

---

## Tab Definition

| Property | Value |
|---|---|
| Tab ID | `HOF_CONTEST` |
| Label | Hall of Fame |
| Icon | `Trophy` (Lucide) |
| Visibility | Always visible to all users (same as CEO's Club tab) |
| Position | Rightmost tab, after CEO's Club |

---

## Page Layout

### 1. Contest Banner (full-width)
- Dark gradient background (deep navy/charcoal with gold accents)
- `Trophy` icon + **"Hall of Fame"** heading
- Quarter label: e.g., **"Q4 FY26"**
- Date range: "Jan 1 – Mar 31, 2026"
- Live countdown chip: **"X days remaining"** computed from `quarter_end`
  - If `quarter_end` is in the past: shows **"Quarter Closed"** badge instead
- Tagline: *"Top 20% by achievement qualify for CEO's Club"*

### 2. Segment Switcher
- B2B Partners / B2C Digital toggle
- Hidden if user's `userSegment` is `'b2b'` or `'b2c'` (single-segment users)
- Defaults to user's own segment; defaults to B2B for `'all'` users

### 3. CEO's Club Winners Grid
- Only entries where `is_ceos_club === true`
- Responsive grid: 3 columns (desktop) → 2 (tablet) → 1 (mobile)
- Section header: `Crown` icon + **"CEO's Club Members"** + member count chip

#### Winner Card (rich format)
```
┌─────────────────────────────────┐
│ 👑 #1                [CEO's Club]│  ← rank badge (top-left) + ribbon (top-right)
│                                 │
│   K Vishnuvardhan               │  ← name (large, bold)
│   Hyderabad · B2B               │  ← branch · zone (muted)
│                                 │
│         94.2%                   │  ← achievement % (large, amber/gold)
│       of target                 │
│                                 │
│  Trail ₹1.98 Cr   Fees ₹0.12 Cr │  ← actual metric numbers (small)
└─────────────────────────────────┘
```

**Visual treatment:**
- Amber/gold gradient border for all club members
- Warm cream/amber card background tint
- Rank badges: Crown icon for #1, gold/silver/bronze medal icons for #2/#3, plain number chip for the rest
- Achievement % is the hero number — large, bold, amber

**B2C variant:** Shows `Net Sales ₹X Cr · SIPs ₹Y Cr` instead of Trail/Fees

### 4. All Participants (collapsible)
- Collapsed by default: **"Show all X participants ▾"** toggle button
- When expanded: compact ranked rows for non-club members only (same styling as current CEO's Club tab rows)
- Section header when expanded: `Users` icon + **"All Participants"**

### 5. Past Quarters Placeholder
- Muted/greyed section at the bottom of the page
- `Clock` icon + **"Past Hall of Fame"** heading
- Subtext: *"Historical CEO's Club winners will appear here"*
- **"Coming Soon"** badge
- No interaction

---

## Component Structure

All new code lives in `app/dashboard/page.tsx` as inline components (consistent with existing `HofRankRow` pattern):

```
HofContestTab (new component)
├── ContestBanner
├── SegmentSwitcher (reuse/adapt existing logic)
├── WinnersGrid
│   └── WinnerCard (new)
├── AllParticipantsSection (collapsible)
│   └── HofRankRow (reuse existing)
└── PastQuartersPlaceholder
```

New tab entry added to the `tabs` array in the dashboard page component.

---

## State

One new piece of local state:
- `showAllParticipants: boolean` — toggles the collapsible participants section (default: `false`)

No new API state, no new loading states. Segment state reuses existing `hofSegment`.

---

## Edge Cases

| Case | Behaviour |
|---|---|
| No active quarter configured | Show "No active contest" message in banner area |
| Quarter has ended | Banner shows "Quarter Closed" instead of countdown |
| Zero CEO's Club members | Show "No members yet" in winners grid |
| `hofLoading === true` | Show skeleton/spinner in banner and grid areas |
| User segment = B2C | Default to B2C tab, hide B2B data |

---

## Out of Scope (Future)

- `hof_winners` table for persisting past quarter winners
- Admin UI to backfill historical data
- Prize/reward details field on quarter config
- Animations / confetti on winner cards
