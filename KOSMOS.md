# Kosmos token map (this prototype)

Resolved from [Kosmos Design System](https://www.figma.com/design/1SQO5rx2EcbPSj18MfO9GG/Kosmos-Design-System) — **Colour Mode / Light** + **Brand / Kmart**.

| Token | Hex | Use |
|---|---|---|
| Primary / kmart-blue/500 | `#1768b0` | Links, CTAs, stepper — **not** money or metadata |
| Primary background | `#e4f0fb` | Chips hover, info soft |
| Surface background | `#f4f5f6` | Page bg, shipment/package heads |
| Surface container | `#ffffff` | Cards |
| Text primary | `#131416` | Body, money values |
| Text secondary | `#5e656f` | Meta |
| Outline variant | `#cdd1d5` | Card borders |
| Warning | `#ca3c11` / bg `#fff1cc` | Ready / Released status badges |
| Error | `#dd182c` | Blocked refund copy |
| Positive | `#00752a` / bg `#e6f4ea` | Delivered status |
| Info | `#006dbb` / bg `#ccf2fc` | Alert banner |
| Shape card | `8px` | Cards |
| Shape button | pill | Primary buttons, chips |
| Type | AnkoModerat → Inter web stand-in | |

## Hierarchy rules (annotate in Figma)

1. **Colour = operational state** (status badges) or **actionable affordance** (links). Money and metadata stay text colour.
2. **Inherit state once.** Show a child status only when it differs from its parent.
   - Package/item inherit shipment state by default.
   - Item status only appears when the **allocation** has an explicit override (not the line-catalogue status — that is order-wide and wrong per package).
   - Example: Shipment Released + allocation Cancelled → show Cancelled on the item.
3. **Four jobs, one per level:**
   - Seller = group summary
   - Shipment = identity + state + where/how (store · service) — not counts or totals
   - Package = physical composition
   - Item = product + qty + money
4. **Field test:** only keep a persistent field if it answers a customer question, resolves ambiguity, or supports an agent action. Release IDs stay out of the primary shipment header unless a Care workflow needs them.
5. **Three visual primitives on the left:**
   - **Card** = major entity (seller, rail)
   - **Subtle divider + whitespace** = sections within an entity (Shipment 1 → 2) — not a heavy rule that reads as a new seller
   - **Small bordered group** = physical package/carton contents only (label sits outside)
6. **Right rail** is quiet reference (two cards, Order detail only). Fulfilment method lives on the seller (mixed orders can differ); omit a generic order-level Delivery field.

## Shippit / Track responsibilities

| Screen | Job |
|---|---|
| Order Details | What is happening with this order? (OMS + Shippit-mapped shipment status when last-mile is more specific) |
| Track | Where is this shipment, last move, delayed/abnormal, next action |
| Shippit ↗ | Underlying carrier experience (secondary; measure usage) |

- Mapping: `js/shippit.js` (`SHIPPIT_STATUS_MAP`) — never expose raw strings like `ready_for_pickup` in UI.
- Per-shipment tracking only; never cross-apply a tracking result.
- Events sorted by carrier timestamp client-side; label/no-scan events do not reset the meaningful-carrier clock.
- OMS fulfilment status is never overwritten in source data.

Package pattern reference: [Order Tracking Uplift — Packages View](https://www.figma.com/design/JnTb5xz5rtTwwU1Vt9pVk9/Order-Tracking-Uplift?node-id=1599-41694).
