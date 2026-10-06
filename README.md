# Team Member order shell — usability refresh

Static prototype of the shared Order Detail / Track / Refund pattern, restyled for **scan speed and AHT** without remapping data fields.

## Goals

- Keep the same order information agents need today
- Make status, money, and *what I can do next* easier to find
- One shared shell across the three screens

## Run

```bash
python3 -m http.server 5180
```

Open http://localhost:5180

## Views

Use the **Order detail · Track · Refund** switcher. Fixture = Order `451990612` from current production screenshots.

## For review (this push)

GitHub Pages: https://mconway4.github.io/team-member-shell/

Hard-refresh if CSS/JS looks stale (`?v=cancel-ship-div`).

### Cancel item selector — interaction grammar

Reusable across Cancel (and matching Marketplace/Target handoff):

| Signal | Meaning |
|---|---|
| Checkbox present on a **white** row | Team member can act on this line |
| **No checkbox** + merchandise on the **grey** section background | Context only — cannot act in Guide |
| Selection count | Count of **selectable** items the TM ticked only |

Do **not** use a disabled checkbox to mean ineligible.

**Kmart / Target ineligible lines** reuse the Marketplace `refund-handoff-item` treatment exactly:

- No checkbox, no white item card / shipment card.
- Image, name, qty, SKU, price sit on `var(--km-surface-background)`.
- Product content stays readable (do not wash out as “disabled data”).
- Eligibility copy sits on the **shipment heading** when every line in that shipment is ineligible for the same reason, e.g. `Already delivered — can't be cancelled`, `Can't cancel individual items once picking has started`.
- Mixed shipments: only the ineligible lines are read-only; the reason sits on those lines.
- Marketplace: same merchandise treatment; **Contact seller ↗** stays available beside seller identity.

**Shipment grouping** (no extra cards):

- Item hairlines separate lines inside a shipment.
- A stronger full-width divider + extra space above the next heading separates Shipment 2, 3, … .
- No divider after the last shipment in the seller group.

**Test:** HD demo → Actions → Cancel → specific items. Shipment 1 (delivered) and Shipment 2 (picking) should be grey/read-only with shipment-level reasons; Shipment 3 (allocated) should be a white checkbox row. Marketplace seller should match the grey merchandise treatment with Contact seller still live.

### Also in this build

- **Track:** tracking number is the carrier link (`AU… ↗`); no extra “View on carrier”. Latest timeline event shows the Shippit/carrier `sourceLabel`. Shippit is a source line on the event, not a floating CTA. Kmart HD/CNC Track shows Store ID; Order Detail Kmart groups summarise unique store(s) (not Target/MP; mixed CNC+HD not flattened).
- **Contact seller ↗:** inline beside Target/Marketplace identity; right edge reserved for exceptions.
- **Order header:** no unit-status roll-up.
- **Refund approval:** yellow cue after Refund to / before Case when amount exceeds $500; “This $X refund exceeds the $500 approval threshold.” + `Submit approval request ↗` (12px, same line as heading).
- **Manhattan Order Notes:** Order Detail only, after totals/refund history, collapsed by default (`Manhattan Order Notes · N notes`). Distinct from Amazon Connect case notes. CNC demo has none.

