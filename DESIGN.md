# PaperBridge UI design contract

This document is the implementation contract for frontend visual work. The live
[`UNITHON_REAL`](https://www.figma.com/design/L5dyIKxukj0L2SHCPmFdSZ/UNITHON_REAL?t=tfxwzzdGDQO248bw-0)
Figma file is authoritative when it differs from this document. Update this file
before introducing a token or shared primitive.

## 1. Reference and confidence

- Figma file: `UNITHON_REAL` (`L5dyIKxukj0L2SHCPmFdSZ`).
- Primary application board: `PaperPilot — Screens`, node `281:90`, measured
  `1707 × 9788`, vertical auto-layout with 48px frame padding and gap.
- Readable live-Chrome evidence:
  `.omo/teams/team-b70c30a3/artifacts/FEFIGMA-board-50-far-top.png` confirms
  `01 · Library — 목록`; `FEFIGMA-board-50-center.png` confirms Reader selection,
  page-job progress, and Chat states.
- Route-to-frame fidelity is strict for Library and Reader frames that are readable
  in those captures. Landing, Login, Settings, and Account have no proven direct
  frame mapping; they use the same measured system without claiming pixel-level
  page correspondence.
- Exact child node IDs, font metadata, and several hexadecimal values remain
  `OPEN`. Qualitative values must not be upgraded to exact values without a new
  Figma inspection or sampled capture recorded in the manifest.

## 2. Product principles

1. The reading surface is dominant. Navigation and metadata stay visually quiet.
2. Density comes from compact hierarchy, not reduced legibility or tiny targets.
3. State is always text plus color: `완료`, `진행 중`, `대기`, `실패`, `오류`.
4. Evidence precedes AI explanation. Source text, page reference, and operation
   state appear before generated summaries or actions.
5. Use flat neutral surfaces and one-pixel boundaries. No decorative gradient,
   hero artwork, glow, glass effect, or heavy shadow.
6. Preserve user-visible behavior and contract-backed data. Figma fidelity may
   change composition and styling, not authentication, upload, reader, or provider
   semantics.

## 3. Tokens

The current neutral family is retained where the live capture supports it. Tokens
marked “sample pending” are centralized so a later exact Figma sample is one edit.

| Token | Value | Figma trace |
| --- | --- | --- |
| `--color-background` | `#f5f6f8` | Light outer field, live overview and 50% captures |
| `--color-canvas` | `#e9eaee` | Board/screen-group field; sample pending |
| `--color-surface` | `#ffffff` | Navigation, document, panel, and card surfaces |
| `--color-text` | `#111827` | Primary type and dark primary controls; sample pending |
| `--color-text-muted` | `#6a717f` | Quiet navigation, metadata, and help copy; sample pending |
| `--color-text-weak` | `#9ca3af` | Disabled and tertiary text; sample pending |
| `--color-border` | `#e5e7eb` | Restrained one-pixel dividers; sample pending |
| `--color-input-border` | `#d1d5db` | Inputs and compact secondary controls; sample pending |
| `--color-selection-background` | `#fff7c2` | Reader selected/reference text; sample pending |
| `--color-success-background` | `#ecfdf5` | Compact green completion chips; sample pending |
| `--color-success-text` | `#047857` | Completion text; sample pending |
| `--color-progress-background` | `#eff6ff` | Page-job and processing chips; sample pending |
| `--color-progress-text` | `#1d4ed8` | Processing text; sample pending |
| `--color-warning-background` | `#fffbeb` | Warning/reference emphasis; sample pending |
| `--color-warning-text` | `#b45309` | Warning text; sample pending |
| `--color-error-background` | `#fef2f2` | Failure/error chip and alert field; sample pending |
| `--color-error-text` | `#b91c1c` | Failure/error text; sample pending |
| `--font-sans` | `Pretendard, "Malgun Gothic", ui-sans-serif, system-ui, sans-serif` | CJK-safe implementation stack; Figma family `OPEN` |
| `--font-mono` | `ui-monospace, SFMono-Regular, Consolas, monospace` | IDs and machine-readable values only |
| `--sidebar-width` | `224px` | 1440-wide Figma frames measure approximately 224px at 50% capture |

- Use a 4px spacing cadence. Figma-confirmed implementation values are 8px compact
  gaps, 16px panel gaps, 20px card/list padding, and 32px desktop content padding.
- Type scale: 12px metadata, 14px controls/body, 16px section titles, 28px page
  titles. Exact Figma font metrics are `OPEN`; preserve hierarchy and CJK line
  breaking until direct font metadata is available.
- Radius: 6px status chips, 8px controls/panels, 12px large cards/workspaces.
  Exact radii are `OPEN`, but the reference clearly uses restrained rounding.
- Depth comes from surface contrast and 1px borders. Do not add shadows unless a
  later Figma node proves one.
- Numbers, times, pages, step numbers, and IDs use tabular numerals.

## 4. Desktop composition

The readable Figma frames use a 1440-class application viewport:

```text
┌──────── 224px rail ────────┬──────── dominant document / task surface ───────┬── metadata ──┐
│ PaperPilot                 │ compact page / zoom / status toolbar             │ Info Chat HL │
│ 논문 리더                  ├───────────────────────────────────────────────────┤              │
│                            │                                                   │ job state or │
│ 라이브러리                 │ white document or route content                   │ selected text│
│ active document            │                                                   │ AI response  │
│ 설정                       │                                                   │              │
└────────────────────────────┴───────────────────────────────────────────────────┴──────────────┘
```

- The rail is a quiet white surface. Product name and small descriptor lead;
  navigation uses compact rows with a soft neutral active fill.
- Library places title/help above a compact upload row, a small saved-count card,
  and a single bordered table. It does not become a card mosaic.
- Reader places a compact utility rail above the document. The document owns dense
  scrolling; the application body must not become the PDF scroll owner.
- Reader side-panel tabs are `정보`, `Chat`, and `하이라이트`. The panel shows
  operation state, selection context, summaries, or highlights without competing
  with the document.
- Text selection uses pale yellow in the document and may expose a compact dark
  action toolbar. Status text visible in the reference includes `준비 완료` and
  green `완료` chips.

## 5. Responsive behavior

Figma child variants at 375px and 768px are not yet extractable, so these rules are
explicit implementation extrapolations, not claimed Figma measurements.

| Viewport | Contract |
| --- | --- |
| `1280px+` | Keep the 224px rail. Reader keeps document and right metadata adjacent while the document remains dominant. |
| `768px` | Replace the fixed rail with a compact sticky product header and horizontal route navigation. Reader metadata moves below the document; controls wrap without shrinking touch targets. |
| `375px` | Use 16px outer padding, one content column, at least 44px interactive targets, and local horizontal/vertical PDF scrolling. Do not invent icon-only navigation. |

At every width:

- No unintended page-level horizontal overflow.
- Long Korean/English titles wrap or ellipsize intentionally.
- Visible focus, keyboard reachability, semantic headings, labelled form controls,
  and live-region status remain intact.
- `prefers-reduced-motion: reduce` disables non-essential transitions and scroll
  animation. No UI depends on motion to explain state.

## 6. Shared primitives

| Primitive | Contract |
| --- | --- |
| `AppShell` | Figma-derived product rail, active navigation, mobile header, and one clear main landmark. |
| `PageHeader` | Page title plus one quiet explanatory line; actions remain compact and right-aligned when space allows. |
| `Card` | White surface, 1px neutral boundary, no shadow; flush variant for tables/lists. |
| `Button` | 44px target; dark primary, white bordered secondary, semantic danger. Disabled state is textually and visually clear. |
| `Field` / `Input` | Visible label, 44px input, help/error relationship exposed to assistive technology. |
| `StatusBadge` | Compact textual state; color never carries the state alone. |
| `Alert` | One concise condition and next action. Do not echo secrets, PDF text, or raw provider errors. |
| `EmptyRow` | A restrained sentence in the existing surface; no decorative empty-state illustration. |

Create a shared component only when at least two routes use the same semantic and
visual pattern. Page-specific composition stays local to its route.

## 7. State model

- **Empty:** one clear next action, no fabricated content.
- **Working:** inputs stay stable/read-only, status is `진행 중`, and real steps or
  operation identifiers are shown rather than fake percentages.
- **Ready:** green textual completion state; retain the same layout so state changes
  do not cause large jumps.
- **Failure:** red textual condition, evidence, and recovery action.
- **System error:** distinguish transport/provider/system problems from document or
  validation failures and state what the user can do next.

## 8. Verification contract

- Source tests protect behavior; visual fidelity requires fresh browser captures.
- Capture `/`, `/login`, `/library`, `/reader/:documentId`, `/settings`, and
  `/account` at 375, 768, and 1280 after a production build.
- Compare Library and Reader against the readable Figma frames. Report other routes
  as “Figma-system adaptation; direct frame mapping OPEN.”
- Validate default, hover/focus, keyboard, empty/loading/error, long CJK copy, local
  scroll ownership, and reduced-motion behavior.
- Measure production output only. Development tooling must be development-gated and
  absent from the production bundle.
