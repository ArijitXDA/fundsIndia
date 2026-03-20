# Hall of Fame Contest Tab — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Hall of Fame" dashboard tab that presents the current quarter's CEO's Club winners as a trophy-room celebration layout, distinct from the existing dense-table CEO's Club tab.

**Architecture:** Pure UI addition to `app/dashboard/page.tsx`. Reuses `hofData` already fetched at login — zero new API calls or loading states. New `WinnerCard` component renders each CEO's Club member as a rich card; `HofRankRow` (existing) handles the collapsible participants list.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Lucide React

---

## Reference

- **Primary file:** `app/dashboard/page.tsx` (1414 lines)
- **Existing HOF tab block:** lines 1102–1262 (`activeTab === 'HOF'`)
- **Existing `HofRankRow` component:** lines 1318–1414
- **Current imports (line 5):** `TrendingUp, Award, BarChart3, Trophy, Medal, Crown, Building2, Users, Network, KeyRound, CheckCircle, Shield, LogOut, UserCheck, Globe, ChevronLeft, ChevronRight, Star, Loader2`
  - `Trophy` ✓ already imported
  - `Clock` ✗ needs to be added
- **Current `TabType` (line 31):** `'B2B' | 'B2C' | 'PW' | 'HOF'`
- **Tab array built at:** lines 175–191

---

## Task 1: Add `Clock` to imports, extend `TabType`, add state and tab entry

**File:** `app/dashboard/page.tsx`

**Step 1: Add `Clock` to lucide import on line 5**

Change:
```typescript
import { TrendingUp, Award, BarChart3, Trophy, Medal, Crown, Building2, Users, Network, KeyRound, CheckCircle, Shield, LogOut, UserCheck, Globe, ChevronLeft, ChevronRight, Star, Loader2 } from 'lucide-react';
```
To:
```typescript
import { TrendingUp, Award, BarChart3, Trophy, Medal, Crown, Building2, Users, Network, KeyRound, CheckCircle, Shield, LogOut, UserCheck, Globe, ChevronLeft, ChevronRight, Star, Loader2, Clock } from 'lucide-react';
```

**Step 2: Extend `TabType` on line 31**

Change:
```typescript
type TabType = 'B2B' | 'B2C' | 'PW' | 'HOF';
```
To:
```typescript
type TabType = 'B2B' | 'B2C' | 'PW' | 'HOF' | 'HOF_CONTEST';
```

**Step 3: Add `showAllParticipants` state (after `hofSegment` state, ~line 51)**

After:
```typescript
  const [hofSegment, setHofSegment] = useState<'B2B' | 'B2C'>('B2B');
```
Add:
```typescript
  const [showAllParticipants, setShowAllParticipants] = useState(false);
```

**Step 4: Add the Hall of Fame tab to the tabs array (line 191)**

Change:
```typescript
  const hofTab = { id: 'HOF' as TabType, name: "CEO's Club", icon: Star, description: 'Hall of Fame', businessUnit: '' };

  const userBusinessUnit = user?.employee?.business_unit;

  // B2B/B2C/Private Wealth users see only their segment tab + HOF
  // All other business units see all segment tabs + HOF
  const visibleSegmentTabs = ['B2B', 'B2C', 'Private Wealth'].includes(userBusinessUnit)
    ? segmentTabs.filter(tab => tab.businessUnit === userBusinessUnit)
    : segmentTabs;

  const tabs = [...visibleSegmentTabs, hofTab];
```
To:
```typescript
  const hofTab = { id: 'HOF' as TabType, name: "CEO's Club", icon: Star, description: 'Hall of Fame', businessUnit: '' };
  const hofContestTab = { id: 'HOF_CONTEST' as TabType, name: 'Hall of Fame', icon: Trophy, description: 'HOF Contest', businessUnit: '' };

  const userBusinessUnit = user?.employee?.business_unit;

  // B2B/B2C/Private Wealth users see only their segment tab + HOF
  // All other business units see all segment tabs + HOF
  const visibleSegmentTabs = ['B2B', 'B2C', 'Private Wealth'].includes(userBusinessUnit)
    ? segmentTabs.filter(tab => tab.businessUnit === userBusinessUnit)
    : segmentTabs;

  const tabs = [...visibleSegmentTabs, hofTab, hofContestTab];
```

**Step 5: Run the dev server and verify the new tab appears in the tab bar**

```bash
cd "RNR Dashboard/rnr-dashboard"
npm run build 2>&1 | tail -20
```
Expected: Build succeeds (TypeScript happy with new tab type).

**Step 6: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add Hall of Fame contest tab entry and state"
```

---

## Task 2: Add `HOF_CONTEST` rendering block

**File:** `app/dashboard/page.tsx`

This block goes immediately after the closing of the `HOF` tab block (after line 1262, before `</div></main>`).

**Step 1: Insert the full HOF_CONTEST rendering block**

After line 1262 (`})()}`), add:

```tsx
          {/* ── Hall of Fame Contest Tab ── */}
          {activeTab === 'HOF_CONTEST' && (() => {
            const hasB2B = hofData?.b2b !== null && hofData?.b2b !== undefined;
            const hasB2C = hofData?.b2c !== null && hofData?.b2c !== undefined;
            const showBothSegments = hasB2B && hasB2C;
            const activeHofRows: any[] = hofSegment === 'B2B' ? (hofData?.b2b ?? []) : (hofData?.b2c ?? []);
            const quarter = hofData?.quarter;
            const clubRows = activeHofRows.filter((r: any) => r.is_ceos_club);
            const nonClubRows = activeHofRows.filter((r: any) => !r.is_ceos_club);

            // Countdown: days remaining until quarter_end
            const daysLeft = quarter
              ? Math.ceil((new Date(quarter.quarter_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;
            const quarterEnded = daysLeft !== null && daysLeft <= 0;

            return (
              <div>
                {/* Contest Banner */}
                <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 px-8 py-7 relative overflow-hidden">
                  {/* Gold shimmer overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-yellow-400/10 to-amber-500/5 pointer-events-none" />
                  <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-amber-400/20 rounded-2xl p-3 border border-amber-400/30">
                        <Trophy className="w-8 h-8 text-amber-400" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-white">Hall of Fame</h2>
                        <p className="text-slate-400 text-sm mt-0.5">CEO&apos;s Club · Top 20% by achievement</p>
                      </div>
                    </div>
                    {/* Quarter + Countdown */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {quarter && (
                        <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center border border-white/10">
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Quarter</p>
                          <p className="text-lg font-bold text-white">{quarter.quarter_label}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(quarter.quarter_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            {' – '}
                            {new Date(quarter.quarter_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      )}
                      {daysLeft !== null && (
                        <div className={`rounded-xl px-4 py-2.5 text-center border ${
                          quarterEnded
                            ? 'bg-gray-600/40 border-gray-500/30'
                            : daysLeft <= 7
                            ? 'bg-red-500/20 border-red-400/30'
                            : 'bg-amber-400/20 border-amber-400/30'
                        }`}>
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Status</p>
                          {quarterEnded ? (
                            <p className="text-base font-bold text-gray-300">Quarter Closed</p>
                          ) : (
                            <>
                              <p className={`text-2xl font-black ${daysLeft <= 7 ? 'text-red-400' : 'text-amber-400'}`}>
                                {daysLeft}
                              </p>
                              <p className="text-xs text-slate-400">days left</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Segment switcher */}
                  {showBothSegments && (
                    <div className="relative z-10 mt-5 flex items-center gap-2">
                      <button
                        onClick={() => setHofSegment('B2B')}
                        className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                          hofSegment === 'B2B'
                            ? 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/30'
                            : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10'
                        }`}
                      >
                        B2B Partners
                      </button>
                      <button
                        onClick={() => setHofSegment('B2C')}
                        className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                          hofSegment === 'B2C'
                            ? 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/30'
                            : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10'
                        }`}
                      >
                        B2C Digital
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-8">
                  {/* Loading */}
                  {hofLoading && (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                    </div>
                  )}

                  {/* No active quarter */}
                  {!hofLoading && !hofData && (
                    <div className="text-center py-16">
                      <Trophy className="w-20 h-20 text-gray-200 mx-auto mb-4" />
                      <p className="text-xl font-semibold text-gray-600 mb-2">No Active Contest</p>
                      <p className="text-gray-500">Ask your admin to configure an active HOF quarter.</p>
                    </div>
                  )}

                  {/* No data for this segment */}
                  {!hofLoading && hofData && activeHofRows.length === 0 && (
                    <div className="text-center py-16">
                      <Trophy className="w-20 h-20 text-gray-200 mx-auto mb-4" />
                      <p className="text-xl font-semibold text-gray-600 mb-2">No Data Yet</p>
                      <p className="text-gray-500">
                        {hofSegment === 'B2B' ? 'B2B' : 'B2C'} MIS data hasn&apos;t been synced for this period.
                      </p>
                    </div>
                  )}

                  {!hofLoading && activeHofRows.length > 0 && (
                    <div className="space-y-10">
                      {/* CEO's Club Winners Grid */}
                      <div>
                        <div className="flex items-center space-x-2 mb-6">
                          <Crown className="w-5 h-5 text-amber-500" />
                          <h3 className="text-lg font-bold text-gray-900">CEO&apos;s Club Members</h3>
                          <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
                            {clubRows.length} member{clubRows.length !== 1 ? 's' : ''} · Top 20%
                          </span>
                        </div>
                        {clubRows.length === 0 ? (
                          <p className="text-gray-400 text-sm">No members yet for this period.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {clubRows.map((person: any) => (
                              <WinnerCard key={person.name} person={person} segment={hofSegment} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* All Participants (collapsible) */}
                      {nonClubRows.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowAllParticipants(p => !p)}
                            className="flex items-center space-x-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors mb-4"
                          >
                            <Users className="w-4 h-4" />
                            <span>{showAllParticipants ? 'Hide' : 'Show all'} {nonClubRows.length} participants</span>
                            <span>{showAllParticipants ? '▲' : '▾'}</span>
                          </button>
                          {showAllParticipants && (
                            <div className="space-y-2">
                              {nonClubRows.map((person: any) => (
                                <HofRankRow
                                  key={person.name}
                                  person={person}
                                  segment={hofSegment}
                                  isClubMember={false}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Past Quarters Placeholder */}
                      <div className="border border-dashed border-gray-200 rounded-2xl p-8 text-center bg-gray-50/50">
                        <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <h4 className="text-base font-semibold text-gray-400 mb-1">Past Hall of Fame</h4>
                        <p className="text-sm text-gray-400">Historical CEO&apos;s Club winners will appear here</p>
                        <span className="inline-block mt-3 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
                          Coming Soon
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
```

**Step 2: Build to check for TypeScript errors**

```bash
npm run build 2>&1 | tail -30
```
Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add Hall of Fame contest tab rendering block"
```

---

## Task 3: Add `WinnerCard` component

**File:** `app/dashboard/page.tsx` — add after `HofRankRow` at line 1414 (end of file)

**Step 1: Append `WinnerCard` component**

Add after the last `}` of `HofRankRow`:

```tsx
// ── Winner Card (Hall of Fame Contest Tab) ────────────────────────────────────

function WinnerCard({
  person,
  segment,
}: {
  person: any;
  segment: 'B2B' | 'B2C';
}) {
  const rank = person.rank;

  const getRankBadge = (r: number) => {
    if (r === 1) return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-yellow-400 shadow-md shadow-yellow-400/40">
        <Crown className="w-5 h-5 text-white" />
      </div>
    );
    if (r === 2) return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-300 shadow-md">
        <Medal className="w-5 h-5 text-white" />
      </div>
    );
    if (r === 3) return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-600 shadow-md shadow-amber-600/40">
        <Medal className="w-5 h-5 text-white" />
      </div>
    );
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 border-2 border-amber-300">
        <span className="text-sm font-black text-amber-700">#{r}</span>
      </div>
    );
  };

  return (
    <div className="relative bg-gradient-to-b from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 rounded-t-2xl" />

      {/* Top row: rank badge + CEO's Club ribbon */}
      <div className="flex items-start justify-between mb-4">
        {getRankBadge(rank)}
        <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-300">
          <Crown className="w-3 h-3" />
          <span>CEO&apos;s Club</span>
        </span>
      </div>

      {/* Name + Location */}
      <h3 className="text-base font-bold text-gray-900 leading-tight mb-0.5">{person.name}</h3>
      <p className="text-xs text-gray-500 mb-4">
        {segment === 'B2B'
          ? `${person.branch}${person.zone ? ` · ${person.zone}` : ''}`
          : person.team}
      </p>

      {/* Achievement % — hero number */}
      <div className="text-center mb-4">
        <p className="text-4xl font-black text-amber-600 leading-none">
          {person.achievement_pct?.toFixed(1)}%
        </p>
        <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">of target achieved</p>
      </div>

      {/* Metric numbers */}
      <div className="bg-white/60 rounded-xl p-3 border border-amber-200/60">
        {segment === 'B2B' ? (
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Trail MTD</p>
              <p className="font-bold text-gray-800">₹{person.trail_actual?.toFixed(2)} Cr</p>
              <p className="text-xs text-amber-600">{person.trail_pct?.toFixed(1)}%</p>
            </div>
            <div className="w-px bg-amber-200" />
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Fees MTD</p>
              <p className="font-bold text-gray-800">₹{person.fees_actual?.toFixed(2)} Cr</p>
              <p className="text-xs text-gray-400">{person.fees_pct?.toFixed(1)}%</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Net Sales</p>
              <p className="font-bold text-gray-800">₹{person.net_sales_actual?.toFixed(2)} Cr</p>
              <p className="text-xs text-amber-600">{person.net_sales_pct?.toFixed(1)}%</p>
            </div>
            <div className="w-px bg-amber-200" />
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Net SIPs</p>
              <p className="font-bold text-gray-800">₹{person.net_sips_actual?.toFixed(2)} Cr</p>
              <p className="text-xs text-gray-400">{person.net_sips_pct?.toFixed(1)}%</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Build to verify**

```bash
npm run build 2>&1 | tail -20
```
Expected: Clean build, zero TypeScript errors.

**Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add WinnerCard component for Hall of Fame contest tab"
```

---

## Task 4: Fix OrgChart layout bug (justify-center overflow)

**File:** `components/OrgChartModal.tsx`

This is the outstanding bug where the org chart's `justify-center` CSS causes the left side of a wide tree (Akshay's 12 direct reports) to be inaccessible — browsers won't scroll left past 0 when the container uses `justify-center`.

**Step 1: Find the scroll container with `justify-center`**

Grep for it:
```bash
grep -n "justify-center" components/OrgChartModal.tsx
```

**Step 2: Change `justify-center` to `justify-start` on the inner scroll div**

The line will look like:
```tsx
<div className="min-w-full min-h-full flex items-start justify-center p-10">
```
Change to:
```tsx
<div className="min-w-full min-h-full flex items-start justify-start p-10">
```

**Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add components/OrgChartModal.tsx
git commit -m "fix: change org chart scroll container from justify-center to justify-start to prevent left-overflow cut-off"
```

---

## Task 5: Final build + deploy

**Step 1: Full production build**

```bash
npm run build 2>&1
```
Expected: `✓ Compiled successfully`. Zero errors, zero warnings about unknown types.

**Step 2: Push to main for Vercel deploy**

```bash
git push origin main
```

**Step 3: Verify on Vercel**

Check deployment logs via Vercel dashboard or CLI. Confirm:
- Hall of Fame tab appears in the tab bar
- Clicking it shows the dark contest banner with quarter info and countdown
- CEO's Club winners appear as gold-bordered cards in a grid
- "Show all X participants" toggle works
- "Past Hall of Fame — Coming Soon" placeholder visible at bottom
- Org chart scrolls correctly left-to-right from the start position

---

## Edge Cases to Manually Verify

| Scenario | Expected |
|---|---|
| `hofLoading === true` | Spinner shown in Hall of Fame tab |
| No active quarter configured | "No Active Contest" empty state |
| Quarter end date in past | Banner shows "Quarter Closed" instead of countdown |
| `daysLeft <= 7` | Countdown chip turns red |
| Zero CEO's Club members | "No members yet" text in grid area |
| B2C user opens tab | B2C segment auto-selected, no segment switcher shown |
| Single card in grid | Card renders at natural width (not stretched) |
