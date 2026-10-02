import {
  agent,
  customer,
  order,
  lines,
  sellers,
  shipTo,
  destinationService,
  shippitByTracking,
  carriers,
  refundHistory,
  orderSearchResults,
  customerRecentOrders,
  customerRecentCases,
  openCasesForOrder,
  findCaseById,
  linkableCases,
  PROTO_NOW,
  loadDemoOrder,
  isSelectableDemoOrder,
  demoOrderIds,
} from "./data.js?v=cnc-collect-by-1";
import {
  assessJourney,
  assessSla,
  displayShipmentStatus,
  formatEventWhen,
  formatEventWhenShort,
  elapsedBusinessDays,
  mapShippitStatus,
  sortEventsByTimestamp,
  trackingNumbersForShipment,
} from "./shippit.js?v=cnc-collect-by-1";

/** Format AUD; null/undefined means amount unavailable (not zero). */
const money = (n) =>
  n == null || n === ""
    ? "—"
    : Number(n).toLocaleString("en-AU", { style: "currency", currency: "AUD" });

const REFUND_REASONS = [
  "Damaged",
  "Item not received",
  "Delivery delay",
  "Wrong item",
  "Customer request",
];

const CANCEL_REASONS = [
  "Customer requested cancellation",
  "Out of stock",
  "Pricing error",
  "Duplicate order",
  "Fraud risk",
  "Other",
];

const state = {
  view: "search", // search | history | detail | track | refund | cancel
  /**
   * Selection-driven refund scope.
   * defaultReason = bulk merchandise default; itemReasonOverrides = line exceptions.
   * Shipping always carries its own reason.
   */
  refund: {
    items: {}, // `${packageId}:${lineId}` → selected qty
    itemReasonOverrides: {}, // key → reason only when overridden from default
    defaultReason: "",
    shippingSelected: false,
    shippingReason: "Delivery delay",
    shippingAmount: null, // number | null — refund amount for shipping charge
    shippingAmountError: "",
  },
  /**
   * Cancellation workflow — intent first, then eligibility-scoped action.
   * intent: null | "entire" | "lines"
   */
  cancel: {
    intent: null,
    reason: "",
    items: {}, // `${packageId}:${lineId}` → selected qty when intent=lines
  },
  historyOpen: {}, // shipmentId → bool
  sellerCollapsed: {}, // sellerId → bool when user has toggled
  shipmentOpen: {}, // shipmentId → bool when user has toggled
  searchTipDismissed: false,
  searchError: null, // { type: "nz-order", query } when NZ can be reliably detected
  historyFilter: "",
  actionsMenuOpen: false,
  /** View to return to after Refund / Cancel (detail | track). */
  originView: "detail",
  /** Unsaved-leave prompt while in a task workflow. */
  leaveConfirm: null, // { targetView, workflow: "refund" | "cancel" }
  /** Pending scroll target after render (e.g. Refunded → Refund history). */
  pendingScroll: null, // null | "refund-history"
  /**
   * Customer-context drawer — recent orders / cases for the matched profile.
   * null | "orders" | "cases" | "link-case"
   */
  customerDrawer: null,
  /**
   * Active servicing case for Guide actions on this interaction.
   * Distinct from “available open cases” in Case history.
   * null = no case linked (completing actions will create a new case).
   */
  linkedCaseId: null,
  /** Prototype-only snapshot when Create case makes a case not in fixtures. */
  linkedCaseSnapshot: null,
  /** Set when Guide was opened from a case (e.g. ?case=123456) — auto-linked. */
  enteredFromCaseId: null,
  /** Confirm before clearing the current servicing case association. */
  unlinkConfirm: false,
  /**
   * Handoff attribute from upstream AI — not a live verification status.
   * Demo default: true so the order screen shows the cue.
   * Absence (false) means Guide makes no assertion; agent follows normal manual process.
   * URL: ?preverified=0 to demo without the signal.
   */
  aiThreeStepPreVerified: true,
  search: {
    brand: "kmart",
    orderNumber: "",
    customerQuery: "",
    dateRange: "month", // week | month | quarter | custom
    customFrom: "",
    customTo: "",
  },
};

const PROTO_NOW_MS = Date.parse(PROTO_NOW);

const icons = {
  copy: `<svg class="copy" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  truck: `<svg width="16" height="14" viewBox="0 0 24 16" fill="none" aria-hidden="true"><path d="M1 4h14v9H1V4zm14 2h4l3 3v4h-7V6zM5 15.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm12 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" stroke="currentColor" stroke-width="1.5"/></svg>`,
  store: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9 12 3l9 6"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
  home: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></svg>`,
  /** Isometric package — Kosmos outline secondary; badge overlays count */
  package: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2 4.5 7.4v9.2L12 20.8l7.5-4.2V7.4L12 3.2Z"/><path d="M4.5 7.4 12 11.6l7.5-4.2"/><path d="M12 11.6V20.8"/><path d="M8.2 5.3 15.8 9.5"/></svg>`,
  /** Care attention — only when exception/delay; not a status badge */
  attention: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>`,
  chevronRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
  chevronDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  /** Order Actions — quiet utility icons */
  refund: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
  cancelItems: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m7.5 7.5 9 9"/></svg>`,
  reportDamage: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>`,
  createCase: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 4h8l2 3h3v13H3V7h3l2-3Z"/><path d="M3 10h18"/></svg>`,
  /** Compact chain — header case-linkage cue (not fulfilment status). */
  caseLink: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93"/><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07"/></svg>`,
  /** Customer-context gateway — tiny nav cues, not button chrome */
  recentOrders: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  caseHistory: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 4h8l2 3h3v13H3V7h3l2-3Z"/><path d="M8 12h8M8 16h5"/></svg>`,
  /** Workspace tabs */
  orderDetail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
  trackShipments: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 5h13v10H1V5zm13 2h4l3 3v5h-7V7z"/><circle cx="5.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>`,
};

/**
 * Searchable brand scope — expose only currently supported brands.
 * Component supports multi-brand selection tiles; today Kmart is sole available scope.
 */
const SEARCH_BRANDS = [
  {
    id: "kmart",
    name: "Kmart",
    logo: "./assets/brand/kmart-logo.png",
    region: "AU",
    available: true,
  },
  // Future (keep structure; hide until searchable):
  // { id: "target", name: "Target", logo: "./assets/brand/target-logo.png", region: "AU", available: true },
];

function availableSearchBrands() {
  return SEARCH_BRANDS.filter((b) => b.available);
}

function brandScopeControl() {
  const brands = availableSearchBrands();
  const selected = state.search.brand || brands[0]?.id;
  const interactive = brands.length > 1;

  const tiles = brands
    .map((brand) => {
      const isSelected = brand.id === selected;
      const region = brand.region || "AU";
      const logo = `<img class="brand-tile-logo" src="${brand.logo}" alt="" width="64" height="18" />`;
      const regionEl = `<span class="brand-tile-region">${region}</span>`;

      /** Sole brand: selected look, non-interactive until a second tile exists. */
      if (!interactive) {
        return `
          <div
            class="brand-tile is-selected is-sole"
            aria-current="true"
            aria-label="${brand.name} ${region}"
          >
            ${logo}
            ${regionEl}
          </div>`;
      }
      return `
        <button
          type="button"
          class="brand-tile${isSelected ? " is-selected" : ""}"
          data-action="select-brand"
          data-brand="${brand.id}"
          aria-pressed="${isSelected ? "true" : "false"}"
          aria-label="${brand.name} ${region}${isSelected ? " (selected)" : ""}"
        >
          ${logo}
          ${regionEl}
        </button>`;
    })
    .join("");

  return `
    <div class="brand-scope${interactive ? "" : " is-sole"}" role="group" aria-labelledby="brand-scope-label">
      <div class="search-section-label" id="brand-scope-label">Search orders from</div>
      <div class="brand-scope-tiles">
        ${tiles}
      </div>
    </div>`;
}

/** Multi-package only — single package is the default and stays silent. */
function packageCountIcon(count) {
  const n = Number(count) || 0;
  if (n < 2) return "";
  const label = `${n} packages`;
  return `
    <span class="pkg-count" title="${label}" aria-label="${label}">
      ${icons.package}
      <span class="pkg-count-badge">${n}</span>
    </span>`;
}

const shipmentCount = () =>
  sellers.reduce((n, s) => n + s.shipments.length, 0);
const packageCount = () =>
  sellers.reduce(
    (n, s) => n + s.shipments.reduce((m, sh) => m + sh.packages.length, 0),
    0
  );

function refundableFeeLine() {
  return Object.values(lines).find((l) => l.shippingFee?.refundable) || null;
}

function resetRefundSelection() {
  state.refund = {
    items: {},
    itemReasonOverrides: {},
    defaultReason: "",
    shippingSelected: false,
    shippingReason: "Delivery delay",
    shippingAmount: null,
    shippingAmountError: "",
  };
}

function shippingRemainingMax() {
  return Number(refundableFeeLine()?.shippingFee?.remaining) || 0;
}

function setShippingSelected(on) {
  state.refund.shippingSelected = !!on;
  if (on) {
    state.refund.shippingAmount = shippingRemainingMax();
    state.refund.shippingAmountError = "";
    if (!state.refund.shippingReason) {
      state.refund.shippingReason = "Delivery delay";
    }
  } else {
    state.refund.shippingAmount = null;
    state.refund.shippingAmountError = "";
  }
}

function parseShippingAmount(raw) {
  const max = shippingRemainingMax();
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!cleaned) {
    return { ok: false, error: "Enter a refund amount" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Use a valid amount with up to 2 decimal places" };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "Amount must be greater than $0.00" };
  }
  if (n > max + 1e-9) {
    return { ok: false, error: `Cannot exceed ${money(max)}` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function allocKey(pkgId, lineId) {
  return `${pkgId}:${lineId}`;
}

function packageUnitCount(pkg) {
  return (pkg.allocations || []).reduce((n, a) => n + (a.qtyInPackage || 0), 0);
}

/** Big & Bulky / paid shipping charge lives on that fulfilment shipment. */
function shipmentHostsShippingFee(ship) {
  const feeLine = refundableFeeLine();
  if (!feeLine?.shippingFee?.refundable) return false;
  if (ship?.sla?.shippingPaid) return true;
  return String(ship?.shippingMethod || "")
    .toLowerCase()
    .includes("bulky");
}

function packageHostsShippingFee(ship, pkg) {
  const feeLine = refundableFeeLine();
  if (!shipmentHostsShippingFee(ship) || !feeLine) return false;
  const first = ship.packages.find((p) =>
    p.allocations.some((a) => a.lineId === feeLine.id)
  );
  return first?.id === pkg.id;
}

/** Shipping fee renders under its parent merchandise line, not as a peer row. */
function lineHostsShippingFee(ship, pkg, lineId) {
  const feeLine = refundableFeeLine();
  return (
    !!feeLine &&
    lineId === feeLine.id &&
    packageHostsShippingFee(ship, pkg)
  );
}

function refundEligibleInPackage(pkg) {
  return (pkg.allocations || [])
    .map((alloc) => {
      const line = lines[alloc.lineId];
      if (!line) return null;
      return {
        alloc,
        line,
        key: allocKey(pkg.id, alloc.lineId),
        refundable: !!line.refundable,
        maxQty: alloc.qtyInPackage,
      };
    })
    .filter(Boolean);
}

function refundEligibleInShipment(ship) {
  return ship.packages.flatMap((pkg) =>
    refundEligibleInPackage(pkg).map((entry) => ({ ...entry, pkg }))
  );
}

function itemSelectedQty(key) {
  return state.refund.items[key] || 0;
}

function setItemSelectedQty(key, qty, maxQty) {
  const next = Math.max(0, Math.min(Number(qty) || 0, maxQty));
  if (next <= 0) {
    delete state.refund.items[key];
    delete state.refund.itemReasonOverrides[key];
  } else {
    state.refund.items[key] = next;
  }
}

function isReasonOverridden(key) {
  return Object.prototype.hasOwnProperty.call(
    state.refund.itemReasonOverrides,
    key
  );
}

/** Effective merchandise reason: line override, else bulk default. */
function effectiveItemReason(key) {
  if (isReasonOverridden(key)) return state.refund.itemReasonOverrides[key];
  return state.refund.defaultReason || "";
}

function setItemReasonOverride(key, value) {
  if (!key) return;
  if (
    !value ||
    value === "__inherit__" ||
    value === state.refund.defaultReason
  ) {
    delete state.refund.itemReasonOverrides[key];
    return;
  }
  state.refund.itemReasonOverrides[key] = value;
}

function reasonOptionsHtml(selected, { includeBlank = false } = {}) {
  const blank = includeBlank
    ? `<option value="" ${!selected ? "selected" : ""}>Select reason</option>`
    : "";
  return (
    blank +
    REFUND_REASONS.map(
      (r) =>
        `<option value="${r}" ${r === selected ? "selected" : ""}>${r}</option>`
    ).join("")
  );
}

/**
 * Qty always sits beside Reason for selected merchandise.
 * 1 eligible unit → same-width control, fixed/read-only (no dropdown affordance).
 * 2+ → dropdown defaulting to all eligible units.
 */
function itemQtyControlsHtml(key, maxQty, selectedQty) {
  if (maxQty <= 1) {
    return `
    <label class="refund-config-field refund-config-qty">
      <span>Qty</span>
      <input
        class="select select-compact select-qty is-fixed"
        type="text"
        value="1"
        readonly
        tabindex="-1"
        aria-label="Quantity 1"
        data-key="${key}"
        data-max="1"
      />
    </label>`;
  }
  const qtyOptions = Array.from({ length: maxQty }, (_, i) => i + 1)
    .map(
      (n) =>
        `<option value="${n}" ${n === selectedQty ? "selected" : ""}>${n}</option>`
    )
    .join("");
  return `
    <label class="refund-config-field refund-config-qty">
      <span>Qty</span>
      <select class="select select-compact select-qty" data-action="refund-item-qty" data-key="${key}" data-max="${maxQty}">
        ${qtyOptions}
      </select>
    </label>`;
}

/** Always-visible reason control — prefilled from top-level refund reason when set. */
function itemReasonControlsHtml(key) {
  const effective = effectiveItemReason(key);
  return `
    <label class="refund-config-field refund-config-reason">
      <span>Reason</span>
      <select class="select select-compact select-reason" data-action="refund-item-reason" data-key="${key}">
        ${reasonOptionsHtml(effective, { includeBlank: !effective })}
      </select>
    </label>`;
}

function packageHasSelectable(ship, pkg) {
  return (
    refundEligibleInPackage(pkg).some((e) => e.refundable) ||
    packageHostsShippingFee(ship, pkg)
  );
}

function shipmentHasSelectable(ship) {
  return (
    refundEligibleInShipment(ship).some((e) => e.refundable) ||
    shipmentHostsShippingFee(ship)
  );
}

function selectionCountLabel({ units, charges, amount }) {
  if (!units && !charges) return "Nothing selected";
  const parts = [];
  if (units) parts.push(`${units} unit${units === 1 ? "" : "s"}`);
  if (charges) parts.push(`${charges} charge${charges === 1 ? "" : "s"}`);
  return `${parts.join(" + ")} selected · ${money(amount)}`;
}

/**
 * Tri-state for cascade checkboxes.
 * @returns {"none"|"some"|"all"|"empty"}
 */
function selectionTriState(parts) {
  if (!parts.length) return "empty";
  const selected = parts.filter(Boolean).length;
  if (selected === 0) return "none";
  if (selected === parts.length) return "all";
  return "some";
}

function packageSelectionState(ship, pkg) {
  const entries = refundEligibleInPackage(pkg);
  const merch = entries
    .filter((e) => e.refundable)
    .map((e) => itemSelectedQty(e.key) > 0);
  const hostsFee = packageHostsShippingFee(ship, pkg);
  const parts = hostsFee
    ? [...merch, !!state.refund.shippingSelected]
    : merch;
  return selectionTriState(parts);
}

function shipmentSelectionState(ship) {
  const merch = refundEligibleInShipment(ship)
    .filter((e) => e.refundable)
    .map((e) => itemSelectedQty(e.key) > 0);
  const hostsFee = shipmentHostsShippingFee(ship);
  const parts = hostsFee
    ? [...merch, !!state.refund.shippingSelected]
    : merch;
  return selectionTriState(parts);
}

function selectAllInPackage(ship, pkg, on) {
  for (const entry of refundEligibleInPackage(pkg)) {
    if (!entry.refundable) continue;
    setItemSelectedQty(entry.key, on ? entry.maxQty : 0, entry.maxQty);
  }
  if (packageHostsShippingFee(ship, pkg)) {
    setShippingSelected(on);
  }
}

function selectAllInShipment(ship, on) {
  for (const pkg of ship.packages) {
    selectAllInPackage(ship, pkg, on);
  }
  if (shipmentHostsShippingFee(ship)) {
    setShippingSelected(on);
  }
}

function refundSelectionSummary() {
  const rows = [];
  let amount = 0;
  let units = 0;
  let charges = 0;

  for (const seller of sellers) {
    for (const ship of seller.shipments) {
      for (const pkg of ship.packages) {
        for (const entry of refundEligibleInPackage(pkg)) {
          const qty = itemSelectedQty(entry.key);
          if (!qty) continue;
          const lineAmount = entry.line.price * qty;
          amount += lineAmount;
          units += qty;
          rows.push({
            key: entry.key,
            label: `${entry.line.name} ×${qty}`,
            reason: effectiveItemReason(entry.key) || "Select reason",
            amount: lineAmount,
            kind: "item",
          });
        }
      }
    }
  }

  if (state.refund.shippingSelected && refundableFeeLine()?.shippingFee) {
    const fee = refundableFeeLine().shippingFee;
    const shipAmt =
      state.refund.shippingAmount == null
        ? fee.remaining
        : Number(state.refund.shippingAmount);
    amount += shipAmt;
    charges += 1;
    rows.push({
      key: "shipping",
      label: fee.name,
      reason: state.refund.shippingReason || "Delivery delay",
      amount: shipAmt,
      kind: "shipping",
    });
  }

  return { rows, amount, units, charges, count: units + charges };
}

function checkboxTriHtml({
  action,
  attrs = "",
  state: tri,
  label,
  disabled = false,
  hideWhenEmpty = false,
}) {
  if (tri === "empty" || disabled) {
    return hideWhenEmpty
      ? ""
      : `<input class="checkbox" type="checkbox" disabled aria-label="${label}" ${attrs} />`;
  }
  const checked = tri === "all" ? "checked" : "";
  const indeterminate = tri === "some" ? `data-indeterminate="true"` : "";
  return `<input
    class="checkbox"
    type="checkbox"
    data-action="${action}"
    ${attrs}
    ${checked}
    ${indeterminate}
    aria-label="${label}"
  />`;
}

function syncIndeterminateCheckboxes(root) {
  root.querySelectorAll("[data-indeterminate]").forEach((el) => {
    el.indeterminate = el.getAttribute("data-indeterminate") === "true";
  });
}

/**
 * Status colour = lifecycle state (not exception attention).
 * - green (positive): terminal success — Delivered
 * - blue (primary): active fulfilment — Shipped, In transit, Out for delivery, Partially shipped
 * - amber: actionable / incomplete Care states — Ready for collection, Packed, Cancelled, attempts
 * Exceptions (delay, investigation) stay on separate attention UI, not badge colour.
 */
function statusBadge(status, { prominent = false } = {}) {
  const s = String(status || "").toLowerCase().trim();
  let tone = "neutral";

  const isDelivered =
    /\bdelivered\b/.test(s) || s === "partially delivered";
  const isActiveDelivery =
    s.includes("out for") ||
    s.includes("in transit") ||
    /\btransit\b/.test(s) ||
    /\bshipped\b/.test(s) ||
    s.includes("partially shipped") ||
    (s.includes("ship") && !s.includes("refund"));

  if (isDelivered) {
    tone = "positive";
  } else if (isActiveDelivery) {
    tone = "primary";
  } else if (s.includes("ready for collection")) {
    tone = "amber";
  } else if (
    s.includes("cancel") ||
    s.includes("ready") ||
    s.includes("released") ||
    s.includes("packed") ||
    s.includes("preparing") ||
    s.includes("awaiting") ||
    s.includes("attempt") ||
    s.includes("unsuccessful") ||
    s.includes("return")
  ) {
    tone = "amber";
  } else if (
    s.includes("lost") ||
    s.includes("damaged") ||
    s.includes("fail") ||
    s.includes("delay") ||
    s.includes("issue")
  ) {
    /** Rare badge use — prefer attention panels; keep warning if shown as status. */
    tone = "amber";
  }

  const cls = prominent ? `badge badge-${tone} badge-status-lg` : `badge badge-${tone}`;
  return `<span class="${cls}">${status}</span>`;
}

function sameStatus(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function fulfilmentLabel(code) {
  const c = String(code || "").trim();
  const u = c.toUpperCase();
  if (u === "HD" || u.includes("HOME")) return "Home delivery";
  if (u === "CNC" || u.includes("CLICK") || u.includes("COLLECT")) {
    return "Click & Collect";
  }
  return c;
}

/** Normalise seller/order delivery codes into HD / CNC buckets. */
function fulfilmentKind(code) {
  const u = String(code || "").trim().toUpperCase();
  if (!u) return null;
  if (u === "HD" || u.includes("HOME") || (u.includes("DELIVERY") && !u.includes("CLICK"))) {
    return "HD";
  }
  if (u === "CNC" || u.includes("CLICK") || u.includes("COLLECT")) return "CNC";
  return null;
}

/**
 * Order-level fulfilment methods represented anywhere in the order.
 * Seller/shipment detail keeps the specific method for that part.
 */
function orderFulfilmentKinds() {
  const kinds = new Set();
  for (const s of sellers) {
    const k = fulfilmentKind(s.delivery);
    if (k) kinds.add(k);
  }
  if (!kinds.size) {
    const k = fulfilmentKind(order.delivery);
    if (k) kinds.add(k);
  }
  return kinds;
}

/** Identity-line fulfilment: icon + text per method; mixed joins with +. */
function orderFulfilmentSummaryHtml() {
  const kinds = orderFulfilmentKinds();
  const parts = [];
  /** CNC before HD — mixed orders read as Collect + delivery, not a generic Mixed label. */
  if (kinds.has("CNC")) {
    parts.push(`
      <span class="hero-fulfilment">
        <span class="hero-fulfilment-icon" aria-hidden="true">${icons.store}</span>Click &amp; Collect
      </span>`);
  }
  if (kinds.has("HD")) {
    parts.push(`
      <span class="hero-fulfilment">
        <span class="hero-fulfilment-icon" aria-hidden="true">${icons.truck}</span>Home delivery
      </span>`);
  }
  if (!parts.length) return "";
  return parts.join(`<span class="hero-fulfilment-plus" aria-hidden="true">+</span>`);
}

/** Australian Care date — 21 Sep 2026 (not Sep 21, 2026). */
function formatAuDate(input) {
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return String(input || "");
  const d = new Date(t);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Short Care date — 7 Oct; year only when not the prototype current year. */
function formatAuDateShort(input) {
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return String(input || "");
  const d = new Date(t);
  const now = new Date(PROTO_NOW_MS);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dayMonth = `${d.getDate()} ${months[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear()
    ? dayMonth
    : `${dayMonth} ${d.getFullYear()}`;
}

/** Whole calendar days from prototype “today” to the deadline date (0 = today). */
function calendarDaysUntil(deadlineIso, nowMs = PROTO_NOW_MS) {
  const end = Date.parse(deadlineIso);
  if (!Number.isFinite(end)) return null;
  const now = new Date(nowMs);
  const endDay = new Date(end);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEnd = new Date(
    endDay.getFullYear(),
    endDay.getMonth(),
    endDay.getDate()
  );
  return Math.round((startOfEnd - startOfToday) / 86400000);
}

/**
 * Collection window from fulfilment-provided collectBy / collectionExpiresAt.
 * Guide does not invent ready+10 — only displays the supplied expiry.
 */
function collectionWindowAssessment(ship, nowMs = PROTO_NOW_MS) {
  const collectBy = ship?.collectBy || ship?.collectionExpiresAt || null;
  if (!collectBy) return null;
  const daysLeft = calendarDaysUntil(collectBy, nowMs);
  if (daysLeft == null) return null;
  const byLabel = formatAuDateShort(collectBy);

  if (daysLeft < 0) {
    return {
      tone: "ended",
      line: "Collection window has ended",
      daysLeft,
      collectBy,
    };
  }
  if (daysLeft === 0) {
    return {
      tone: "urgent",
      line: "Collect by today",
      daysLeft,
      collectBy,
    };
  }
  const dayWord = daysLeft === 1 ? "day" : "days";
  return {
    tone: daysLeft <= 3 ? "approaching" : "ok",
    line: `${daysLeft} ${dayWord} left to collect · Collect by ${byLabel}`,
    daysLeft,
    collectBy,
  };
}

/** Care-facing status phrase for summaries (same vocabulary as shipment display). */
function statusPhrase(status) {
  return String(status || "").trim().toLowerCase();
}

/** Journey-ish order so the summary reads left-to-right through the lifecycle. */
function statusSortKey(phrase) {
  const s = statusPhrase(phrase);
  const order = [
    "ready for picking",
    "released",
    "packed",
    "preparing for delivery",
    "awaiting courier collection",
    "courier collection unsuccessful",
    "in transit",
    "shipped",
    "out for delivery",
    "delivery attempted",
    "delivery unsuccessful",
    "ready for collection",
    "delivered",
    "partially delivered",
    "returning to kmart",
    "lost in transit",
    "damaged in transit",
  ];
  const i = order.indexOf(s);
  return i === -1 ? 1000 : i;
}

function shipmentUnitCount(ship) {
  return ship.packages.reduce(
    (n, pkg) => n + pkg.allocations.reduce((m, a) => m + a.qtyInPackage, 0),
    0
  );
}

/** Unique products in a shipment with combined qty (not one thumb per unit). */
function shipmentUniqueProducts(ship) {
  const byLine = new Map();
  for (const pkg of ship.packages) {
    for (const alloc of pkg.allocations) {
      const line = lines[alloc.lineId];
      if (!line) continue;
      const prev = byLine.get(line.id);
      byLine.set(line.id, {
        line,
        qty: (prev?.qty || 0) + alloc.qtyInPackage,
      });
    }
  }
  return [...byLine.values()];
}

/** Neutral initials fallback when product imagery is unavailable. */
function productThumbHtml(line, { className = "thumb", title = "" } = {}) {
  const label = title || line.name || "";
  if (line.image) {
    return `<img class="${className}" src="${line.image}" alt="" title="${label}" width="40" height="40" draggable="false" />`;
  }
  return `<span class="${className} is-placeholder" title="${label}" aria-hidden="true">${line.thumb || "?"}</span>`;
}

/**
 * Collapsed shipment product strip — contents only (what's in this shipment).
 * Care assessment lives in the header attention zone, not here.
 */
function shipmentProductStrip(ship) {
  const products = shipmentUniqueProducts(ship);
  if (!products.length) return "";
  const MAX = 4;
  const shown = products.slice(0, MAX);
  const overflow = products.length - shown.length;
  const units = shipmentUnitCount(ship);

  const thumbs = shown
    .map(({ line, qty }) => {
      const tip = `${line.name}\nQty ${qty}`;
      return `
        <span class="ship-prod-thumb" data-tip="${line.name.replace(/"/g, "&quot;")}" data-qty="Qty ${qty}" title="${tip.replace(/"/g, "&quot;")}">
          ${productThumbHtml(line, { className: "ship-prod-img" })}
        </span>`;
    })
    .join("");

  return `
    <div class="ship-prod-strip">
      <div class="ship-prod-thumbs">
        ${thumbs}
        ${
          overflow > 0
            ? `<span class="ship-prod-more" aria-label="${overflow} more products">+${overflow}</span>`
            : ""
        }
        <span class="ship-prod-units">${units} unit${units === 1 ? "" : "s"}</span>
      </div>
    </div>`;
}

/** Collapsed-row Care assessment — icon + label as one component. */
function shipAttentionAssessment(reason) {
  if (!reason) return "";
  return `
    <span class="ship-attention-assessment">
      <span class="ship-attention" aria-hidden="true">${icons.attention}</span>
      <span class="ship-attention-label">${reason}</span>
    </span>`;
}

/**
 * Aggregate seller catalogue lines across shipments/packages.
 * Statuses use Care-facing shipment (or allocation override) vocabulary.
 */
function aggregateSellerItems(seller) {
  const byLine = new Map();

  for (const ship of seller.shipments) {
    const shipDisplay = displayShipmentStatus(ship, seller, shippitByTracking);
    for (const pkg of ship.packages) {
      for (const alloc of pkg.allocations) {
        const line = lines[alloc.lineId];
        if (!line) continue;
        let entry = byLine.get(alloc.lineId);
        if (!entry) {
          entry = {
            line,
            ordered: 0,
            byStatus: new Map(),
          };
          byLine.set(alloc.lineId, entry);
        }
        const qty = alloc.qtyInPackage;
        entry.ordered += qty;
        const statusLabel = alloc.status || shipDisplay.label || ship.status || "Unknown";
        entry.byStatus.set(statusLabel, (entry.byStatus.get(statusLabel) || 0) + qty);
      }
    }
  }

  return [...byLine.values()];
}

/** Attention statuses get restrained semantic colour; routine progress stays neutral. */
function statusAttentionTone(label) {
  const s = statusPhrase(label);
  if (
    s.includes("cancel") ||
    s.includes("lost") ||
    s.includes("damaged") ||
    s.includes("unsuccessful") ||
    s.includes("failed") ||
    s.includes("address issue") ||
    s.includes("returning") ||
    s.includes("refund")
  )
    return "danger";
  if (
    s.includes("attempt") ||
    s.includes("delay") ||
    s.includes("outside") ||
    s.includes("investigat") ||
    s.includes("warning")
  )
    return "warn";
  return "neutral";
}

function itemStatusSummaryHtml(byStatus) {
  const parts = [...byStatus.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => statusSortKey(a[0]) - statusSortKey(b[0]));
  if (!parts.length) return "—";

  return parts
    .map(([label, n], i) => {
      const tone = statusAttentionTone(label);
      const sep =
        i < parts.length - 1
          ? `<span class="status-alloc-sep" aria-hidden="true">·</span>`
          : "";
      return `<span class="status-alloc status-alloc-${tone}"><span class="status-alloc-qty">${n}</span> <span class="status-alloc-label">${label}</span></span>${sep}`;
    })
    .join("");
}

function aggregatedItemRow(entry) {
  const { line, ordered, byStatus } = entry;
  return `
    <div class="agg-item">
      <div class="agg-item-product">
        ${productThumbHtml(line)}
        <div class="agg-item-body">
          <div class="item-name">${line.name}</div>
          <div class="item-meta-line">SKU ${line.sku} · ${money(line.price)} each</div>
        </div>
      </div>
      <div class="agg-item-qty">
        <span class="agg-col-label">Qty</span>
        <span class="agg-col-value">${ordered}</span>
      </div>
      <div class="agg-item-status">
        <span class="agg-col-label">Status</span>
        <div class="agg-col-value status-alloc-list">${itemStatusSummaryHtml(byStatus)}</div>
      </div>
      <div class="agg-item-total">
        <span class="agg-col-label">Total</span>
        <span class="agg-col-value">${money(line.price * ordered)}</span>
      </div>
    </div>`;
}

function aggregatedItemsList(seller) {
  const items = aggregateSellerItems(seller);
  if (!items.length) {
    return `<p class="help" style="margin:0;padding:var(--km-space-lg) var(--km-space-xl)">No items for this seller.</p>`;
  }
  return `
    <div class="agg-items" role="table" aria-label="${seller.name} units">
      <div class="agg-items-head" role="row">
        <div class="agg-item-product" role="columnheader">Item</div>
        <div class="agg-item-qty" role="columnheader">Qty</div>
        <div class="agg-item-status" role="columnheader">Status</div>
        <div class="agg-item-total" role="columnheader">Total</div>
      </div>
      ${items.map((entry) => aggregatedItemRow(entry)).join("")}
    </div>`;
}

/** Guide cannot process Target / Marketplace refunds — hand off to Mirakl. */
function sellerRefundsInMirakl(seller) {
  return seller.kind === "target" || seller.kind === "marketplace";
}

function refundMiraklProductRows(seller) {
  return aggregateSellerItems(seller)
    .map((entry) => {
      const { line, ordered } = entry;
      return `
        <div class="refund-handoff-item">
          <div class="item-cell">
            ${productThumbHtml(line, { className: "thumb refund-handoff-thumb" })}
            <div class="pkg-item-body">
              <div class="item-name">${line.name} <span class="item-qty-inline">×${ordered}</span></div>
              <div class="item-meta-line">SKU ${line.sku}</div>
            </div>
          </div>
          <div class="refund-item-amount">${money(line.price * ordered)}</div>
        </div>`;
    })
    .join("");
}

function refundMiraklSellerBlock(seller) {
  const kindChip =
    seller.kind === "marketplace"
      ? `<span class="seller-kind-chip">Marketplace</span>`
      : "";

  return `
    <section class="card seller-card seller-card-refund seller-card-handoff" aria-label="${seller.name} Mirakl refund">
      <div class="seller-head">
        <div class="seller-head-main">
          <div class="seller-title-row-inline">
            <div class="seller-title">${seller.name}</div>
            ${kindChip}
            <button
              type="button"
              class="external-system-link"
              data-action="open-mirakl"
              data-seller="${seller.id}"
              data-channel="${seller.kind}"
            >Refund in Mirakl ↗</button>
          </div>
          <div class="seller-meta">${seller.itemCount} unit${seller.itemCount === 1 ? "" : "s"} · ${money(seller.merchandiseTotal)} · ${fulfilmentLabel(seller.delivery)}</div>
        </div>
      </div>
      <div class="seller-body">
        <p class="refund-handoff-note">Refund these items in Mirakl.</p>
        <div class="refund-handoff-items" aria-disabled="true">
          ${refundMiraklProductRows(seller)}
        </div>
      </div>
    </section>`;
}

/** Inline copy for high-throughput Care clipboard values — not a global identity toolbar. */
function copyControl(value, label) {
  if (!value) return "";
  const escaped = String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<button type="button" class="copy-field" data-copy="${escaped}" title="Copy ${label}" aria-label="Copy ${label}">${icons.copy}</button>`;
}

function crumbs() {
  const trail = {
    search: [["Order Search", null]],
    history: [
      ["Order Search", "search"],
      ["Order History", null],
    ],
    detail: [
      ["Order Search", "search"],
      ["Order History", "history"],
      [`Order ${order.id}`, null],
    ],
    track: [
      ["Order Search", "search"],
      ["Order History", "history"],
      [`Order ${order.id}`, "detail"],
      ["Track shipments", null],
    ],
    refund: [
      ["Order Search", "search"],
      ["Order History", "history"],
      [`Order ${order.id}`, "detail"],
      ["Refund", null],
    ],
    cancel: [
      ["Order Search", "search"],
      ["Order History", "history"],
      [`Order ${order.id}`, "detail"],
      ["Cancel", null],
    ],
  }[state.view];

  return (trail || [])
    .map((part) => {
      const [label, target] = part;
      if (target === null) return `<span class="here">${label}</span>`;
      if (target === "#") return `<span>${label}</span><span>/</span>`;
      return `<a href="#" data-view="${target}" style="color:inherit;text-decoration:none">${label}</a><span>/</span>`;
    })
    .join("");
}

function viewNav() {
  /** Peer workspaces — Order detail / Track. Actions (Refund etc.) leave both unselected. */
  const tabs = [
    ["detail", "Order detail", icons.orderDetail],
    ["track", "Track shipments", icons.trackShipments],
  ];
  const workflow = state.view === "refund" || state.view === "cancel";
  const current = workflow ? null : state.view;
  return `
    <div class="views${workflow ? " is-workflow" : ""}" role="tablist" aria-label="Order views">
      ${tabs
        .map(([id, label, icon]) => {
          const selected = current === id;
          return `
            <button
              type="button"
              role="tab"
              class="views-tab"
              id="view-tab-${id}"
              data-view="${id}"
              aria-selected="${selected ? "true" : "false"}"
              tabindex="${selected || workflow ? "0" : "-1"}"
            >
              <span class="views-tab-icon" aria-hidden="true">${icon}</span>
              <span class="views-tab-label">${label}</span>
            </button>`;
        })
        .join("")}
    </div>`;
}

/** Task chrome for Refund / Cancel / Report damage — outside the view-tab model. */
function linkedCase() {
  if (!state.linkedCaseId) return null;
  return findCaseById(state.linkedCaseId) || state.linkedCaseSnapshot || null;
}

/** Track escalation CTA — create only when unlinked; else attach to linked case. */
function trackCaseActionButtonHtml() {
  const linked = linkedCase();
  if (linked) {
    return `<button type="button" class="btn btn-md btn-primary" data-action="attach-to-linked-case">Add to case #${linked.id}</button>`;
  }
  return `<button type="button" class="btn btn-md btn-primary" data-action="create-case">Create case</button>`;
}

function linkServicingCase(caseId) {
  const c = findCaseById(caseId);
  if (!c || !c.open || c.linkable === false) return false;
  state.linkedCaseId = c.id;
  state.linkedCaseSnapshot = null;
  return true;
}

function clearLinkedCase() {
  state.linkedCaseId = null;
  state.linkedCaseSnapshot = null;
  state.enteredFromCaseId = null;
  state.unlinkConfirm = false;
}

let nextCreatedCaseSeq = 124001;

/**
 * If no case is linked, create one and make it current for the rest of the journey.
 * Subsequent servicing actions accumulate against it rather than spawning another case.
 */
function ensureServicingCase({ topic = "General" } = {}) {
  const existing = linkedCase();
  if (existing) return existing;
  const newId = String(nextCreatedCaseSeq++);
  state.linkedCaseId = newId;
  state.linkedCaseSnapshot = {
    id: newId,
    state: "Open",
    topic,
    when: "Updated just now",
    opened: "Opened today",
    open: true,
    linkable: true,
    orderId: order.id,
  };
  console.info("[analytics] create_case_and_link", newId, topic);
  return state.linkedCaseSnapshot;
}

function unlinkConfirmDialog() {
  if (!state.unlinkConfirm) return "";
  const linked = linkedCase();
  if (!linked) return "";
  return `
    <div class="leave-confirm" role="presentation">
      <div class="leave-confirm-card" role="alertdialog" aria-labelledby="unlink-confirm-title" aria-describedby="unlink-confirm-desc">
        <h2 id="unlink-confirm-title">Unlink Case #${linked.id}?</h2>
        <p id="unlink-confirm-desc">Future servicing actions won't be added to this case. If you complete an action without linking another case, Guide will create a new case.</p>
        <div class="leave-confirm-actions">
          <button type="button" class="btn btn-secondary" data-action="unlink-confirm-keep">Keep linked</button>
          <button type="button" class="btn btn-primary" data-action="unlink-confirm-unlink">Unlink case</button>
        </div>
      </div>
    </div>`;
}

/**
 * Compact case cue on action workflows — same pattern as the order header.
 * Consequence lives in a tooltip; Link/Switch open the association drawer.
 */
function workflowCaseCueHtml({ actionLabel = "action" } = {}) {
  const linked = linkedCase();
  if (linked) {
    return `
      <p class="workflow-case-cue is-linked">
        <span class="workflow-case-cue-icon" aria-hidden="true">${icons.caseLink}</span>
        <button
          type="button"
          class="workflow-case-cue-ref"
          data-action="view-case"
          data-case="${linked.id}"
          title="View case #${linked.id}"
        >Case #${linked.id}</button>
        <span class="workflow-case-cue-sep" aria-hidden="true">·</span>
        <button type="button" class="workflow-case-cue-action" data-action="change-linked-case">Switch</button>
      </p>`;
  }
  const unlinkedTip = `This ${actionLabel} will create a new case unless you link an existing one.`;
  return `
    <p class="workflow-case-cue is-unlinked">
      <span class="workflow-case-cue-icon" aria-hidden="true">${icons.caseLink}</span>
      <span class="workflow-case-cue-ref" title="${unlinkedTip}">No case linked</span>
      <span class="workflow-case-cue-sep" aria-hidden="true">·</span>
      <button type="button" class="workflow-case-cue-action" data-action="open-link-case">Link case</button>
    </p>`;
}

function workflowHead({ title, lead, actionLabel = "action" }) {
  return `
    <header class="workflow-head">
      <button type="button" class="workflow-back" data-action="back-to-order">← Back to order</button>
      <h1 class="workflow-title">${title}</h1>
      ${workflowCaseCueHtml({ actionLabel })}
      ${lead ? `<p class="workflow-lead">${lead}</p>` : ""}
    </header>`;
}

function refundHasDraft() {
  const { units, charges } = refundSelectionSummary();
  if (units || charges) return true;
  if (state.refund.defaultReason) return true;
  if (Object.keys(state.refund.itemReasonOverrides || {}).length) return true;
  return false;
}

function resetCancelSelection() {
  state.cancel = {
    intent: null,
    reason: "",
    items: {},
  };
}

function cancelHasDraft() {
  if (state.cancel.intent) return true;
  if (state.cancel.reason) return true;
  if (Object.keys(state.cancel.items || {}).length) return true;
  return false;
}

function enterRefund({ preselectShipping = false } = {}) {
  const from = state.view === "track" || state.view === "detail" ? state.view : state.originView;
  state.originView = from === "track" ? "track" : "detail";
  resetRefundSelection();
  if (preselectShipping) setShippingSelected(true);
  state.leaveConfirm = null;
  state.actionsMenuOpen = false;
  state.view = "refund";
}

function enterCancel() {
  const from = state.view === "track" || state.view === "detail" ? state.view : state.originView;
  state.originView = from === "track" ? "track" : "detail";
  resetCancelSelection();
  state.leaveConfirm = null;
  state.actionsMenuOpen = false;
  state.view = "cancel";
}

function leaveWorkflow(targetView, { force = false } = {}) {
  const target = targetView || state.originView || "detail";
  const workflow = state.view === "cancel" ? "cancel" : state.view === "refund" ? "refund" : null;
  const hasDraft =
    workflow === "cancel" ? cancelHasDraft() : workflow === "refund" ? refundHasDraft() : false;
  if (!force && hasDraft) {
    state.leaveConfirm = { targetView: target, workflow };
    render();
    return false;
  }
  if (workflow === "refund") resetRefundSelection();
  if (workflow === "cancel") resetCancelSelection();
  state.leaveConfirm = null;
  state.actionsMenuOpen = false;
  state.view = target;
  return true;
}

/** @deprecated use leaveWorkflow */
function leaveRefund(targetView, opts) {
  return leaveWorkflow(targetView, opts);
}

function leaveConfirmDialog() {
  if (!state.leaveConfirm) return "";
  const workflow = state.leaveConfirm.workflow || "refund";
  const label = workflow === "cancel" ? "cancellation" : "refund";
  return `
    <div class="leave-confirm" role="presentation">
      <div class="leave-confirm-card" role="alertdialog" aria-labelledby="leave-confirm-title" aria-describedby="leave-confirm-desc">
        <h2 id="leave-confirm-title">Leave ${label}?</h2>
        <p id="leave-confirm-desc">Your ${label} hasn't been submitted.</p>
        <div class="leave-confirm-actions">
          <button type="button" class="btn btn-secondary" data-action="leave-confirm-stay">Stay</button>
          <button type="button" class="btn btn-primary" data-action="leave-confirm-leave">Leave ${label}</button>
        </div>
      </div>
    </div>`;
}

/**
 * Prototype cancellation capability matrix.
 * Evaluates full-order vs line cancellation independently (CNC Packed etc.).
 * Mirakl sellers are never cancellable in Guide.
 */
function shipmentCancelEligibility(ship, seller) {
  const channel =
    seller.kind === "marketplace" || seller.kind === "target" ? "mirakl" : "guide";
  const status = String(ship.status || "").toLowerCase();
  const units = shipmentUnitCount(ship);
  const base = { ship, seller, units, channel, status: ship.status };

  if (channel === "mirakl") {
    return {
      ...base,
      fullOrder: false,
      lineItems: false,
      lineUnavailableReason:
        "Cancellation for this seller must be managed in Mirakl.",
    };
  }

  if (
    (status.includes("deliver") && !status.includes("out for")) ||
    status.includes("collected") ||
    status.includes("complete")
  ) {
    return {
      ...base,
      fullOrder: false,
      lineItems: false,
      lineUnavailableReason: "These items have already been fulfilled.",
    };
  }

  if (
    status.includes("ship") ||
    status.includes("transit") ||
    status.includes("out for")
  ) {
    return {
      ...base,
      fullOrder: false,
      lineItems: false,
      lineUnavailableReason: "These items have already shipped.",
    };
  }

  /** CNC mid/late fulfilment: full cancel can remain; line cancel closes. */
  const cncLineLocked =
    fulfilmentKind(seller.delivery) === "CNC" &&
    (status.includes("pick") ||
      status.includes("process") ||
      status.includes("pack") ||
      status.includes("ready for collection"));

  if (cncLineLocked) {
    return {
      ...base,
      fullOrder: true,
      lineItems: false,
      lineUnavailableReason:
        "Individual items can no longer be cancelled once this Click & Collect order has been packed. You can still cancel the entire remaining order.",
    };
  }

  return {
    ...base,
    fullOrder: true,
    lineItems: true,
    lineUnavailableReason: "",
  };
}

function cancelCapability() {
  const rows = [];
  for (const seller of sellers) {
    for (const ship of seller.shipments) {
      rows.push(shipmentCancelEligibility(ship, seller));
    }
  }

  const guideFull = rows.filter((r) => r.channel === "guide" && r.fullOrder);
  const guideLines = rows.filter((r) => r.channel === "guide" && r.lineItems);
  const mirakl = rows.filter((r) => r.channel === "mirakl" && r.units > 0);
  const lineBlocked = rows.find(
    (r) => r.channel === "guide" && r.fullOrder && !r.lineItems && r.lineUnavailableReason
  );

  const fullUnits = guideFull.reduce((n, r) => n + r.units, 0);
  const lineUnits = guideLines.reduce((n, r) => n + r.units, 0);

  return {
    rows,
    fullOrder: {
      available: fullUnits > 0,
      units: fullUnits,
      rows: guideFull,
    },
    lineItems: {
      available: lineUnits > 0,
      units: lineUnits,
      rows: guideLines,
      unavailableReason: lineUnits
        ? ""
        : lineBlocked?.lineUnavailableReason ||
          (fullUnits
            ? "Individual item cancellation isn't available for this order right now."
            : "No items can be cancelled in Guide for this order."),
    },
    mirakl,
  };
}

function cancelReasonOptionsHtml(selected) {
  const blank = `<option value="" ${!selected ? "selected" : ""}>Select a reason</option>`;
  const opts = CANCEL_REASONS.map(
    (r) => `<option value="${r}" ${selected === r ? "selected" : ""}>${r}</option>`
  ).join("");
  return blank + opts;
}

function cancelEntireSummaryHtml(cap) {
  if (!cap.fullOrder.available) {
    return `
      <section class="card card-pad cancel-panel">
        <h2>Cancel entire order</h2>
        <p class="help">No remaining items can be cancelled in Guide for this order.</p>
      </section>`;
  }

  const bySeller = new Map();
  for (const row of cap.fullOrder.rows) {
    const id = row.seller.id;
    if (!bySeller.has(id)) {
      bySeller.set(id, { seller: row.seller, rows: [], units: 0 });
    }
    const g = bySeller.get(id);
    g.rows.push(row);
    g.units += row.units;
  }

  const sellerBlocks = [...bySeller.values()]
    .map(({ seller, rows, units }) => {
      const linesHtml = rows
        .flatMap((row) =>
          row.ship.packages.flatMap((pkg) =>
            pkg.allocations.map((alloc) => {
              const line = lines[alloc.lineId];
              if (!line) return "";
              return `
                <div class="cancel-summary-item">
                  <div class="item-cell">
                    ${productThumbHtml(line)}
                    <div class="pkg-item-body">
                      <div class="item-name">${line.name} <span class="item-qty-inline">×${alloc.qtyInPackage}</span></div>
                      <div class="item-meta-line">SKU ${line.sku}</div>
                    </div>
                  </div>
                  <div class="refund-item-amount">${money(line.price * alloc.qtyInPackage)}</div>
                </div>`;
            })
          )
        )
        .join("");

      const store = resolveCollectionStore(seller, rows[0]?.ship);
      const fulfilment = fulfilmentLabel(seller.delivery);
      const storeBit = store
        ? ` · ${collectionStoreCompactLabel(store)}`
        : "";

      return `
        <div class="cancel-summary-seller">
          <div class="cancel-summary-seller-head">
            <strong>${seller.name}</strong>
            <span>${units} unit${units === 1 ? "" : "s"} · ${fulfilment}${storeBit}</span>
          </div>
          <div class="cancel-summary-items">${linesHtml}</div>
        </div>`;
    })
    .join("");

  const miraklNote = cap.mirakl.length
    ? `<div class="cancel-scope-note">
        <p><strong>Not included</strong> — cancellation for Marketplace / Target must be managed in Mirakl.</p>
        <ul>
          ${cap.mirakl
            .map(
              (r) =>
                `<li>${r.seller.name}${
                  r.seller.kind === "marketplace" ? " · Marketplace" : ""
                } · ${r.units} unit${r.units === 1 ? "" : "s"}
                  <button type="button" class="external-system-link" data-action="open-mirakl" data-seller="${r.seller.id}" data-channel="${r.seller.kind}">Cancel in Mirakl ↗</button>
                </li>`
            )
            .join("")}
        </ul>
      </div>`
    : "";

  const titleUnits = cap.fullOrder.units;
  const title =
    cap.mirakl.length > 0
      ? `Cancel all eligible Guide items`
      : `Cancel entire order`;

  return `
    <section class="card card-pad cancel-panel">
      <h2>${title}</h2>
      <p class="cancel-panel-lead">${titleUnits} remaining unit${titleUnits === 1 ? "" : "s"} will be cancelled in Guide.</p>
      ${sellerBlocks}
      ${miraklNote}
      <div class="cancel-reason-field">
        <label for="cancel-reason">Cancellation reason</label>
        <select id="cancel-reason" class="select select-reason-default" data-action="cancel-reason">
          ${cancelReasonOptionsHtml(state.cancel.reason)}
        </select>
      </div>
    </section>`;
}

function cancelLineItemRow(ship, pkg, alloc, elig) {
  const line = lines[alloc.lineId];
  if (!line) return "";
  const key = allocKey(pkg.id, alloc.lineId);
  const cancellable = !!elig.lineItems;
  const selectedQty = Number(state.cancel.items[key] || 0);
  const selected = selectedQty > 0;

  if (!cancellable) {
    return `
      <div class="cancel-line-item is-unavailable">
        <span class="refund-check-spacer" aria-hidden="true"></span>
        <div class="item-cell">
          ${productThumbHtml(line)}
          <div class="pkg-item-body">
            <div class="item-name">${line.name} <span class="item-qty-inline">×${alloc.qtyInPackage}</span></div>
            <div class="item-meta-line">SKU ${line.sku}</div>
          </div>
        </div>
        <div class="refund-item-amount">${money(line.price * alloc.qtyInPackage)}</div>
      </div>`;
  }

  return `
    <div class="cancel-line-item${selected ? " is-selected" : ""}">
      <input
        class="checkbox"
        type="checkbox"
        data-action="cancel-toggle-item"
        data-key="${key}"
        data-max="${alloc.qtyInPackage}"
        ${selected ? "checked" : ""}
        aria-label="Select ${line.name}"
      />
      <div class="item-cell">
        ${productThumbHtml(line)}
        <div class="pkg-item-body">
          <div class="item-name">${line.name} <span class="item-qty-inline">×${alloc.qtyInPackage}</span></div>
          <div class="item-meta-line">SKU ${line.sku}</div>
        </div>
      </div>
      <div class="refund-item-amount">${money(line.price * alloc.qtyInPackage)}</div>
    </div>`;
}

function cancelSpecificItemsHtml(cap) {
  if (!cap.lineItems.available) {
    return `
      <section class="card card-pad cancel-panel">
        <h2>Select items to cancel</h2>
        <div class="cancel-context-callout" role="status">
          <strong>Individual item cancellation isn't available</strong>
          <p>${cap.lineItems.unavailableReason}</p>
          ${
            cap.fullOrder.available
              ? `<button type="button" class="btn btn-md btn-outline" data-action="cancel-intent" data-intent="entire">Cancel entire order instead</button>`
              : ""
          }
        </div>
      </section>`;
  }

  const sellerHtml = sellers
    .map((seller) => {
      if (sellerRefundsInMirakl(seller)) {
        return `
          <section class="card seller-card seller-card-cancel seller-card-handoff">
            <div class="seller-head">
              <div class="seller-head-main">
                <div class="seller-title-row-inline">
                  <div class="seller-title">${seller.name}</div>
                  ${
                    seller.kind === "marketplace"
                      ? `<span class="seller-kind-chip">Marketplace</span>`
                      : ""
                  }
                  <button type="button" class="external-system-link" data-action="open-mirakl" data-seller="${seller.id}" data-channel="${seller.kind}">Cancel in Mirakl ↗</button>
                </div>
                <div class="seller-meta">${seller.itemCount} unit${seller.itemCount === 1 ? "" : "s"} · ${fulfilmentLabel(seller.delivery)}</div>
              </div>
            </div>
            <div class="seller-body">
              <p class="refund-handoff-note">Cancel these items in Mirakl.</p>
            </div>
          </section>`;
      }

      const shipBlocks = seller.shipments
        .map((ship) => {
          const elig = shipmentCancelEligibility(ship, seller);
          if (!elig.lineItems && !elig.fullOrder) return "";
          const pkgTotal = ship.packages.length;
          const pkgs = ship.packages
            .map((pkg) => {
              const items = pkg.allocations
                .map((alloc) => cancelLineItemRow(ship, pkg, alloc, elig))
                .join("");
              const showHeader = pkgTotal > 1;
              return `
                <div class="package-group refund-pkg${!showHeader ? " is-headerless" : ""}">
                  ${
                    showHeader
                      ? `<div class="package-label refund-pkg-head">
                          <span class="package-title">${packageHeadingText(pkg, pkgTotal)}</span>
                        </div>`
                      : ""
                  }
                  <div class="package-items refund-pkg-items">${items}</div>
                </div>`;
            })
            .join("");

          return `
            <div class="shipment-block shipment-block-refund">
              <div class="refund-ship-head">
                <div class="refund-ship-title-row">
                  <h3>${ship.label}</h3>
                  ${statusBadge(ship.status)}
                </div>
              </div>
              <div class="refund-ship-meta">
                ${storeMeta(ship, seller)}
                <span class="meta-sep" aria-hidden="true">·</span>
                <span>${serviceLabel(ship.shippingMethod)}</span>
              </div>
              <div class="refund-ship-body package-stack refund-pkg-stack">${pkgs}</div>
            </div>`;
        })
        .join("");

      if (!shipBlocks.trim()) return "";

      return `
        <section class="card seller-card seller-card-refund seller-card-cancel">
          <div class="seller-head">
            <div class="seller-head-main">
              <div class="seller-title">${seller.name}</div>
              <div class="seller-meta">${seller.itemCount} unit${seller.itemCount === 1 ? "" : "s"} · ${fulfilmentLabel(seller.delivery)}</div>
            </div>
          </div>
          <div class="seller-body">${shipBlocks}</div>
        </section>`;
    })
    .join("");

  const selectedUnits = Object.values(state.cancel.items).reduce(
    (n, q) => n + (Number(q) || 0),
    0
  );

  return `
    <section class="card card-pad cancel-panel">
      <div class="select-head select-head-inline">
        <div>
          <h2>Select items to cancel</h2>
          <p class="help">Only lines eligible for item cancellation can be selected.</p>
        </div>
        <div class="pill-count">${selectedUnits ? `${selectedUnits} selected` : "Nothing selected"}</div>
      </div>
    </section>
    ${sellerHtml}
    <section class="card card-pad cancel-panel">
      <div class="cancel-reason-field">
        <label for="cancel-reason-lines">Cancellation reason</label>
        <select id="cancel-reason-lines" class="select select-reason-default" data-action="cancel-reason">
          ${cancelReasonOptionsHtml(state.cancel.reason)}
        </select>
      </div>
    </section>`;
}

function cancelIntentHtml(cap) {
  const intent = state.cancel.intent;
  const entireDisabled = !cap.fullOrder.available;
  const linesDisabled = !cap.lineItems.available;

  return `
    <section class="card card-pad cancel-intent" aria-label="Cancellation intent">
      <h2>What would you like to cancel?</h2>
      <div class="cancel-intent-options" role="radiogroup" aria-label="Cancel scope">
        <label class="cancel-intent-option${intent === "entire" ? " is-selected" : ""}${entireDisabled ? " is-unavailable" : ""}">
          <input
            type="radio"
            name="cancel-intent"
            data-action="cancel-intent"
            data-intent="entire"
            ${intent === "entire" ? "checked" : ""}
            ${entireDisabled ? "disabled" : ""}
          />
          <span class="cancel-intent-copy">
            <span class="cancel-intent-title">Entire order</span>
            <span class="cancel-intent-desc">${
              entireDisabled
                ? "No remaining items can be cancelled in Guide."
                : cap.mirakl.length
                  ? `Cancel all remaining eligible Guide items (${cap.fullOrder.units} unit${cap.fullOrder.units === 1 ? "" : "s"}).`
                  : `Cancel all remaining eligible items in this order (${cap.fullOrder.units} unit${cap.fullOrder.units === 1 ? "" : "s"}).`
            }</span>
            <span class="cancel-intent-avail">${entireDisabled ? "Unavailable" : "Available"}</span>
          </span>
        </label>
        <label class="cancel-intent-option${intent === "lines" ? " is-selected" : ""}${linesDisabled ? " is-unavailable" : ""}">
          <input
            type="radio"
            name="cancel-intent"
            data-action="cancel-intent"
            data-intent="lines"
            ${intent === "lines" ? "checked" : ""}
            ${linesDisabled ? "disabled" : ""}
          />
          <span class="cancel-intent-copy">
            <span class="cancel-intent-title">Specific items</span>
            <span class="cancel-intent-desc">${
              linesDisabled
                ? cap.lineItems.unavailableReason
                : "Choose one or more eligible items to cancel."
            }</span>
            <span class="cancel-intent-avail">${linesDisabled ? "Unavailable" : "Available"}</span>
          </span>
        </label>
      </div>
    </section>`;
}

function renderCancel() {
  const cap = cancelCapability();
  const intent = state.cancel.intent;
  const selectedUnits =
    intent === "entire"
      ? cap.fullOrder.units
      : Object.values(state.cancel.items).reduce((n, q) => n + (Number(q) || 0), 0);
  const canReview = !!intent && selectedUnits > 0 && !!state.cancel.reason;

  const body =
    intent === "entire"
      ? cancelEntireSummaryHtml(cap)
      : intent === "lines"
        ? cancelSpecificItemsHtml(cap)
        : `<section class="card card-pad cancel-panel">
            <p class="help" style="margin:0">Choose Entire order or Specific items to continue.</p>
          </section>`;

  return `
    ${workflowHead({
      title: `Cancel order ${order.id}`,
      lead: "Guide evaluates what cancellation is available for this order.",
      actionLabel: "cancellation",
    })}
    ${workspace(`
      ${cancelIntentHtml(cap)}
      ${body}
      <div class="actions">
        <button class="btn btn-primary" data-action="cancel-review" ${!canReview ? "disabled" : ""}>Review cancellation</button>
        <button class="btn btn-secondary" data-action="back-to-order">Back</button>
      </div>
    `)}`;
}

function orderHasRefundable() {
  if (Number(order.shippingRemaining) > 0) return true;
  return Object.values(lines).some(
    (l) => l.refundable || l.shippingFee?.refundable
  );
}

/** Units still unallocated / pre-fulfilment can be cancelled. */
function orderHasCancellableUnits() {
  let accounted = 0;
  for (const seller of sellers) {
    for (const ship of seller.shipments) {
      const units = shipmentUnitCount(ship);
      accounted += units;
      const display = displayShipmentStatus(ship, seller, shippitByTracking);
      const s = String(display.label || "").toLowerCase();
      if (
        s.includes("prepar") ||
        s.includes("pick") ||
        s.includes("allocat") ||
        s.includes("pending") ||
        s.includes("process") ||
        s.includes("placed")
      ) {
        return true;
      }
    }
  }
  return accounted < (order.items || 0);
}

/** Report damage makes sense once something has been delivered. */
function orderHasDeliveredUnits() {
  for (const seller of sellers) {
    for (const ship of seller.shipments) {
      const display = displayShipmentStatus(ship, seller, shippitByTracking);
      const s = String(display.label || ship.status || "").toLowerCase();
      if (s.includes("deliver") && !s.includes("attempt") && !s.includes("unsuccessful")) {
        return shipmentUnitCount(ship) > 0;
      }
    }
  }
  return false;
}

/**
 * Order Detail workflows — shared by header Actions ▾ and bottom panel.
 * Create case stays available even when a case is linked.
 * Case messaging belongs to the shell / action workflow — not this component.
 */
function availableOrderActions() {
  return [
    { id: "start-refund", label: "Refund", icon: icons.refund },
    { id: "start-cancel", label: "Cancel", icon: icons.cancelItems },
    { id: "report-damage", label: "Report damage", icon: icons.reportDamage },
    { id: "create-case", label: "Create case", icon: icons.createCase },
  ];
}

/**
 * Compact header cue — am I writing to a case?
 * Detail stays in the sidebar Case card; this sits next to Order actions.
 */
function headerCaseContextHtml() {
  const linked = linkedCase();
  if (linked) {
    return `
      <span class="header-case-cue is-linked">
        <span class="header-case-cue-icon" aria-hidden="true">${icons.caseLink}</span>
        <button
          type="button"
          class="header-case-cue-ref"
          data-action="view-case"
          data-case="${linked.id}"
          title="View linked case #${linked.id}"
        >Case #${linked.id}</button>
        <span class="header-case-cue-sep" aria-hidden="true">·</span>
        <button type="button" class="header-case-cue-link" data-action="change-linked-case">Switch</button>
      </span>`;
  }
  return `
    <span class="header-case-cue is-unlinked">
      <span class="header-case-cue-icon" aria-hidden="true">${icons.caseLink}</span>
      <span class="header-case-cue-ref">No case linked</span>
      <span class="header-case-cue-sep" aria-hidden="true">·</span>
      <button type="button" class="header-case-cue-link" data-action="open-link-case">Link case</button>
    </span>`;
}

/**
 * Compact header shortcut — same servicing set as the bottom panel.
 * Track shipments is navigation (separated); no case messaging in the menu.
 */
function orderActionsMenu() {
  const open = !!state.actionsMenuOpen;
  const actionItems = availableOrderActions()
    .map(
      (a) => `
      <button type="button" class="order-actions-menu-item" role="menuitem" data-action="${a.id}">
        <span class="btn-icon" aria-hidden="true">${a.icon}</span>
        ${a.label}
      </button>`
    )
    .join("");
  const trackItem = `
    <button
      type="button"
      class="order-actions-menu-item is-nav"
      role="menuitem"
      data-view="track"
    >
      <span class="btn-icon" aria-hidden="true">${icons.truck}</span>
      Track shipments
    </button>
    <div class="order-actions-menu-sep" role="separator"></div>`;
  return `
    <div class="header-actions-cluster">
      ${headerCaseContextHtml()}
      <div class="order-actions-menu${open ? " is-open" : ""}">
        <button
          type="button"
          class="btn btn-md btn-outline order-actions-trigger"
          data-action="toggle-order-actions"
          aria-expanded="${open ? "true" : "false"}"
          aria-haspopup="menu"
          aria-label="Order actions"
        >
          Order actions
          <span class="btn-icon order-actions-chevron" aria-hidden="true">${icons.chevronDown}</span>
        </button>
        ${
          open
            ? `<div class="order-actions-dropdown" role="menu" aria-label="Order actions">
                ${trackItem}
                ${actionItems}
              </div>`
            : ""
        }
      </div>
    </div>`;
}

/**
 * Utilitarian end-of-page action surface — same set as header ▾.
 * Track = quiet view shortcut; buttons = servicing actions. No case copy.
 */
function orderActionsPanel() {
  const onTrack = state.view === "track";
  const actionButtons = availableOrderActions()
    .map(
      (a) => `
      <button type="button" class="btn btn-md btn-outline" data-action="${a.id}">
        <span class="btn-icon" aria-hidden="true">${a.icon}</span>
        ${a.label}
      </button>`
    )
    .join("");
  const trackNav = onTrack
    ? ""
    : `
        <button type="button" class="order-actions-track" data-view="track">
          <span class="order-actions-track-icon" aria-hidden="true">${icons.truck}</span>
          Track shipments →
        </button>
        <span class="order-actions-btns-sep" aria-hidden="true"></span>`;
  return `
    <section class="card card-pad order-actions-card" aria-labelledby="order-actions-heading">
      <h2 id="order-actions-heading">Order actions</h2>
      <div class="order-actions-btns">
        ${trackNav}
        ${actionButtons}
      </div>
    </section>`;
}

/**
 * Order-level status distribution from Care-facing shipment statuses.
 * Only non-zero buckets; quantities should reconcile to order.items.
 */
function orderProgress() {
  const counts = new Map();
  let accounted = 0;

  for (const seller of sellers) {
    for (const ship of seller.shipments) {
      const units = shipmentUnitCount(ship);
      if (!units) continue;
      accounted += units;
      const display = displayShipmentStatus(ship, seller, shippitByTracking);
      const key = statusPhrase(display.label);
      counts.set(key, (counts.get(key) || 0) + units);
    }
  }

  const parts = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => statusSortKey(a[0]) - statusSortKey(b[0]))
    .map(([k, n]) => `${n} ${k}`);

  if (accounted < order.items) {
    parts.push(`${order.items - accounted} unallocated`);
  }

  return parts.join(" · ");
}

function totalRefundedAmount() {
  if (typeof order.totalRefunded === "number") return order.totalRefunded;
  return (refundHistory || []).reduce((s, r) => s + (r.amount || 0), 0);
}

/** Channel/brand level for header — not individual Marketplace seller names. */
const SOLD_BY_CHANNELS = [
  { kind: "kmart", label: "Kmart" },
  { kind: "target", label: "Target" },
  { kind: "marketplace", label: "Marketplace" },
];

function orderSoldByChannels() {
  const present = new Set(
    sellers.map((s) => String(s.kind || "").toLowerCase()).filter(Boolean)
  );
  return SOLD_BY_CHANNELS.filter((c) => present.has(c.kind));
}

function soldByFactHtml() {
  const channels = orderSoldByChannels();
  if (!channels.length) {
    return `
      <div class="fact fact-sold-by">
        <span class="label">Sold by</span>
        <span class="value">—</span>
      </div>`;
  }
  const labels = channels
    .map(
      (c) =>
        `<span class="sold-by-label sold-by-${c.kind}">${c.label}</span>`
    )
    .join("");
  return `
    <div class="fact fact-sold-by">
      <span class="label">Sold by</span>
      <div class="sold-by-labels" aria-label="${channels.map((c) => c.label).join(", ")}">${labels}</div>
    </div>`;
}

/** OnePass membership mark for the customer section in Order information. */
function onePassMemberHtml() {
  if (!customer.onePassMember) return "";
  return `
    <span class="rail-onepass" title="OnePass member">
      <img
        class="rail-onepass-logo"
        src="./assets/brand/onepass-logo.png"
        alt="OnePass member"
        width="20"
        height="20"
        draggable="false"
      />
    </span>`;
}

const AI_PREVERIFY_TOOLTIP =
  "Completed by AI before handoff. This indicator doesn't update after manual verification.";

/**
 * Customer/contact handoff signal — quiet line under the name.
 * Confirmation cue (green text), not a filled lifecycle badge. Show nothing if unset.
 */
function aiPreVerificationIdentityHtml() {
  if (!state.aiThreeStepPreVerified) return "";
  return `
    <p class="rail-preverify" title="${AI_PREVERIFY_TOOLTIP}">
      <span class="rail-preverify-icon" aria-hidden="true">${icons.check}</span>
      3-step pre-verified
    </p>`;
}

/**
 * Order header — order identity, fulfilment, composition, money.
 * Customer/contact attributes (including AI pre-verify) live in the Customer rail.
 * Case linkage lives beside Order actions (servicing context).
 */
function hero({ showActionsMenu = false } = {}) {
  const refunded = totalRefundedAmount();
  const refundedFact =
    refunded > 0
      ? `<div class="fact fact-refunded">
          <span class="label">Refunded</span>
          <span class="value-row">
            <span class="value">${money(refunded)}</span>
            <button
              type="button"
              class="fact-jump"
              data-action="jump-refund-history"
              title="View refund history"
            >View</button>
          </span>
        </div>`
      : "";

  const fulfilment = orderFulfilmentSummaryHtml();

  return `
    <section class="card card-accent card-pad hero-card">
      <div class="hero">
        <div class="hero-main">
          <div class="hero-title-row">
            <div class="hero-title-heading">
              <h1>Order ${order.id}</h1>
              ${copyControl(order.id, "order number")}
              ${statusBadge(order.status, { prominent: true })}
            </div>
            ${
              showActionsMenu
                ? `<div class="hero-title-aside">${orderActionsMenu()}</div>`
                : ""
            }
          </div>
          <p class="sub">
            <span>${formatAuDate(order.date)}</span>
            ${
              fulfilment
                ? `<span class="hero-sub-sep" aria-hidden="true">·</span>${fulfilment}`
                : ""
            }
          </p>
          <p class="progress-line">${orderProgress()}</p>
        </div>
      </div>
      <div class="facts">
        <div class="facts-group facts-composition">
          ${soldByFactHtml()}
        </div>
        <div class="fact-split" aria-hidden="true"></div>
        <div class="facts-group facts-financial">
          <div class="fact"><span class="label">Total</span><span class="value">${money(order.total)}</span></div>
          ${refundedFact}
        </div>
      </div>
    </section>`;
}

function deliveryAddressLines() {
  const raw = shipTo?.address || sellers[0]?.shipToAddress || "";
  const [street, ...rest] = raw.split(",").map((s) => s.trim());
  return { street, locality: rest.join(", "), full: raw };
}

/**
 * Resolve Click & Collect destination for a seller/shipment.
 * Customer-facing store name is primary; store id is secondary operational metadata.
 * Never treat store id as the only collection-location identifier when a name exists.
 */
function resolveCollectionStore(seller, ship = null) {
  const raw = seller?.collectionStore;
  let id = null;
  let name = null;
  let address = null;

  if (raw && typeof raw === "object") {
    id = raw.id != null ? String(raw.id) : null;
    name = raw.name || null;
    address = raw.address || null;
  } else if (raw != null && raw !== "") {
    id = String(raw);
  }

  if ((!id || id === "MP") && ship?.store && ship.store !== "MP") {
    id = String(ship.store);
  }
  if (!name && ship?.storeName) name = ship.storeName;
  if (!address && ship?.storeAddress) address = ship.storeAddress;

  if (!id && !name) {
    const fromShip = String(seller?.shipFrom || "");
    const named = fromShip.match(/^(.*?)(?:\s+Store)?\s+(\d{3,})\s*$/i);
    if (named) {
      const parsedName = named[1].replace(/\s+Store$/i, "").trim();
      if (parsedName) name = parsedName;
      id = named[2];
    } else {
      const digits = (fromShip.match(/\d{3,}/) || [])[0];
      if (digits) id = digits;
    }
  }

  if (!id && !name) return null;
  return { id, name, address };
}

function collectionStorePrimaryName(store) {
  if (!store) return "";
  return store.name || (store.id ? `Store ${store.id}` : "");
}

/** Compact in-shipment form: “Kmart Chadstone · Store 1210” */
function collectionStoreCompactLabel(store) {
  if (!store) return "";
  if (store.name && store.id) return `${store.name} · Store ${store.id}`;
  return collectionStorePrimaryName(store);
}

function firstCncSeller() {
  return sellers.find((s) => fulfilmentKind(s.delivery) === "CNC") || null;
}

function hdDestinationPromiseHtml() {
  const region = shipTo?.region || "";
  const supported = sellers.some(
    (s) =>
      destinationService.appliesToKinds.includes(s.kind) &&
      fulfilmentKind(s.delivery) === "HD"
  );
  const timeframe =
    supported && region
      ? destinationService.timeframeByRegion[region] || ""
      : "";

  if (supported && region && timeframe) {
    return `<p class="track-dest-promise"><span class="track-dest-region">${region}</span><span class="track-dest-sep" aria-hidden="true">·</span>${destinationService.service}<span class="track-dest-sep" aria-hidden="true">·</span>${timeframe}</p>`;
  }
  if (region) {
    return `<p class="track-dest-promise"><span class="track-dest-region">${region}</span></p>`;
  }
  return "";
}

/**
 * Page-level fulfilment destination — parallel Collect from / Delivery to.
 * Mixed orders list both under Fulfilment.
 */
function deliveryDestinationStrip() {
  const kinds = orderFulfilmentKinds();
  const hasCnc = kinds.has("CNC");
  const hasHd = kinds.has("HD");
  const cncSeller = firstCncSeller();
  const store = resolveCollectionStore(cncSeller, cncSeller?.shipments?.[0]);
  const addr = deliveryAddressLines();

  if (hasCnc && hasHd) {
    const collectPrimary = collectionStorePrimaryName(store) || "Click &amp; Collect";
    const collectMeta = store?.id
      ? `Store ${store.id} · Click &amp; Collect`
      : "Click &amp; Collect";
    const deliveryLine = addr.full
      ? addr.full.split(",")[0].trim()
      : "Home delivery";
    return `
      <section class="track-dest track-dest-mixed" aria-label="Fulfilment destinations">
        <div class="track-dest-heading">
          <span class="track-dest-label">Fulfilment</span>
        </div>
        <div class="track-dest-lane">
          <span class="track-dest-lane-icon" aria-hidden="true">${icons.store}</span>
          <div class="track-dest-lane-body">
            <p class="track-dest-lane-title">Collect from — ${collectPrimary}</p>
            <p class="track-dest-lane-meta">${collectMeta}</p>
          </div>
        </div>
        <div class="track-dest-lane">
          <span class="track-dest-lane-icon" aria-hidden="true">${icons.truck}</span>
          <div class="track-dest-lane-body">
            <p class="track-dest-lane-title">Delivery to — ${deliveryLine}</p>
            <p class="track-dest-lane-meta">Home delivery</p>
          </div>
        </div>
      </section>`;
  }

  if (hasCnc && store) {
    const primary = collectionStorePrimaryName(store);
    const meta = store.id
      ? `Store ${store.id} · Click &amp; Collect`
      : "Click &amp; Collect";
    return `
      <section class="track-dest" aria-label="Collection destination">
        <div class="track-dest-heading">
          <span class="track-dest-icon" aria-hidden="true">${icons.store}</span>
          <span class="track-dest-label">Collect from</span>
        </div>
        <p class="track-dest-place">${primary}</p>
        ${store.address ? `<p class="track-dest-address">${store.address}</p>` : ""}
        <p class="track-dest-promise">${meta}</p>
      </section>`;
  }

  if (!addr.full) return "";

  return `
    <section class="track-dest" aria-label="Delivery destination">
      <div class="track-dest-heading">
        <span class="track-dest-icon" aria-hidden="true">${icons.home}</span>
        <span class="track-dest-label">Delivery to</span>
      </div>
      <p class="track-dest-address">${addr.full}</p>
      ${hdDestinationPromiseHtml()}
    </section>`;
}

/**
 * Order information rail destination — Collect from / Delivery / both.
 */
function orderInformationDestinationHtml() {
  const kinds = orderFulfilmentKinds();
  const hasCnc = kinds.has("CNC");
  const hasHd = kinds.has("HD");
  const cncSeller = firstCncSeller();
  const store = resolveCollectionStore(cncSeller, cncSeller?.shipments?.[0]);
  const addr = deliveryAddressLines();

  if (hasCnc && hasHd) {
    return `
      <h3 class="rail-subhead rail-subhead-first">Fulfilment</h3>
      <div class="rail-fulfilment-block">
        <p class="rail-fulfilment-title">
          <span class="rail-case-icon" aria-hidden="true">${icons.store}</span>
          Collect from — ${collectionStorePrimaryName(store) || "Click &amp; Collect"}
        </p>
        <p class="rail-contact">${
          store?.id ? `Store ${store.id} · Click &amp; Collect` : "Click &amp; Collect"
        }</p>
      </div>
      <div class="rail-fulfilment-block">
        <p class="rail-fulfilment-title">
          <span class="rail-case-icon" aria-hidden="true">${icons.truck}</span>
          Delivery to
        </p>
        <div class="rail-address rail-copy-row">
          <p>${addr.street}${addr.locality ? `<br>${addr.locality}` : ""}</p>
          ${copyControl(addr.full, "delivery address")}
        </div>
      </div>`;
  }

  if (hasCnc && store) {
    return `
      <h3 class="rail-subhead rail-subhead-first">Collect from</h3>
      <p class="rail-identity">${collectionStorePrimaryName(store)}</p>
      ${
        store.address
          ? `<div class="rail-address rail-copy-row">
              <p>${store.address}</p>
              ${copyControl(store.address, "store address")}
            </div>`
          : ""
      }
      <p class="rail-contact">${
        store.id ? `Store ${store.id} · Click &amp; Collect` : "Click &amp; Collect"
      }</p>`;
  }

  return `
    <h3 class="rail-subhead rail-subhead-first">Delivery</h3>
    <div class="rail-address rail-copy-row">
      <p>${addr.street}${addr.locality ? `<br>${addr.locality}` : ""}</p>
      ${copyControl(addr.full, "delivery address")}
    </div>`;
}

function servicingCaseRailHtml() {
  const linked = linkedCase();
  if (linked) {
    return `
      <section class="rail-card rail-card-compact rail-case-card is-linked" aria-label="Current case">
        <h2 class="rail-section-title">Current case</h2>
        <p class="rail-case-id">
          <button
            type="button"
            class="rail-case-id-link"
            data-action="view-case"
            data-case="${linked.id}"
            title="View case #${linked.id}"
          >Case #${linked.id}</button>
        </p>
        <p class="rail-case-meta">${linked.topic} · ${linked.state}</p>
        <p class="rail-case-note">Guide actions will be added to this case.</p>
        <p class="rail-case-actions">
          <button type="button" class="rail-context-link" data-action="change-linked-case">Switch case</button>
          <span class="rail-context-sep" aria-hidden="true">·</span>
          <button type="button" class="rail-context-link is-quiet" data-action="unlink-case">Unlink</button>
        </p>
      </section>`;
  }

  return `
    <section class="rail-card rail-card-compact rail-case-card is-unlinked" aria-label="Case">
      <h2 class="rail-section-title">Case</h2>
      <p class="rail-case-status">
        <span class="rail-case-icon" aria-hidden="true">${icons.caseLink}</span>
        No case linked
      </p>
      <p class="rail-case-note">Your next servicing action will create a new case.</p>
      <p class="rail-context-links">
        <button type="button" class="rail-context-link" data-action="open-link-case">Link existing case →</button>
      </p>
    </section>`;
}

function contextRail() {
  const channel =
    order.source === "web"
      ? "Web"
      : String(order.source || "").replace(/^\w/, (c) => c.toUpperCase());
  const onePass = onePassMemberHtml();
  const match = customer.profileMatch || "matched";

  let customerHistory = "";
  if (match === "unmatched") {
    customerHistory = `<p class="rail-profile-note">No matched customer profile — order and case history aren't available.</p>`;
  } else {
    const caution =
      match === "ambiguous"
        ? `<p class="rail-profile-note">Multiple profiles could match this customer. Confirm identity before using history.</p>`
        : "";
    customerHistory = `
      ${caution}
      <p class="rail-context-links">
        <button type="button" class="rail-context-link" data-action="open-customer-orders">Recent orders</button>
        <span class="rail-context-sep" aria-hidden="true">·</span>
        <button type="button" class="rail-context-link" data-action="open-customer-cases">Case history</button>
      </p>`;
  }

  return `
    <aside class="context-rail" aria-label="Order context">
      ${servicingCaseRailHtml()}
      <section class="rail-card rail-card-compact rail-customer-card">
        <h2 class="rail-section-title">Customer</h2>
        <div class="rail-customer-identity">
          <p class="rail-identity">
            <span>${customer.name}</span>
            ${onePass}
          </p>
          ${aiPreVerificationIdentityHtml()}
        </div>
        <div class="rail-customer-contact">
          <p class="rail-contact rail-copy-row">
            <a href="#" onclick="return false">${customer.email}</a>
            ${copyControl(customer.email, "email")}
          </p>
          <p class="rail-contact rail-copy-row">
            <span>${customer.phone}</span>
            ${copyControl(customer.phone, "phone")}
          </p>
        </div>
        ${
          customerHistory
            ? `<div class="rail-customer-context">${customerHistory}</div>`
            : ""
        }
      </section>

      <section class="rail-card rail-card-compact">
        <h2 class="rail-section-title">Order information</h2>

        ${orderInformationDestinationHtml()}

        <h3 class="rail-subhead">Payment</h3>
        <p class="rail-contact">${order.paymentMethod} ···· ${order.paymentLast4}</p>

        <h3 class="rail-subhead">Order source</h3>
        <p class="rail-contact">${channel}</p>
      </section>
    </aside>`;
}

function workspace(mainHtml, { showRail = false } = {}) {
  return `
    <div class="workspace ${showRail ? "workspace-with-rail" : "workspace-main-only"}">
      <div class="workspace-main">${mainHtml}</div>
      ${showRail ? contextRail() : ""}
    </div>`;
}

/**
 * Customer-context drawers — side panel over Order Detail, not a modal.
 *
 * Recent orders / Case history are keyed by the email on the matched customer
 * profile. The display name is for recognition only and must never be used as
 * the search key. No fallback to name, phone, or fuzzy match when email is missing.
 */
function customerProfileEmail() {
  return String(customer.email || "").trim();
}

function customerDrawerShell(kind, title, bodyHtml, footerHtml = "", { subtitle = "" } = {}) {
  const identity = subtitle
    ? `<p class="customer-drawer-identity">${subtitle}</p>`
    : "";
  return `
    <div class="customer-drawer-root" data-drawer-open="${kind}">
      <button type="button" class="customer-drawer-backdrop" data-action="close-customer-drawer" aria-label="Close panel"></button>
      <aside
        class="customer-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-drawer-title"
      >
        <header class="customer-drawer-head">
          <div class="customer-drawer-head-text">
            <h2 id="customer-drawer-title">${title}</h2>
            ${identity}
          </div>
          <button
            type="button"
            class="customer-drawer-close"
            data-action="close-customer-drawer"
            aria-label="Close"
          >×</button>
        </header>
        <div class="customer-drawer-body">${bodyHtml}</div>
        ${footerHtml ? `<footer class="customer-drawer-foot">${footerHtml}</footer>` : ""}
      </aside>
    </div>`;
}

function customerContextUnavailableHtml(kind, label) {
  const name = customer.name || "Customer";
  return customerDrawerShell(
    kind,
    `${label} — ${name}`,
    `
      <div class="customer-drawer-empty">
        <strong>${label} unavailable</strong>
        <p>No email address is available for this customer.</p>
      </div>
    `
  );
}

function recentOrderCardHtml(row) {
  const isCurrent = row.id === order.id;
  const status = statusBadge(row.status);
  const eyebrow = isCurrent
    ? `<div class="customer-order-eyebrow">Current order</div>`
    : "";
  const body = `
    ${eyebrow}
    <div class="customer-order-date">${row.date}</div>
    <div class="customer-order-id">Order ${row.id}</div>
    <div class="customer-order-brand">${row.brandLine}</div>
    <div class="customer-order-meta">
      <span class="customer-order-status">${status}</span>
      <span class="customer-order-end">
        <span class="customer-order-total">${money(row.total)}</span>
        ${
          isCurrent
            ? ""
            : `<span class="customer-order-chevron" aria-hidden="true">${icons.chevronRight}</span>`
        }
      </span>
    </div>`;

  if (isCurrent) {
    return `<div class="customer-order-card is-current" aria-current="true">${body}</div>`;
  }

  const canOpen = !!(row.demoId && isSelectableDemoOrder(row.demoId));
  const openAttrs = canOpen
    ? `data-action="open-recent-order" data-order="${row.demoId}"`
    : `data-action="recent-order-unavailable" data-order="${row.id}"`;
  return `<button type="button" class="customer-order-card is-nav" ${openAttrs}>${body}</button>`;
}

function recentOrdersDrawerHtml() {
  const email = customerProfileEmail();
  if (!email) return customerContextUnavailableHtml("orders", "Recent orders");

  const name = customer.name || "Customer";
  const rows = customerRecentOrders.map(recentOrderCardHtml).join("");
  const ambiguousNote =
    customer.profileMatch === "ambiguous"
      ? `<p class="customer-drawer-caution">Profile match is ambiguous — confirm ${email} before acting on another order.</p>`
      : "";

  return customerDrawerShell(
    "orders",
    `Recent orders — ${name}`,
    `
      ${ambiguousNote}
      <p class="customer-drawer-count">${customerRecentOrders.length} recent orders</p>
      <div class="customer-order-list">${rows}</div>
    `,
    `<button type="button" class="linkish" data-action="view-all-orders">View all orders</button>`,
    { subtitle: email }
  );
}

function recentCasesDrawerHtml() {
  const email = customerProfileEmail();
  const linkMode = state.customerDrawer === "link-case";
  const label = linkMode ? "Choose a case" : "Case history";
  if (!email) return customerContextUnavailableHtml(linkMode ? "link-case" : "cases", label);

  const name = customer.name || "Customer";
  const linked = linkedCase();
  const openRows = [];
  const closedRows = [];

  for (const c of customerRecentCases) {
    const orderLine = c.orderId
      ? `<div class="customer-case-order">Order ${c.orderId}</div>`
      : "";
    const isLinked = state.linkedCaseId === c.id;

    if (linkMode) {
      if (c.open && c.linkable !== false) {
        openRows.push(`
          <div class="customer-case-card is-open${isLinked ? " is-linked" : ""}">
            <div class="customer-case-state">Open · ${c.topic}</div>
            <div class="customer-case-id">Case #${c.id}</div>
            ${orderLine}
            <div class="customer-case-when">${c.when}</div>
            ${
              isLinked
                ? `<div class="customer-case-assoc">
                    <span class="customer-case-assoc-status">
                      <span class="customer-case-assoc-icon" aria-hidden="true">${icons.caseLink}</span>
                      Linked to this interaction
                    </span>
                    <button type="button" class="customer-case-unlink" data-action="unlink-case">Unlink</button>
                  </div>`
                : `<button type="button" class="btn btn-md btn-primary customer-case-link-btn" data-action="link-case" data-case="${c.id}">Link case</button>`
            }
          </div>`);
      } else {
        closedRows.push(`
          <div class="customer-case-card is-closed" aria-disabled="true">
            <div class="customer-case-state">Closed · ${c.topic}</div>
            <div class="customer-case-id">Case #${c.id}</div>
            ${orderLine}
            <div class="customer-case-when">${c.when}</div>
            <div class="customer-case-closed-note">Closed — context only</div>
          </div>`);
      }
      continue;
    }

    const view = c.open
      ? `<span class="customer-case-view">View case →</span>`
      : "";
    const card = `
      <button
        type="button"
        class="customer-case-card${c.open ? " is-open" : " is-closed"}"
        data-action="view-case"
        data-case="${c.id}"
      >
        <div class="customer-case-state">${c.state} · ${c.topic}</div>
        <div class="customer-case-id">Case #${c.id}</div>
        ${orderLine}
        <div class="customer-case-when">${c.when}</div>
        ${view}
      </button>`;
    if (c.open) openRows.push(card);
    else closedRows.push(card);
  }

  const linkActionNoun =
    state.view === "refund"
      ? "this refund"
      : state.view === "cancel"
        ? "this cancellation"
        : "this interaction";
  const intro = linkMode
    ? linked
      ? `<p class="customer-drawer-count">Currently linked: Case #${linked.id}. Select another case to switch, or unlink the current case.</p>`
      : `<p class="customer-drawer-count">Select an open case to link to ${linkActionNoun}.</p>`
    : "";
  const ambiguousNote =
    customer.profileMatch === "ambiguous"
      ? `<p class="customer-drawer-caution">Profile match is ambiguous — confirm ${email} before linking a case.</p>`
      : "";

  const sections = `
    ${openRows.length ? `<div class="customer-case-group"><h3 class="customer-case-group-title">Open</h3><div class="customer-case-list">${openRows.join("")}</div></div>` : ""}
    ${closedRows.length ? `<div class="customer-case-group"><h3 class="customer-case-group-title">Closed</h3><div class="customer-case-list">${closedRows.join("")}</div></div>` : ""}
  `;

  return customerDrawerShell(
    linkMode ? "link-case" : "cases",
    linkMode ? `Choose a case — ${name}` : `Case history — ${name}`,
    `
      ${ambiguousNote}
      ${intro}
      ${sections}
    `,
    linkMode
      ? ""
      : `<button type="button" class="linkish" data-action="view-all-cases">View all cases</button>`,
    { subtitle: email }
  );
}

function customerContextDrawer() {
  if (state.customerDrawer === "orders") return recentOrdersDrawerHtml();
  if (state.customerDrawer === "cases" || state.customerDrawer === "link-case") {
    return recentCasesDrawerHtml();
  }
  return "";
}

function lineRow(
  line,
  qtyInPackage,
  { parentStatus = null, unitStatus = null } = {}
) {
  /** Only allocation-level overrides surface; line catalogue status is not per-package. */
  const showItemStatus =
    unitStatus && parentStatus && !sameStatus(unitStatus, parentStatus);

  return `
    <div class="pkg-item">
      <div class="item-cell">
        ${productThumbHtml(line)}
        <div class="pkg-item-body">
          <div class="item-name">${line.name} <span class="item-qty-inline">×${qtyInPackage}</span></div>
          <div class="item-meta-line">SKU ${line.sku} · ${money(line.price)} each</div>
          ${showItemStatus ? `<div class="item-status-inline">${statusBadge(unitStatus)}</div>` : ""}
        </div>
      </div>
      <div class="pkg-item-sub">${money(line.price * qtyInPackage)}</div>
    </div>`;
}

/** Shared package heading — shown only when a shipment has 2+ packages. */
function packageHeadingText(pkg, packageTotal) {
  const units = packageUnitCount(pkg);
  return `Package ${pkg.index} of ${packageTotal} · ${units} unit${units === 1 ? "" : "s"}`;
}

function packageItemsHtml(pkg, shipmentStatus = null) {
  const inheritedStatus = shipmentStatus || pkg.status;
  return pkg.allocations
    .map((alloc) => {
      const line = lines[alloc.lineId];
      return lineRow(line, alloc.qtyInPackage, {
        parentStatus: pkg.status || inheritedStatus,
        unitStatus: alloc.status || null,
      });
    })
    .join("");
}

/** Nested under parent merchandise — own checkbox; amount + shipping-specific reason. */
function refundAssociatedShippingFee() {
  const fee = refundableFeeLine()?.shippingFee;
  if (!fee) return "";
  const selected = !!state.refund.shippingSelected;
  const amountValue =
    state.refund.shippingAmount == null
      ? fee.remaining
      : state.refund.shippingAmount;
  const amountError = state.refund.shippingAmountError || "";
  const config = selected
    ? `<div class="refund-item-config refund-ship-config">
        <label class="refund-config-field refund-config-amount">
          <span>Refund amount</span>
          <span class="refund-amount-input-wrap${amountError ? " is-invalid" : ""}">
            <span class="refund-amount-prefix" aria-hidden="true">$</span>
            <input
              type="text"
              inputmode="decimal"
              class="refund-amount-input"
              data-action="refund-shipping-amount"
              value="${Number(amountValue).toFixed(2)}"
              aria-label="Shipping refund amount in dollars"
              aria-invalid="${amountError ? "true" : "false"}"
            />
          </span>
          ${
            amountError
              ? `<span class="refund-field-error">${amountError}</span>`
              : ""
          }
        </label>
        <label class="refund-config-field refund-config-reason">
          <span>Reason</span>
          <select class="select select-compact select-reason" data-action="refund-shipping-reason">
            ${reasonOptionsHtml(state.refund.shippingReason || "Delivery delay")}
          </select>
        </label>
      </div>`
    : "";

  return `
    <div class="refund-fee is-nested ${selected ? "is-selected" : ""}">
      <div class="refund-fee-main">
        <input
          class="checkbox"
          type="checkbox"
          data-action="refund-toggle-shipping"
          ${selected ? "checked" : ""}
          aria-label="Refund ${fee.name}"
        />
        <div class="refund-fee-body">
          <div class="refund-fee-name"><span class="refund-fee-icon" aria-hidden="true">${icons.truck}</span>${fee.name}</div>
          <div class="refund-fee-meta">
            ${money(fee.original)} original · ${money(fee.refunded)} refunded · ${money(fee.remaining)} remaining
          </div>
          ${config}
        </div>
        ${
          selected
            ? ""
            : `<div class="refund-item-amount">${money(fee.remaining)} <span class="refund-amount-suffix">refundable</span></div>`
        }
      </div>
    </div>`;
}

function refundItemRow(ship, pkg, entry) {
  const selectedQty = itemSelectedQty(entry.key);
  const selected = selectedQty > 0;
  const blocked = !entry.refundable;
  const amount = entry.line.price * (selected ? selectedQty : entry.maxQty);
  const associatedFee = lineHostsShippingFee(ship, pkg, entry.line.id)
    ? refundAssociatedShippingFee()
    : "";
  const config = selected
    ? `<div class="refund-item-config">
        ${itemQtyControlsHtml(entry.key, entry.maxQty, selectedQty)}
        ${itemReasonControlsHtml(entry.key)}
      </div>`
    : "";

  return `
    <div class="refund-item ${blocked ? "is-blocked" : ""}${selected ? " is-selected" : ""}${associatedFee ? " has-associated-fee" : ""}">
      <div class="refund-item-main">
        ${
          blocked
            ? `<span class="refund-check-spacer" aria-hidden="true"></span>`
            : `<input
                class="checkbox"
                type="checkbox"
                data-action="refund-toggle-item"
                data-key="${entry.key}"
                data-max="${entry.maxQty}"
                ${selected ? "checked" : ""}
                aria-label="Select ${entry.line.name}"
              />`
        }
        <div class="item-cell">
          ${productThumbHtml(entry.line)}
          <div class="pkg-item-body">
            <div class="item-name">${entry.line.name} <span class="item-qty-inline">×${entry.maxQty}</span></div>
            <div class="item-meta-line">SKU ${entry.line.sku} · ${money(entry.line.price)} each</div>
            ${blocked ? `<div class="refund-not-refundable">Not available for refund in Guide</div>` : ""}
            ${config}
          </div>
        </div>
        <div class="refund-item-amount">${money(amount)}</div>
      </div>
      ${associatedFee}
    </div>`;
}

function refundPackageContents(ship, pkg) {
  return refundEligibleInPackage(pkg)
    .map((entry) => refundItemRow(ship, pkg, entry))
    .join("");
}

/** Package container always; header only when shipment has 2+ packages. */
function refundPackageBlock(ship, pkg, packageTotal) {
  const tri = packageSelectionState(ship, pkg);
  const selectable = packageHasSelectable(ship, pkg);
  const showHeader = packageTotal > 1;
  const title = packageHeadingText(pkg, packageTotal);

  const head = showHeader
    ? `<div class="package-label refund-pkg-head">
        ${checkboxTriHtml({
          action: "refund-toggle-pkg",
          attrs: `data-ship="${ship.id}" data-pkg="${pkg.id}"`,
          state: tri,
          label: `Select ${title}`,
          hideWhenEmpty: true,
          disabled: !selectable,
        })}
        <span class="package-title">${title}</span>
      </div>`
    : "";

  return `
    <div class="package-group refund-pkg${!showHeader ? " is-headerless" : ""}${!selectable ? " is-inert" : ""}">
      ${head}
      <div class="package-items refund-pkg-items">
        ${refundPackageContents(ship, pkg)}
      </div>
    </div>`;
}

function refundShipmentBlock(ship, seller) {
  const display = displayShipmentStatus(ship, seller, shippitByTracking);
  const pkgTotal = ship.packages.length;
  const tri = shipmentSelectionState(ship);
  const hasEligible = shipmentHasSelectable(ship);

  /** Every shipment renders package containers; headers only when multi-package. */
  const body = `<div class="refund-ship-body package-stack refund-pkg-stack">
      ${ship.packages
        .map((pkg) => refundPackageBlock(ship, pkg, pkgTotal))
        .join("")}
    </div>`;

  return `
    <div class="shipment-block shipment-block-refund${!hasEligible ? " is-inert" : ""}">
      <div class="refund-ship-head">
        <div class="refund-ship-title-row">
          ${checkboxTriHtml({
            action: "refund-toggle-ship",
            attrs: `data-ship="${ship.id}"`,
            state: tri,
            label: `Select ${ship.label}`,
            hideWhenEmpty: true,
            disabled: !hasEligible,
          })}
          <h3>${ship.label}</h3>
          ${statusBadge(display.label)}
        </div>
      </div>
      <div class="refund-ship-meta">
        ${storeMeta(ship, seller)}
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>${serviceLabel(ship.shippingMethod)}</span>
      </div>
      ${body}
    </div>`;
}

/**
 * Shared package anatomy for Track (and detail shipment views).
 * Package container always; Package X of Y header only when 2+.
 */
function packageBlock(
  pkg,
  packageTotal,
  {
    shipmentStatus = null,
    hideTrackLink = false,
  } = {}
) {
  const showPkgStatus = !sameStatus(pkg.status, shipmentStatus);
  const items = packageItemsHtml(pkg, shipmentStatus);
  const showHeader = packageTotal > 1;

  const head = showHeader
    ? `<div class="package-label">
        <span class="package-title">${packageHeadingText(pkg, packageTotal)}</span>
        ${showPkgStatus ? statusBadge(pkg.status) : ""}
        ${
          !hideTrackLink && pkg.tracking
            ? `<a class="pkg-track-link" href="#" onclick="return false">Track ${pkg.tracking}</a>`
            : ""
        }
      </div>`
    : "";

  return `
    <div class="package-group${!showHeader ? " is-headerless" : ""}">
      ${head}
      <div class="package-items">${items}</div>
    </div>`;
}

function serviceLabel(method) {
  if (!method) return "";
  const m = method.toLowerCase();
  if (m.includes("delivery") || m.includes("collect")) return method;
  return `${method} delivery`;
}

function storeMeta(ship, seller = null) {
  if (ship.storeLabel) {
    return `<span class="ship-store">${icons.store} ${ship.storeLabel}</span>`;
  }
  if (ship.store === "MP") {
    return `<span class="ship-store">${icons.store} Marketplace</span>`;
  }
  const store = resolveCollectionStore(seller, ship);
  if (store?.name || store?.id) {
    return `<span class="ship-store">${icons.store} ${collectionStoreCompactLabel(store)}</span>`;
  }
  if (ship.store) {
    return `<a class="ship-store" href="#" onclick="return false">${icons.store} Store ${ship.store}</a>`;
  }
  return "";
}

function formatLastMileWhen(timestamp) {
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t)) return "—";
  const now = new Date(PROTO_NOW_MS);
  const d = new Date(t);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEvent = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfToday - startOfEvent) / 86400000);
  const time = d.toLocaleString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  return formatEventWhenShort(timestamp);
}

/** Latest: when · owner (+ tracking). Earlier: status label + when · owner. */
function eventRow(ev, { latest = false, tracking = null } = {}) {
  const mapped = mapShippitStatus(ev.rawStatus);
  const whenOwner = `${formatLastMileWhen(ev.timestamp)} · ${ev.statusOwner || "—"}`;

  if (latest) {
    return `
      <li class="track-event is-latest">
        <span class="track-event-dot" aria-hidden="true"></span>
        <div>
          <div class="track-event-when">${whenOwner}</div>
          ${
            tracking
              ? `<div class="track-event-tracking"><span>Tracking ${tracking}</span>${copyControl(tracking, "tracking number")}</div>`
              : ""
          }
        </div>
      </li>`;
  }

  return `
    <li class="track-event">
      <span class="track-event-dot" aria-hidden="true"></span>
      <div>
        <div class="track-event-label">${mapped.label}</div>
        <div class="track-event-meta">${whenOwner}</div>
      </div>
    </li>`;
}

/** Persistent shipment carrier (who is delivering) — not a link; distinct from event status_owner. */
function carrierIdentityHtml(carrier) {
  if (!carrier) return "";
  return `
    <div class="ship-carrier-identity" aria-label="Carrier ${carrier.name}">
      <img class="ship-carrier-logo" src="${carrier.logo}" alt="" width="24" height="24" />
      <span class="ship-carrier-name">${carrier.name}</span>
    </div>`;
}

function carrierIdentity(shippit) {
  return carrierIdentityHtml(carriers[shippit?.carrierId]);
}

/**
 * Tracking capability for a shipment — not seller-kind.
 * enhanced → usable Shippit last-mile
 * standard → carrier + tracking reference (optional carrier URL)
 * fulfilment → OMS status only
 */
function shipmentTrackingCapability(ship) {
  const tracking = trackingNumbersForShipment(ship)[0] || null;
  const shippit = tracking ? shippitByTracking[tracking] : null;
  const enhancedOk =
    !!(shippit && !shippit.requestFailed && shippit.rawStatus) &&
    shippit.rawStatus !== "untrackable";

  if (enhancedOk) {
    return {
      mode: "enhanced",
      tracking,
      shippit,
      carrier: carriers[shippit.carrierId] || null,
      trackingUrl: shippit.trackingUrl || null,
    };
  }

  const carrierId = ship.carrierId || shippit?.carrierId || null;
  const carrier = carrierId ? carriers[carrierId] || null : null;
  const trackingUrl = ship.carrierTrackingUrl || null;

  if (tracking && (carrier || trackingUrl)) {
    return {
      mode: "standard",
      tracking,
      shippit: null,
      carrier,
      trackingUrl,
    };
  }

  return {
    mode: "fulfilment",
    tracking,
    shippit: null,
    carrier,
    trackingUrl: null,
  };
}

/**
 * Temporal context from OMS fulfilment — shipment clock (not destination SLA).
 * Shipped → business days since ship + date.
 * Delivered → Delivered · date only when OMS itself recorded delivery (not inferred from carrier).
 * No useful timestamp → omit.
 * Used by both standard tracking and enhanced carrier evidence.
 */
function standardAgeBlock(ship) {
  const status = String(ship.status || "").toLowerCase();
  const omsDelivered =
    status.includes("deliver") &&
    !status.includes("out for") &&
    !status.includes("attempt");

  /** Only when fulfilment systems recorded delivery — never from carrier-link inference. */
  if (omsDelivered && ship.deliveredAt) {
    const ts = Date.parse(ship.deliveredAt);
    if (!Number.isFinite(ts)) return "";
    const dateLabel = new Date(ts).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `<div class="std-track-age">Delivered · ${dateLabel}</div>`;
  }

  const iso = ship.shippedAt || null;
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";

  const dateLabel = new Date(ts).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const days = elapsedBusinessDays(ts, PROTO_NOW_MS);
  const primaryText =
    days === 0
      ? "Shipped today"
      : days === 1
        ? "1 business day since shipped"
        : `${days} business days since shipped`;

  return `
    <div class="std-track-age">
      ${primaryText}<span class="std-track-age-sep" aria-hidden="true"> · </span><span class="std-track-age-date">Shipped ${dateLabel}</span>
    </div>`;
}

/**
 * Standard carrier tracking — compact carrier identity + reference + temporal context.
 * Used when enhanced Shippit last-mile data is unavailable (Target, Marketplace, etc.).
 * OMS status stays on the shipment header; no hero heading, journey, or SLA.
 */
function standardTrackingPanel(ship, cap) {
  const carrier = cap.carrier;
  const tracking = cap.tracking;
  const hasUrl = !!cap.trackingUrl;
  const age = standardAgeBlock(ship);

  const trackingRef = tracking
    ? `<div class="std-track-ref"><span>Tracking <span class="std-track-number">${tracking}</span></span>${copyControl(tracking, "tracking number")}</div>`
    : "";

  const cta = hasUrl
    ? `<a
        class="btn btn-md btn-primary btn-track-parcel"
        href="${cap.trackingUrl}"
        target="_blank"
        rel="noopener noreferrer"
        data-action="open-carrier-track"
        data-carrier="${carrier?.id || ""}"
        data-tracking="${tracking || ""}"
        title="${carrier ? `Opens ${carrier.name} tracking` : "Opens carrier tracking"}"
      >Track parcel ↗</a>`
    : "";

  return `
    <div class="ship-track-enhance ship-track-standard" data-component="standard-carrier-tracking">
      <div class="std-track-row">
        ${carrierIdentityHtml(carrier)}
        ${cta}
      </div>
      ${trackingRef}
      ${age}
    </div>`;
}

/**
 * Track lens body by capability:
 * enhanced → Shippit last-mile + assessment
 * standard → OMS + carrier tracking
 * collection → Click & Collect context (no parcel tracking)
 * fulfilment → nothing extra (packages only)
 */
function shipmentTrackPanel(ship, seller, display) {
  const cap = shipmentTrackingCapability(ship);

  if (cap.mode === "enhanced") {
    const shippit = cap.shippit;
    const tracking = cap.tracking;
    const mapped = display.mapped || mapShippitStatus(shippit.rawStatus);
    const sla = assessSla(ship, shippit, mapped, { now: PROTO_NOW_MS });
    return `
      <div class="ship-track-enhance">
        ${carrierEvidence(ship, shippit, mapped, tracking, sla)}
        ${trackExceptionPanel(mapped, { shippit, tracking })}
        ${
          mapped?.kind !== "exception" && mapped?.kind !== "terminal"
            ? trackSlaPanel(sla, mapped, ship)
            : ""
        }
      </div>`;
  }

  if (cap.mode === "standard") {
    return standardTrackingPanel(ship, cap);
  }

  if (isClickCollectFulfilment(seller, ship)) {
    return collectionContextPanel(ship, seller, display);
  }

  return "";
}

function isClickCollectFulfilment(seller, ship) {
  return (
    fulfilmentKind(seller?.delivery) === "CNC" ||
    fulfilmentKind(ship?.shippingMethod) === "CNC"
  );
}

/**
 * CNC collection context — status, store (name + id), then collect-by countdown.
 * Countdown uses fulfilment-provided collectBy; ready date is not the primary cue.
 */
function collectionContextPanel(ship, seller, display) {
  const store = resolveCollectionStore(seller, ship);
  const statusLabel = display?.label || ship.status || "Ready for collection";
  const primary = collectionStorePrimaryName(store);
  const storeLine = store
    ? store.name && store.id
      ? `Collect from <strong>${store.name}</strong> · Store ${store.id}`
      : `Collect from <strong>${primary}</strong>`
    : "Click &amp; Collect";
  const window = collectionWindowAssessment(ship);
  const windowHtml = window
    ? `<div class="collection-context-window is-${window.tone}">${window.line}</div>`
    : "";

  return `
    <div class="ship-track-enhance ship-track-collection is-${window?.tone || "ok"}" data-component="collection-context">
      <div class="collection-context-row">
        <span class="collection-context-icon" aria-hidden="true">${icons.store}</span>
        <div class="collection-context-body">
          <div class="collection-context-title">${statusLabel}</div>
          <div class="collection-context-meta">${storeLine}</div>
          ${windowHtml}
        </div>
      </div>
    </div>`;
}

function shipmentHasTrackPanel(ship) {
  const mode = shipmentTrackingCapability(ship).mode;
  if (mode === "enhanced" || mode === "standard") return true;
  /** CNC collection context is also a Track panel. */
  for (const seller of sellers) {
    if (seller.shipments.some((s) => s.id === ship.id)) {
      return isClickCollectFulfilment(seller, ship);
    }
  }
  return false;
}

function shipmentCarrierName(ship) {
  const cap = shipmentTrackingCapability(ship);
  if (cap.carrier?.name) return cap.carrier.name;
  const tracking = trackingNumbersForShipment(ship)[0];
  const shippit = tracking ? shippitByTracking[tracking] : null;
  return carriers[shippit?.carrierId]?.name || null;
}

/**
 * Unlabeled journey cue — relative progress only.
 * Tone comes only from Guide assessSla (outside / investigate), never from a
 * carrier/Shippit “delayed” status string — so AusPost, Couriers Please, etc. stay coherent.
 * blue = on track · amber = delayed/investigate · green = delivered.
 * Event dots and the expanded shipment border stay primary blue — they are not health cues.
 */
function journeyIndicator(shippit, sla = null) {
  const journey = assessJourney(shippit);
  if (!journey) return "";

  if (journey.mode === "neutral") {
    return `
      <div class="journey is-neutral" role="img" aria-label="Delivery journey interrupted">
        <div class="journey-rail"></div>
      </div>`;
  }

  const pct = Math.round(Math.min(1, Math.max(0, journey.position)) * 100);
  let tone = "on-track";
  let aria = "Relative progress through delivery journey";
  if (journey.delivered) {
    tone = "delivered";
    aria = "Delivery complete";
  } else if (sla?.investigate) {
    tone = "delayed";
    aria = "Relative progress · shipment needs investigation";
  } else if (sla?.outside) {
    tone = "delayed";
    aria = "Relative progress · outside expected delivery timeframe";
  }

  return `
    <div
      class="journey is-progress is-${tone}"
      role="img"
      aria-label="${aria}"
    >
      <div class="journey-rail">
        <div class="journey-fill" style="width:${pct}%"></div>
        <span class="journey-marker" style="left:${pct}%"></span>
      </div>
    </div>`;
}

/**
 * Task-language for the external Shippit link — same tracking_url, different Care job.
 * Delivered CTA lives in the pathway panel (not duplicated here).
 */
function shippitCtaLabel(mapped) {
  if (mapped?.pathway === "delivered" || mapped?.kind === "terminal") {
    return "View proof of delivery";
  }
  if (mapped?.pathway === "attempted") {
    return "View delivery attempt details";
  }
  if (mapped?.kind === "exception") {
    return "View tracking details";
  }
  return "Open in Shippit";
}

function isDeliveredMapped(mapped) {
  return mapped?.pathway === "delivered" || mapped?.kind === "terminal";
}

function shippitExternalLink(shippit, tracking, mapped) {
  if (!shippit?.trackingUrl) return "";
  const label = shippitCtaLabel(mapped);
  return `
    <a
      class="ship-shippit-link"
      href="${shippit.trackingUrl}"
      target="_blank"
      rel="noopener noreferrer"
      data-action="open-shippit"
      data-tracking="${tracking || ""}"
      title="Opens Shippit tracking"
    >${label} ↗</a>`;
}

/**
 * Carrier evidence: status → journey → latest event.
 * Earlier updates expand in place; contextual Shippit CTA sits with the disclosure
 * (except Delivered — POD CTA lives in the pathway panel below).
 */
function carrierEvidence(ship, shippit, mapped, tracking, sla = null) {
  const events = sortEventsByTimestamp(shippit?.events || []);
  const open = !!state.historyOpen[ship.id];
  const [latest, ...earlier] = events;
  const delivered = isDeliveredMapped(mapped);
  const historyToggle = earlier.length
    ? `<button type="button" class="delivery-progress-toggle" data-action="toggle-history" data-ship="${ship.id}" aria-expanded="${open}">
        ${open ? "Hide earlier updates ⌃" : "Show earlier updates ⌄"}
      </button>`
    : "";
  const shippitLink = delivered ? "" : shippitExternalLink(shippit, tracking, mapped);
  const actions =
    historyToggle || shippitLink
      ? `<div class="ship-carrier-actions">
          ${historyToggle || "<span></span>"}
          ${shippitLink}
        </div>`
      : "";

  return `
    <div class="ship-carrier">
      <div class="ship-status-head">
        <div class="ship-status-title">${mapped.label}</div>
        ${carrierIdentity(shippit)}
      </div>
      <p class="ship-status-explain">${mapped.explanation}</p>
      ${journeyIndicator(shippit, sla)}
      ${
        latest
          ? `<ol class="track-event-list">
              ${eventRow(latest, { latest: true, tracking })}
              ${open ? earlier.map((ev) => eventRow(ev)).join("") : ""}
            </ol>`
          : ""
      }
      ${actions}
    </div>`;
}

/** Relative age for Care-facing SLA copy (e.g. "3 hours ago"). */
function formatHoursAgo(hours) {
  if (!Number.isFinite(hours)) return "unknown";
  if (hours < 1) return "less than an hour ago";
  const rounded = Math.round(hours);
  if (rounded === 1) return "1 hour ago";
  if (rounded < 48) return `${rounded} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/**
 * Guide assessment facts: shipment clock + calculated expected window.
 * Destination-level Standard delivery 3–5 lives on the page strip — do not repeat here.
 */
function slaAssessmentFacts(ship, sla) {
  const expected =
    sla?.expectedLabel || formatEventWhenShort(sla?.expectedEnd) || "";
  const iso = ship?.shippedAt || null;
  if (!iso) {
    return expected ? `Expected by ${expected}` : "";
  }
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return expected ? `Expected by ${expected}` : "";
  }
  const days = elapsedBusinessDays(ts, PROTO_NOW_MS);
  const elapsed =
    days === 0
      ? "Shipped today"
      : days === 1
        ? "1 business day since shipped"
        : `${days} business days since shipped`;
  return expected ? `${elapsed} · Expected by ${expected}` : elapsed;
}

/**
 * Guide helper after carrier evidence — interprets promise vs elapsed vs carrier activity.
 * Green = within · Amber delayed = still moving · Amber investigate = stale + overdue.
 * Delivered uses the pathway panel instead (no elapsed clock).
 */
function trackSlaPanel(sla, mapped, ship) {
  if (!sla || !mapped?.calculateDelay) return "";
  if (mapped.kind === "exception" || mapped.kind === "terminal") return "";

  const facts = slaAssessmentFacts(ship, sla);
  const factsLine = facts ? `<p class="track-callout-facts">${facts}</p>` : "";

  if (sla.investigate) {
    return `
      <div class="track-callout track-callout-warn track-callout-decision">
        <div class="track-callout-body">
          <strong>⚠ Shipment needs investigation</strong>
          ${factsLine}
          <p>No meaningful carrier update for more than 48 hours.</p>
        </div>
        <div class="track-actions">
          ${trackCaseActionButtonHtml()}
        </div>
      </div>`;
  }

  if (sla.outside) {
    const updated = formatHoursAgo(sla.hoursSinceMeaningful);
    const action = sla.shippingPaid
      ? `<div class="track-actions">
          <button type="button" class="btn btn-md btn-primary" data-action="refund-shipping">Refund shipping</button>
        </div>`
      : "";
    return `
      <div class="track-callout track-callout-sla track-callout-decision">
        <div class="track-callout-body">
          <strong>⚠ Delivery is delayed</strong>
          ${factsLine}
          <p>Carrier updated ${updated}.</p>
          ${
            sla.shippingPaid
              ? ""
              : `<p class="track-callout-note">Shipping was free on this shipment — acknowledge the delay with the customer.</p>`
          }
        </div>
        ${action}
      </div>`;
  }

  return `
    <div class="track-callout track-callout-ok track-callout-decision">
      <div class="track-callout-body">
        <strong>✓ Within expected delivery timeframe</strong>
        ${factsLine}
      </div>
    </div>`;
}

function trackExceptionPanel(mapped, { shippit = null, tracking = null } = {}) {
  if (!mapped || (mapped.kind !== "exception" && mapped.kind !== "terminal")) return "";
  if (mapped.pathway === "delivered") {
    const podCta = shippit?.trackingUrl
      ? `<a
          class="btn btn-md btn-primary"
          href="${shippit.trackingUrl}"
          target="_blank"
          rel="noopener noreferrer"
          data-action="open-shippit"
          data-tracking="${tracking || ""}"
          title="Opens Shippit tracking"
        >View proof of delivery ↗</a>`
      : "";
    return `
      <div class="track-callout track-callout-pathway track-callout-decision">
        <div class="track-callout-body">
          <strong>Customer says they haven't received it?</strong>
          <p>Check proof of delivery and delivery details before continuing with the delivered-but-not-received process.</p>
        </div>
        <div class="track-actions">
          ${podCta}
        </div>
      </div>`;
  }
  if (mapped.pathway === "lost" || mapped.pathway === "damaged") {
    return `
      <div class="track-callout track-callout-warn track-callout-decision">
        <div class="track-callout-body">
          <strong>${mapped.label}</strong>
          <p>${mapped.explanation}</p>
        </div>
        <div class="track-actions">${trackCaseActionButtonHtml()}</div>
      </div>`;
  }
  if (mapped.kind === "exception") {
    return `
      <div class="track-callout track-callout-warn track-callout-decision">
        <div class="track-callout-body">
          <strong>${mapped.label}</strong>
          <p>${mapped.explanation}</p>
        </div>
      </div>`;
  }
  return "";
}

/**
 * Short Care assessment for collapsed attention rows.
 * Carrier status stays on the badge; this explains why Care should look.
 */
function attentionReasonLabel(signals) {
  if (!signals?.attention) return "";
  if (signals.collectionWindow?.tone === "ended") return "Collection window ended";
  if (
    signals.collectionWindow?.tone === "approaching" ||
    signals.collectionWindow?.tone === "urgent"
  ) {
    return signals.collectionWindow.line;
  }
  if (signals.sla?.investigate) return "Needs investigation";
  if (signals.sla?.outside) return "Delivery delayed";
  if (signals.exception && signals.mapped?.label) return signals.mapped.label;
  return "Needs attention";
}

/** Per-shipment cues for Track progressive disclosure (not expand decisions). */
function shipmentTrackSignals(ship, seller) {
  const display = displayShipmentStatus(ship, seller, shippitByTracking);
  const mapped = display.mapped;
  const label = statusPhrase(display.label);
  const tracking = trackingNumbersForShipment(ship)[0];
  const shippit = tracking ? shippitByTracking[tracking] : null;
  const sla =
    shippit && mapped && !shippit.requestFailed
      ? assessSla(ship, shippit, mapped, { now: PROTO_NOW_MS })
      : null;
  const collectionWindow = isClickCollectFulfilment(seller, ship)
    ? collectionWindowAssessment(ship)
    : null;

  const exception = mapped?.kind === "exception";
  const delayed = !!(sla?.outside || sla?.investigate);
  const collectionUrgent =
    collectionWindow?.tone === "approaching" ||
    collectionWindow?.tone === "urgent" ||
    collectionWindow?.tone === "ended";
  const outForDelivery = label.includes("out for");
  const delivered =
    mapped?.kind === "terminal" ||
    (label.includes("deliver") &&
      !outForDelivery &&
      !label.includes("attempt") &&
      !label.includes("unsuccessful"));
  /** Still moving — not delivered and not a hard unavailable blank. */
  const active =
    !delivered &&
    mapped?.kind !== "unavailable" &&
    (mapped?.kind === "progress" ||
      mapped?.kind === "label" ||
      mapped?.kind === "exception" ||
      mapped?.kind === "unknown" ||
      outForDelivery ||
      !!ship.status ||
      !!collectionWindow);

  const attention = exception || delayed || collectionUrgent;
  const signals = {
    display,
    mapped,
    sla,
    collectionWindow,
    exception,
    attention,
    delivered,
    outForDelivery,
    active,
  };
  signals.attentionReason = attentionReasonLabel(signals);
  return signals;
}

/**
 * Exactly one focus shipment per seller (or none).
 * 1) sole shipment → that one
 * 2) attention (investigate > delayed/exception) → that one
 * 3) active undelivered → prefer out-for-delivery, else first active
 * 4) all delivered / nothing actionable → none
 */
function defaultFocusShipmentId(seller) {
  const ships = seller.shipments || [];
  if (ships.length === 0) return null;
  if (ships.length === 1) return ships[0].id;

  const ranked = ships.map((ship, index) => {
    const s = shipmentTrackSignals(ship, seller);
    let score = 0;
    if (s.sla?.investigate || (s.exception && !s.sla?.outside)) score = 110;
    else if (s.attention) score = 100;
    else if (s.outForDelivery) score = 80;
    else if (s.active && !s.delivered) score = 60;
    return { id: ship.id, score, index };
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = ranked[0];
  return best && best.score > 0 ? best.id : null;
}

function isShipmentExpanded(ship, seller) {
  /** Sole fulfilment — always show the journey; seller-level collapse still applies. */
  if ((seller.shipments || []).length === 1) return true;
  if (Object.prototype.hasOwnProperty.call(state.shipmentOpen, ship.id)) {
    return !!state.shipmentOpen[ship.id];
  }
  return ship.id === defaultFocusShipmentId(seller);
}

function sellerHasAttention(seller) {
  return seller.shipments.some(
    (ship) => shipmentTrackSignals(ship, seller).attention
  );
}

function sellerCollapseDefault(seller, { trackMode = false } = {}) {
  if (!trackMode) return false;
  /** Track keeps sellers open — shipment focus handles density; agent may collapse manually. */
  return false;
}

function isSellerCollapsed(seller, { collapsible = false, trackMode = false } = {}) {
  if (!collapsible) return false;
  if (Object.prototype.hasOwnProperty.call(state.sellerCollapsed, seller.id)) {
    return !!state.sellerCollapsed[seller.id];
  }
  return sellerCollapseDefault(seller, { trackMode });
}

function shipmentBlock(
  ship,
  seller,
  { refundMode = false, trackMode = false } = {}
) {
  if (refundMode) {
    return refundShipmentBlock(ship, seller);
  }

  const pkgTotal = ship.packages.length;
  const display = displayShipmentStatus(ship, seller, shippitByTracking);
  const trackCap = trackMode ? shipmentTrackingCapability(ship) : null;
  const trackPanel =
    trackMode &&
    (trackCap.mode === "enhanced" ||
      trackCap.mode === "standard" ||
      isClickCollectFulfilment(seller, ship));
  const carrierName = shipmentCarrierName(ship);
  /** Standard expanded: carrier lives in the compact tracking row — not duplicated in meta. */
  const showCarrierInMeta =
    !(trackMode && trackCap?.mode === "standard" && isShipmentExpanded(ship, seller));

  const packagesHtml = `
    <div class="package-stack">
      ${ship.packages
        .map((pkg) =>
          packageBlock(pkg, pkgTotal, {
            shipmentStatus: ship.status,
            hideTrackLink: trackMode,
          })
        )
        .join("")}
    </div>`;

  if (!trackMode) {
    return `
      <div class="shipment-block">
        <div class="ship-head">
          <div class="ship-title-row">
            <h3>${ship.label}</h3>
            ${statusBadge(display.label)}
          </div>
          <div class="ship-meta">
            ${storeMeta(ship, seller)}
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>${serviceLabel(ship.shippingMethod)}</span>
          </div>
        </div>
        ${packagesHtml}
      </div>`;
  }

  const expanded = isShipmentExpanded(ship, seller);
  const signals = shipmentTrackSignals(ship, seller);
  const soleShipment = seller.shipments.length === 1;
  const collapsible = !soleShipment;
  const chevron = collapsible ? (expanded ? "⌃" : "⌄") : "";
  /** Enhanced owns the status hero; standard keeps the header badge. */
  const hideHeaderStatus = expanded && trackCap?.mode === "enhanced";

  const headerInner = `
      <div class="ship-header-top">
        <div class="ship-header-main">
          <div class="ship-title-row">
            <h3>${ship.label}</h3>
            ${hideHeaderStatus ? "" : statusBadge(display.label)}
          </div>
          <div class="ship-meta">
            ${storeMeta(ship, seller)}
            <span class="meta-sep" aria-hidden="true">·</span>
            <span>${serviceLabel(ship.shippingMethod)}</span>
            ${
              showCarrierInMeta && carrierName
                ? `<span class="meta-sep" aria-hidden="true">·</span><span>${carrierName}</span>`
                : ""
            }
          </div>
        </div>
        <div class="ship-header-controls">
          ${
            !expanded && signals.attentionReason
              ? shipAttentionAssessment(signals.attentionReason)
              : ""
          }
          ${expanded ? "" : packageCountIcon(pkgTotal)}
          ${
            collapsible
              ? `<span class="ship-chevron" aria-hidden="true">${chevron}</span>`
              : ""
          }
        </div>
      </div>
      ${expanded ? "" : shipmentProductStrip(ship)}`;

  /** Sole shipment: static summary — no accordion chrome; seller collapse still available. */
  const headerBand = collapsible
    ? `<button
      type="button"
      class="ship-header-band"
      data-action="toggle-shipment"
      data-ship="${ship.id}"
      aria-expanded="${expanded ? "true" : "false"}"
    >${headerInner}</button>`
    : `<div class="ship-header-band is-static">${headerInner}</div>`;

  return `
    <div class="shipment-block ${expanded ? "is-expanded" : "is-collapsed"}${signals.attention ? " has-attention" : ""}">
      ${headerBand}
      ${
        expanded
          ? `<div class="ship-expanded-body">
              ${trackPanel ? shipmentTrackPanel(ship, seller, display) : ""}
              ${packagesHtml}
            </div>`
          : ""
      }
    </div>`;
}

function sellerBlock(
  seller,
  { refundMode = false, trackMode = false, collapsible = false } = {}
) {
  /** Target / Marketplace — Mirakl handoff, not Guide selection. */
  if (refundMode && sellerRefundsInMirakl(seller)) {
    return refundMiraklSellerBlock(seller);
  }

  const shipCount = seller.shipments.length;
  const itemTotal = seller.itemCount;
  const kindChip =
    seller.kind === "marketplace"
      ? `<span class="seller-kind-chip">Marketplace</span>`
      : "";
  const detailMode = !refundMode && !trackMode;
  const collapsed = isSellerCollapsed(seller, { collapsible, trackMode });
  const attention = trackMode && sellerHasAttention(seller);
  const collectionStore = resolveCollectionStore(
    seller,
    seller.shipments[0] || null
  );
  const storeBit = collectionStore
    ? ` · ${collectionStoreCompactLabel(collectionStore)}`
    : "";

  const meta = detailMode
    ? `${itemTotal} unit${itemTotal === 1 ? "" : "s"} · ${money(seller.merchandiseTotal)} · ${fulfilmentLabel(seller.delivery)}${storeBit}`
    : trackMode
      ? `${itemTotal} unit${itemTotal === 1 ? "" : "s"} · ${fulfilmentLabel(seller.delivery)}${storeBit} · ${shipCount} ${
          fulfilmentKind(seller.delivery) === "CNC"
            ? `collection${shipCount === 1 ? "" : "s"}`
            : `shipment${shipCount === 1 ? "" : "s"}`
        }`
      : `${itemTotal} unit${itemTotal === 1 ? "" : "s"} · ${shipCount} shipment${shipCount === 1 ? "" : "s"}`;

  const body = detailMode
    ? aggregatedItemsList(seller)
    : seller.shipments
        .map((ship) =>
          shipmentBlock(ship, seller, {
            refundMode,
            trackMode,
          })
        )
        .join("");

  const headInner = `
    <div class="seller-head-main">
      <div class="seller-title-row-inline">
        <div class="seller-title">${seller.name}</div>
        ${kindChip}
        ${
          attention && collapsed
            ? `<span class="seller-attention" title="Needs attention">Needs attention</span>`
            : ""
        }
      </div>
      <div class="seller-meta">${meta}</div>
    </div>
    ${
      collapsible
        ? `<span class="seller-chevron" aria-hidden="true">${collapsed ? "⌄" : "⌃"}</span>`
        : ""
    }`;

  const head = collapsible
    ? `<button
        type="button"
        class="seller-head seller-toggle"
        data-action="toggle-seller"
        data-seller="${seller.id}"
        aria-expanded="${collapsed ? "false" : "true"}"
      >${headInner}</button>`
    : `<div class="seller-head">${headInner}</div>`;

  return `
    <section class="card seller-card${detailMode ? " seller-card-detail" : ""}${trackMode ? " seller-card-track" : ""}${refundMode ? " seller-card-refund" : ""}${collapsed ? " is-collapsed" : ""}${attention ? " has-attention" : ""}">
      ${head}
      ${collapsed ? "" : `<div class="seller-body">${body}</div>`}
    </section>`;
}

function sellersSection({
  refundMode = false,
  trackMode = false,
  collapsible = false,
} = {}) {
  return sellers
    .map((s) => sellerBlock(s, { refundMode, trackMode, collapsible }))
    .join("");
}

function totals({ refundMode = false } = {}) {
  if (refundMode) {
    const { amount, units, charges, rows } = refundSelectionSummary();
    if (!units && !charges) {
      return `
        <section class="card totals refund-review is-empty">
          <h2 class="totals-heading">Review refund</h2>
          <p class="help">Select a shipment, package, item, or shipping charge to configure a refund.</p>
        </section>`;
    }
    return `
      <section class="card totals refund-review">
        <h2 class="totals-heading">Review refund</h2>
        <ul class="refund-review-list">
          ${rows
            .map(
              (r) => `
            <li>
              <div class="refund-review-main">
                <span class="refund-review-label">${r.label}</span>
                <span class="refund-review-amount">${money(r.amount)}</span>
              </div>
              <div class="refund-review-reason">${r.reason}</div>
            </li>`
            )
            .join("")}
        </ul>
        <div class="totals-row grand"><span>Refund total</span><span>${money(amount)}</span></div>
      </section>`;
  }

  const refunded = totalRefundedAmount();
  const orderTotal = Number(order.orderTotalDisplay) || Number(order.total) || 0;
  const netTotal = Math.max(0, orderTotal - refunded);
  const refundBlock =
    refunded > 0
      ? `
      <div class="totals-row totals-original"><span>Original order total</span><span>${money(orderTotal)}</span></div>
      <div class="totals-row totals-refunded"><span>Refunded</span><span>−${money(refunded)}</span></div>
      <div class="totals-row grand"><span>Remaining order value</span><span>${money(netTotal)}</span></div>`
      : `<div class="totals-row grand"><span>Order total</span><span>${money(orderTotal)}</span></div>`;

  return `
    <section class="card totals">
      <h2 class="totals-heading">Order summary</h2>
      <div class="totals-row"><span>Subtotal (${order.items} units)</span><span>${money(order.merchandiseSubtotal)}</span></div>
      <div class="totals-row"><span>${icons.truck} Shipping</span><span>${money(order.shipping)}</span></div>
      ${refundBlock}
    </section>`;
}

/** Read-only refund history — amount, when recorded, type/reason, item if known. */
function refundHistorySection() {
  const events = [...(refundHistory || [])].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
  );
  if (!events.length) return "";

  const headline = totalRefundedAmount();
  const rows = events
    .map((ev) => {
      const line = ev.lineId ? lines[ev.lineId] : null;
      const product =
        line && ev.type === "Item"
          ? `<div class="refund-item">${line.name}${ev.qty ? ` ×${ev.qty}` : ""}</div>`
          : "";
      return `
        <tr>
          <td class="refund-when">${formatEventWhen(ev.timestamp)}</td>
          <td class="refund-amount">${money(ev.amount)}</td>
          <td class="refund-reason">
            <div class="refund-type-reason">${ev.type} · ${ev.reason}</div>
            ${product}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <section
      class="card refund-history"
      id="refund-history"
      tabindex="-1"
      aria-label="Refund history"
    >
      <div class="refund-history-head">
        <h2>Refund history</h2>
        <span class="refund-history-total">${money(headline)} refunded</span>
      </div>
      <div class="table-wrap">
        <table class="refund-table">
          <thead>
            <tr>
              <th>Date &amp; time</th>
              <th>Refund</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderDetail() {
  return `
    ${hero({ showActionsMenu: true })}
    ${workspace(
      `
      ${sellersSection({ refundMode: false, collapsible: true })}
      ${totals()}
      ${refundHistorySection()}
      ${orderActionsPanel()}
    `,
      { showRail: true }
    )}`;
}

/**
 * Order search — one card, two mutually exclusive paths (order number OR customer details).
 * Scope: Kmart Australia only. NZ has a DOM escape hatch; never infer NZ from empty AU results.
 */
function renderOrderSearch() {
  const s = state.search;
  const ranges = [
    ["week", "Last week"],
    ["month", "Last month"],
    ["quarter", "Last 3 months"],
    ["custom", "Custom"],
  ];
  const orderReady = canSearchByOrder(s);
  const customerReady = canSearchByCustomer(s);
  const tip = state.searchTipDismissed
    ? ""
    : `
    <div class="search-tip" role="status">
      <span class="search-tip-icon" aria-hidden="true">${icons.info}</span>
      <div class="search-tip-body">
        <strong>Search is now simpler</strong>
        <p>You can search using an order number or customer details — you don't need both.</p>
      </div>
      <button type="button" class="search-tip-dismiss" data-action="dismiss-search-tip" aria-label="Dismiss">
        ${icons.close}
      </button>
    </div>`;

  const customDates =
    s.dateRange === "custom"
      ? `
      <div class="search-custom-dates">
        <div class="search-field">
          <label for="search-from">From</label>
          <input id="search-from" class="text-input" type="date" data-search-field="customFrom" value="${s.customFrom}" />
        </div>
        <div class="search-field">
          <label for="search-to">To</label>
          <input id="search-to" class="text-input" type="date" data-search-field="customTo" value="${s.customTo}" />
        </div>
      </div>`
      : "";

  const nzError =
    state.searchError?.type === "nz-order"
      ? `
    <div class="search-nz-error" role="alert">
      <strong>This order may be a Kmart New Zealand order</strong>
      <p>NZ orders can't be searched in Ecommerce Guide.</p>
      <a
        class="search-nz-link"
        href="#"
        data-action="open-dom-nz"
      >Search NZ orders in DOM ↗</a>
    </div>`
      : "";

  return `
    <section class="search-page">
      <header class="search-page-head">
        <h1>Order search</h1>
        <p class="search-page-lead">Search using an order number or customer details.</p>
      </header>
      ${tip}
      <div class="card card-pad search-card">
        ${brandScopeControl()}
        <form class="search-path" data-search-path="order" autocomplete="off">
          <h2 class="search-section-label">Order number</h2>
          <div class="search-action-row">
            <label class="visually-hidden" for="search-order-number">Order number</label>
            <input
              id="search-order-number"
              class="text-input"
              type="text"
              name="orderNumber"
              data-search-field="orderNumber"
              placeholder="Enter order number"
              value="${s.orderNumber.replace(/"/g, "&quot;")}"
              inputmode="numeric"
            />
            <button type="submit" class="btn btn-md btn-primary" ${orderReady ? "" : "disabled"}>Search</button>
          </div>
        </form>

        <div class="search-or" role="separator" aria-label="Or">
          <span class="search-or-line" aria-hidden="true"></span>
          <span class="search-or-label">OR</span>
          <span class="search-or-line" aria-hidden="true"></span>
        </div>

        <form class="search-path" data-search-path="customer" autocomplete="off">
          <h2 class="search-section-label">Customer details</h2>
          <div class="search-action-row">
            <label class="visually-hidden" for="search-customer">Phone, email or customer name</label>
            <input
              id="search-customer"
              class="text-input"
              type="text"
              name="customerQuery"
              data-search-field="customerQuery"
              placeholder="Phone, email or customer name"
              value="${s.customerQuery.replace(/"/g, "&quot;")}"
            />
            <button type="submit" class="btn btn-md btn-primary" ${customerReady ? "" : "disabled"}>Search orders</button>
          </div>
          <div class="search-date-block">
            <div class="search-section-label" id="order-date-label">Order date</div>
            <div class="search-date-chips" role="group" aria-labelledby="order-date-label">
              ${ranges
                .map(
                  ([id, label]) => `
                <button
                  type="button"
                  class="search-chip${s.dateRange === id ? " is-selected" : ""}"
                  data-action="search-date-range"
                  data-range="${id}"
                  aria-pressed="${s.dateRange === id ? "true" : "false"}"
                >${label}</button>`
                )
                .join("")}
            </div>
            ${customDates}
          </div>
        </form>
        ${nzError}
      </div>
      <p class="search-nz-escape">
        Looking for a Kmart New Zealand order?
        <a href="#" data-action="open-dom-nz">Search in DOM ↗</a>
      </p>
    </section>`;
}

function renderTrack() {
  return `
    ${hero({ showActionsMenu: true })}
    ${workspace(`
      ${deliveryDestinationStrip()}
      ${sellersSection({ trackMode: true, collapsible: true })}
      ${totals()}
      ${orderActionsPanel()}
    `)}`;
}

function renderRefund() {
  const summary = refundSelectionSummary();
  const shippingOk =
    !state.refund.shippingSelected || !state.refund.shippingAmountError;
  const canSubmit =
    shippingOk && (summary.units > 0 || summary.charges > 0);
  return `
    ${workflowHead({
      title: `Refund order ${order.id}`,
      actionLabel: "refund",
    })}
    ${workspace(`
      <section class="card card-pad refund-build">
        <div class="select-head select-head-inline">
          <div>
            <h2>Select what to refund</h2>
            <p class="help">Select a shipment or package to refund eligible contents together, or select individual items and charges.</p>
          </div>
          <div class="pill-count">${selectionCountLabel(summary)}</div>
        </div>
        <div class="refund-default-reason">
          <label for="refund-default-reason">
            Apply reason to all items
            <span class="optional-tag">Optional</span>
          </label>
          <select id="refund-default-reason" class="select select-reason-default" data-action="refund-default-reason">
            ${reasonOptionsHtml(state.refund.defaultReason, { includeBlank: true })}
          </select>
          <p class="help">Prefills selected merchandise; individual reasons can be changed.</p>
        </div>
      </section>

      ${sellersSection({ refundMode: true })}
      ${totals({ refundMode: true })}
      <div class="actions">
        <button class="btn btn-primary" data-action="submit" ${!canSubmit ? "disabled" : ""}>Process refund</button>
        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
      </div>
    `)}`;
}

function appShell() {
  return `
    <header class="app-shell" aria-label="Ecommerce Guide">
      <div class="app-brand">
        <img
          class="app-brand-logo"
          src="./assets/brand/kmart-logo.png"
          alt="Kmart"
          width="88"
          height="26"
        />
        <span class="app-brand-name">Ecommerce Guide</span>
      </div>
      <div class="agent">${agent.name}</div>
    </header>`;
}

function render() {
  const root = document.getElementById("root");
  if (!root) return;

  try {
    const isSearch = state.view === "search";
    const isHistory = state.view === "history";
    const mainClass = isSearch
      ? "app-main app-main-search"
      : isHistory
        ? "app-main app-main-history"
        : "app-main";
    const body =
      state.view === "search"
        ? renderOrderSearch()
        : state.view === "history"
          ? renderOrderHistory()
          : state.view === "detail"
            ? renderDetail()
            : state.view === "track"
              ? renderTrack()
              : state.view === "cancel"
                ? renderCancel()
                : renderRefund();

    root.innerHTML = `
    <div class="app">
      <div class="proto-bar">
        <div>
          <strong>Team Member order shell — Order search</strong>
          <p>Search = find order. Order detail / Track shipments = views. Refund · Cancel · Create case = actions.</p>
        </div>
      </div>
      ${appShell()}
      <div class="top">
        <div class="crumbs">${crumbs()}</div>
      </div>
      <div class="${mainClass}">
        ${
          isSearch || isHistory
            ? ""
            : `<div class="workspace-chrome">
                ${viewNav()}
              </div>`
        }
        ${body}
      </div>
    </div>
    ${customerContextDrawer()}
    ${leaveConfirmDialog()}
    ${unlinkConfirmDialog()}
    <div class="toast" id="toast">Copied</div>
  `;
    syncIndeterminateCheckboxes(root);
    flushPendingScroll();
    if (state.customerDrawer) {
      requestAnimationFrame(() => {
        root.querySelector(".customer-drawer-close")?.focus();
      });
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="app" style="padding:24px;font-family:system-ui,sans-serif">
      <h1 style="color:#dd182c">Prototype failed to render</h1>
      <pre style="white-space:pre-wrap;background:#fde8ea;padding:12px;border-radius:8px">${String(err?.stack || err)}</pre>
    </div>`;
  }
}

function jumpToRefundHistory() {
  state.actionsMenuOpen = false;
  if (state.view !== "detail") {
    if (state.view === "refund" || state.view === "cancel") {
      if (!leaveWorkflow("detail")) return;
    } else {
      state.view = "detail";
    }
  }
  state.pendingScroll = "refund-history";
  render();
}

function flushPendingScroll() {
  const target = state.pendingScroll;
  if (!target) return;
  state.pendingScroll = null;
  const el = document.getElementById(target);
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
    el.classList.remove("is-flash");
    /** Retrigger animation if navigating again. */
    void el.offsetWidth;
    el.classList.add("is-flash");
    window.setTimeout(() => el.classList.remove("is-flash"), 1400);
  });
}

function findShipmentById(shipId) {
  for (const seller of sellers) {
    const ship = seller.shipments.find((s) => s.id === shipId);
    if (ship) return { seller, ship };
  }
  return null;
}

function findPackageInShipment(ship, pkgId) {
  return ship?.packages.find((p) => p.id === pkgId) || null;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 1200);
}

function syncSearchFieldsFromDom(root) {
  root.querySelectorAll("[data-search-field]").forEach((el) => {
    const key = el.getAttribute("data-search-field");
    if (key && key in state.search) state.search[key] = el.value;
  });
}

function canSearchByOrder(s = state.search) {
  return String(s.orderNumber || "").trim().length > 0;
}

function canSearchByCustomer(s = state.search) {
  if (!String(s.customerQuery || "").trim()) return false;
  if (s.dateRange === "custom") {
    return !!(s.customFrom && s.customTo);
  }
  return true;
}

/**
 * Reliable NZ signals only — never treat an empty AU result set as NZ.
 * Prototype: NZ order-number prefix, +64 / 64 phone, or .co.nz email.
 */
function detectNzSearchQuery(path, s = state.search) {
  const order = String(s.orderNumber || "").trim().toUpperCase();
  const customer = String(s.customerQuery || "").trim().toLowerCase();

  if (path === "order-number") {
    if (/^NZ[\s-]?\d+/i.test(order) || /^KNZ[\s-]?\d+/i.test(order)) {
      return { type: "nz-order", query: order };
    }
    return null;
  }

  if (path === "customer-details") {
    if (customer.includes("@") && customer.endsWith(".co.nz")) {
      return { type: "nz-order", query: customer };
    }
    const digits = customer.replace(/[^\d+]/g, "");
    if (
      digits.startsWith("+64") ||
      digits.startsWith("0064") ||
      /^64\d{8,}$/.test(digits)
    ) {
      return { type: "nz-order", query: customer };
    }
  }
  return null;
}

function updateSearchButtonStates(root = document) {
  const orderBtn = root.querySelector('form[data-search-path="order"] button[type="submit"]');
  const customerBtn = root.querySelector(
    'form[data-search-path="customer"] button[type="submit"]'
  );
  if (orderBtn) orderBtn.disabled = !canSearchByOrder();
  if (customerBtn) customerBtn.disabled = !canSearchByCustomer();
}

function openSelectableOrder(orderId, { preserveLinkedCase = false } = {}) {
  if (!isSelectableDemoOrder(orderId)) return false;
  loadDemoOrder(orderId);
  resetRefundSelection();
  resetCancelSelection();
  state.historyOpen = {};
  state.sellerCollapsed = {};
  state.shipmentOpen = {};
  state.actionsMenuOpen = false;
  state.leaveConfirm = null;
  state.originView = "detail";
  state.customerDrawer = null;
  if (!preserveLinkedCase) clearLinkedCase();
  return true;
}

/**
 * Entering Guide from a case (?case=123456) auto-links that servicing case.
 * AI 3-step pre-verification is a separate handoff attribute — only when upstream
 * explicitly reports it (?preverified=1). A matched profile or case link alone
 * does not set it.
 *
 * Optional URL: ?view=detail|track · ?preverified=1 · ?case=123456
 */
function applyCaseEntryFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const caseId = params.get("case");
    if (caseId) {
      const c = findCaseById(caseId);
      if (c && c.open) {
        state.enteredFromCaseId = c.id;
        state.linkedCaseId = c.id;
        if (c.orderId && isSelectableDemoOrder(c.orderId)) {
          openSelectableOrder(c.orderId, { preserveLinkedCase: true });
          state.view = "detail";
        }
        console.info("[analytics] entered_from_case", c.id);
      }
    }

    const view = params.get("view");
    if (view === "detail" || view === "track") {
      state.view = view;
    }

    /** Demo: AI pre-verify on by default; ?preverified=0 hides the handoff cue. */
    const pre = params.get("preverified");
    if (pre === "0" || pre === "false") {
      state.aiThreeStepPreVerified = false;
    } else if (pre === "1" || pre === "true") {
      state.aiThreeStepPreVerified = true;
      console.info("[analytics] ai_threestep_preverified_handoff");
    }
  } catch {
    /* ignore malformed URL in prototype */
  }
}

function goToDemoOrderFromSearch(path) {
  syncSearchFieldsFromDom(document);
  if (path === "order-number" && !canSearchByOrder()) return;
  if (path === "customer-details" && !canSearchByCustomer()) return;

  const nz = detectNzSearchQuery(path);
  if (nz) {
    state.searchError = nz;
    console.info("[analytics] order_search_nz_detected", path, nz.query);
    render();
    return;
  }

  state.searchError = null;
  console.info("[analytics] order_search", path, { ...state.search });

  if (path === "customer-details") {
    state.historyFilter = "";
    state.view = "history";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  /** Order-number search opens the primary HD multi-shipment demo. */
  openSelectableOrder(demoOrderIds.HD_MULTI);
  state.view = "detail";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast(`Opened order ${order.id}`);
}

function detectSearchKeyKind(query) {
  const q = String(query || "").trim();
  if (!q) return "name";
  if (q.includes("@")) return "email";
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 8 && /^[\d\s+()-]+$/.test(q)) return "phone";
  return "name";
}

function formatHistoryPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("04")) {
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  return phone || "";
}

function formatHistoryDate(iso) {
  return formatAuDate(iso) || iso;
}

function historyDateRangeLabel() {
  const s = state.search;
  if (s.dateRange === "custom" && s.customFrom && s.customTo) {
    return `${formatHistoryDate(s.customFrom)}–${formatHistoryDate(s.customTo)}`;
  }
  const end = new Date(PROTO_NOW_MS);
  const start = new Date(PROTO_NOW_MS);
  if (s.dateRange === "week") start.setDate(end.getDate() - 7);
  else if (s.dateRange === "quarter") start.setMonth(end.getMonth() - 3);
  else start.setMonth(end.getMonth() - 1);
  const fmt = (d) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)}–${fmt(end)}`;
}

/**
 * Customer cell: name + one metadata line (email · phone).
 * Phone never wraps; email truncates with ellipsis when space is tight.
 * Omit the searched key — it already anchors the page header.
 */
function historyCustomerCell(row, keyKind) {
  const name = row.customerName || "—";
  const email = keyKind === "email" ? "" : row.email || "";
  const phone = keyKind === "phone" ? "" : formatHistoryPhone(row.phone);
  const emailEl = email
    ? `<span class="history-customer-email" title="${email}">${email}</span>`
    : "";
  const phoneEl = phone
    ? `<span class="history-customer-phone">${phone}</span>`
    : "";
  const sep =
    emailEl && phoneEl
      ? `<span class="history-customer-sep" aria-hidden="true">·</span>`
      : "";
  const meta =
    emailEl || phoneEl
      ? `<div class="history-customer-meta">${emailEl}${sep}${phoneEl}</div>`
      : "";
  return `
    <div class="history-customer-name" title="${name}">${name}</div>
    ${meta}`;
}

/**
 * Order History item previews — overlapping thumbs for order recognition.
 * Distinct from Track's discrete shipment product strip.
 */
function historyItemsPreview(products = []) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  if (!list.length) {
    return `<span class="history-items is-empty" aria-label="No product images">—</span>`;
  }
  const MAX = 3;
  const shown = list.slice(0, MAX);
  const overflow = list.length - shown.length;
  const thumbs = shown
    .map(
      (src, i) => `
      <span class="history-item-thumb" style="z-index:${shown.length - i}">
        <img src="${src}" alt="" width="32" height="32" draggable="false" />
      </span>`
    )
    .join("");
  const more =
    overflow > 0
      ? `<span class="history-item-more" aria-label="${overflow} more products">+${overflow}</span>`
      : "";
  return `
    <div class="history-items" aria-label="${list.length} product${list.length === 1 ? "" : "s"}">
      <div class="history-item-stack">${thumbs}</div>
      ${more}
    </div>`;
}

function historyFulfilmentCell(row) {
  return `
    <div class="history-fulfilment">
      <div class="history-fulfilment-brand">${row.brand || "—"}</div>
      <div class="history-fulfilment-method">${row.delivery || ""}</div>
    </div>`;
}

function filteredHistoryResults() {
  const q = String(state.historyFilter || "").trim().toLowerCase();
  const rows = [...orderSearchResults].sort((a, b) =>
    String(b.placedAt).localeCompare(String(a.placedAt))
  );
  if (!q) return rows;
  return rows.filter((r) => String(r.id).toLowerCase().includes(q));
}

function historyResultsForHtml(query) {
  const q = String(query || "").trim() || "customer";
  const escaped = q.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  /** Email/phone are deterministic keys — don't wrap in name-search quotes. */
  if (detectSearchKeyKind(q) === "email" || detectSearchKeyKind(q) === "phone") {
    return `Results for <strong>${escaped}</strong>`;
  }
  return `Results for <strong>“${escaped}”</strong>`;
}

/**
 * Order History — Care-facing result list after contact search.
 * Job: which of these orders is the customer calling about?
 */
function renderOrderHistory() {
  const query = String(state.search.customerQuery || "").trim() || "customer";
  const keyKind = detectSearchKeyKind(query);
  const rangeLabel = historyDateRangeLabel();
  const rows = filteredHistoryResults();
  const total = orderSearchResults.length;
  const brand = availableSearchBrands().find((b) => b.id === state.search.brand);

  const body = rows.length
    ? rows
        .map((row) => {
          return `
          <tr class="history-row" tabindex="0" data-action="open-history-order" data-order="${row.id}">
            <td class="history-order-id">${row.id}</td>
            <td class="history-items-cell">${historyItemsPreview(row.products)}</td>
            <td class="history-placed">${formatHistoryDate(row.placedAt)}</td>
            <td class="history-customer-cell">${historyCustomerCell(row, keyKind)}</td>
            <td class="history-fulfilment-cell">${historyFulfilmentCell(row)}</td>
            <td class="history-status-cell">${statusBadge(row.status)}</td>
            <td class="history-total">${money(row.total)}</td>
            <td class="history-chevron" aria-hidden="true">${icons.chevronRight}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="8" class="history-empty">No orders match that order number filter.</td></tr>`;

  return `
    <section class="history-page">
      <header class="history-head">
        <div class="history-head-main">
          <h1>Order history</h1>
          <p class="history-results-for">${historyResultsForHtml(query)}</p>
          <p class="history-meta">
            <span class="history-meta-range">${rangeLabel}</span>
            ${
              brand
                ? `<span class="history-meta-sep" aria-hidden="true">·</span>
                  <span
                    class="brand-tile is-selected is-compact is-sole"
                    title="Searched in ${brand.name} ${brand.region || "AU"}"
                    aria-label="${brand.name} ${brand.region || "AU"}"
                  >
                    <img class="brand-tile-logo" src="${brand.logo}" alt="" width="48" height="14" />
                    <span class="brand-tile-region">${brand.region || "AU"}</span>
                  </span>`
                : ""
            }
          </p>
        </div>
        <button type="button" class="linkish history-change" data-view="search">Change search</button>
      </header>

      <div class="history-toolbar">
        <p class="history-count">${rows.length === total ? `${total} order${total === 1 ? "" : "s"}` : `${rows.length} of ${total} orders`}</p>
        <label class="history-filter">
          <span class="visually-hidden">Filter by order number</span>
          <span class="history-filter-icon" aria-hidden="true">${icons.search}</span>
          <input
            class="text-input history-filter-input"
            type="search"
            placeholder="Filter by order number"
            data-action="history-filter"
            value="${String(state.historyFilter || "").replace(/"/g, "&quot;")}"
          />
        </label>
      </div>

      <div class="history-table-wrap card">
        <table class="history-table">
          <thead>
            <tr>
              <th>Order</th>
              <th class="history-items-cell">Items</th>
              <th>Placed</th>
              <th class="history-customer-cell">Customer</th>
              <th>Fulfilment</th>
              <th>Status</th>
              <th class="history-total">Total</th>
              <th class="history-chevron-head" aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}

const rootEl = document.getElementById("root");
if (rootEl) {
  rootEl.addEventListener("click", (e) => {
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) {
      navigator.clipboard?.writeText(copyBtn.getAttribute("data-copy"));
      showToast("✓ Copied");
      return;
    }

    const viewBtn = e.target.closest("[data-view]");
    if (viewBtn) {
      e.preventDefault();
      const target = viewBtn.getAttribute("data-view");
      state.actionsMenuOpen = false;
      if (state.view === "refund" && target !== "refund") {
        if (leaveRefund(target)) {
          render();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      state.view = target;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const actionEl = e.target.closest("[data-action]");
    const action =
      e.target.getAttribute("data-action") ||
      actionEl?.getAttribute("data-action");

    if (action === "toggle-order-actions") {
      state.actionsMenuOpen = !state.actionsMenuOpen;
      render();
      return;
    }

    if (action === "open-customer-orders") {
      if ((customer.profileMatch || "matched") === "unmatched") return;
      state.actionsMenuOpen = false;
      state.customerDrawer = "orders";
      /** Lookup key = profile email only — never name/phone/fuzzy. */
      console.info("[analytics] open_customer_recent_orders", {
        email: customerProfileEmail() || null,
        nameDisplayOnly: customer.name,
      });
      render();
      return;
    }
    if (action === "open-customer-cases") {
      if ((customer.profileMatch || "matched") === "unmatched") return;
      state.actionsMenuOpen = false;
      state.customerDrawer = "cases";
      console.info("[analytics] open_customer_recent_cases", {
        email: customerProfileEmail() || null,
        nameDisplayOnly: customer.name,
      });
      render();
      return;
    }
    if (action === "open-link-case" || action === "change-linked-case") {
      if ((customer.profileMatch || "matched") === "unmatched") return;
      state.actionsMenuOpen = false;
      state.customerDrawer = "link-case";
      console.info("[analytics] open_link_case_drawer", action);
      render();
      return;
    }
    if (action === "link-case") {
      const caseId =
        e.target.getAttribute("data-case") ||
        actionEl?.getAttribute("data-case");
      if (!caseId) return;
      if (linkServicingCase(caseId)) {
        state.customerDrawer = null;
        console.info("[analytics] link_servicing_case", caseId);
        render();
        showToast(`Linked case #${caseId}`);
      }
      return;
    }
    if (action === "close-customer-drawer") {
      state.customerDrawer = null;
      render();
      return;
    }
    if (action === "open-recent-order") {
      const orderId =
        e.target.getAttribute("data-order") ||
        actionEl?.getAttribute("data-order");
      if (!orderId) return;
      if (orderId === order.id) {
        state.customerDrawer = null;
        render();
        return;
      }
      if (openSelectableOrder(orderId)) {
        state.view = "detail";
        state.customerDrawer = null;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        showToast(`Opened order ${orderId}`);
      }
      return;
    }
    if (action === "recent-order-unavailable") {
      const orderId =
        e.target.getAttribute("data-order") ||
        actionEl?.getAttribute("data-order");
      showToast(`Order ${orderId} isn't in this prototype workspace`);
      return;
    }
    if (action === "view-case" || action === "view-linked-case") {
      const caseId =
        e.target.getAttribute("data-case") ||
        actionEl?.getAttribute("data-case") ||
        state.linkedCaseId;
      state.actionsMenuOpen = false;
      console.info("[analytics] view_case", caseId);
      showToast(`Open case #${caseId} — case workspace not in this prototype`);
      render();
      return;
    }
    if (action === "view-all-orders") {
      const email = customerProfileEmail();
      if (!email) {
        showToast("No email address is available for this customer");
        return;
      }
      /** Same email-keyed Order History route — not a parallel history product. */
      state.customerDrawer = null;
      state.search.customerQuery = email;
      if (!state.search.dateRange) state.search.dateRange = "month";
      state.searchError = null;
      state.historyFilter = "";
      state.view = "history";
      console.info("[analytics] view_all_orders_from_drawer", { email });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (action === "view-all-cases") {
      showToast("All cases — not in this prototype");
      return;
    }

    /** Close Actions ▾ when clicking outside the menu. */
    if (state.actionsMenuOpen && !e.target.closest(".order-actions-menu")) {
      state.actionsMenuOpen = false;
      render();
    }

    if (action === "cancel" || action === "back-to-order") {
      if (leaveRefund(state.originView || "detail")) {
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    if (action === "leave-confirm-stay") {
      state.leaveConfirm = null;
      render();
      return;
    }
    if (action === "leave-confirm-leave") {
      const target = state.leaveConfirm?.targetView || state.originView || "detail";
      leaveRefund(target, { force: true });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (action === "submit") {
      const { amount, units, charges } = refundSelectionSummary();
      if (!units && !charges) return;
      if (state.refund.shippingSelected && state.refund.shippingAmountError) {
        showToast("Fix the shipping refund amount");
        return;
      }
      const caseRec = ensureServicingCase({ topic: "Refund" });
      showToast(`Refund ${money(amount)} recorded on case #${caseRec.id} (prototype)`);
      resetRefundSelection();
      state.leaveConfirm = null;
      state.view = state.originView || "detail";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (action === "start-refund") {
      enterRefund();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (action === "jump-refund-history") {
      jumpToRefundHistory();
      return;
    }
    if (action === "refund-toggle-ship") {
      const shipId =
        e.target.getAttribute("data-ship") ||
        actionEl?.getAttribute("data-ship");
      const found = findShipmentById(shipId);
      if (!found) return;
      const tri = shipmentSelectionState(found.ship);
      selectAllInShipment(found.ship, tri !== "all");
      render();
      return;
    }
    if (action === "refund-toggle-pkg") {
      const shipId =
        e.target.getAttribute("data-ship") ||
        actionEl?.getAttribute("data-ship");
      const pkgId =
        e.target.getAttribute("data-pkg") ||
        actionEl?.getAttribute("data-pkg");
      const found = findShipmentById(shipId);
      const pkg = findPackageInShipment(found?.ship, pkgId);
      if (!found || !pkg) return;
      const tri = packageSelectionState(found.ship, pkg);
      selectAllInPackage(found.ship, pkg, tri !== "all");
      render();
      return;
    }
    if (action === "refund-toggle-item") {
      const key =
        e.target.getAttribute("data-key") ||
        actionEl?.getAttribute("data-key");
      const max = Number(
        e.target.getAttribute("data-max") ||
          actionEl?.getAttribute("data-max") ||
          1
      );
      if (!key) return;
      const on = itemSelectedQty(key) <= 0;
      setItemSelectedQty(key, on ? max : 0, max);
      render();
      return;
    }
    if (action === "refund-toggle-shipping") {
      setShippingSelected(!state.refund.shippingSelected);
      render();
      return;
    }
    if (action === "cancel-items") {
      state.actionsMenuOpen = false;
      const caseRec = ensureServicingCase({ topic: "Cancel" });
      render();
      showToast(`Cancel recorded on case #${caseRec.id} (prototype)`);
      return;
    }
    if (action === "report-damage") {
      state.actionsMenuOpen = false;
      const caseRec = ensureServicingCase({ topic: "Damage" });
      render();
      showToast(`Damage report recorded on case #${caseRec.id} (prototype)`);
      return;
    }
    if (action === "dismiss-search-tip") {
      state.searchTipDismissed = true;
      render();
      return;
    }
    if (action === "open-dom-nz") {
      e.preventDefault();
      console.info("[analytics] open_dom_nz");
      showToast("Opened DOM for NZ orders (prototype)");
      return;
    }
    if (action === "select-brand") {
      const brand =
        e.target.getAttribute("data-brand") ||
        actionEl?.getAttribute("data-brand");
      if (brand && availableSearchBrands().some((b) => b.id === brand)) {
        state.search.brand = brand;
        state.searchError = null;
        render();
      }
      return;
    }
    if (action === "open-history-order") {
      const orderId =
        e.target.getAttribute("data-order") ||
        actionEl?.getAttribute("data-order");
      if (!orderId) return;
      console.info("[analytics] open_history_order", orderId);
      if (openSelectableOrder(orderId)) {
        state.view = "detail";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        showToast(`Opened order ${orderId}`);
      } else {
        state.view = "detail";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        showToast(`Opened order ${orderId} (prototype workspace)`);
      }
      return;
    }
    if (action === "search-date-range") {
      const range =
        e.target.getAttribute("data-range") ||
        actionEl?.getAttribute("data-range");
      if (range) {
        syncSearchFieldsFromDom(rootEl);
        state.search.dateRange = range;
        render();
      }
      return;
    }
    if (action === "toggle-history") {
      const id = e.target.closest("[data-ship]")?.getAttribute("data-ship");
      if (id) {
        state.historyOpen[id] = !state.historyOpen[id];
        render();
      }
    }
    if (action === "toggle-seller") {
      const id =
        e.target.getAttribute("data-seller") ||
        e.target.closest("[data-seller]")?.getAttribute("data-seller");
      if (id) {
        const seller = sellers.find((s) => s.id === id);
        const currentlyCollapsed = seller
          ? isSellerCollapsed(seller, {
              collapsible: true,
              trackMode: state.view === "track",
            })
          : !!state.sellerCollapsed[id];
        state.sellerCollapsed[id] = !currentlyCollapsed;
        render();
      }
    }
    if (action === "toggle-shipment") {
      const id =
        e.target.getAttribute("data-ship") ||
        e.target.closest("[data-ship]")?.getAttribute("data-ship");
      if (id) {
        let seller = null;
        let ship = null;
        for (const s of sellers) {
          const found = s.shipments.find((sh) => sh.id === id);
          if (found) {
            seller = s;
            ship = found;
            break;
          }
        }
        const currentlyOpen = ship
          ? isShipmentExpanded(ship, seller)
          : !!state.shipmentOpen[id];
        state.shipmentOpen[id] = !currentlyOpen;
        render();
      }
    }
    if (action === "open-shippit") {
      console.info(
        "[analytics] open_shippit_tracking",
        e.target.getAttribute("data-tracking")
      );
      showToast("Opened Shippit tracking");
    }
    if (action === "open-carrier-track") {
      console.info(
        "[analytics] open_carrier_tracking",
        e.target.getAttribute("data-carrier"),
        e.target.getAttribute("data-tracking")
      );
      showToast("Opened carrier tracking");
    }
    if (action === "unlink-case") {
      if (!linkedCase()) return;
      state.actionsMenuOpen = false;
      /** Keep association drawer open so it can refresh after confirm. */
      state.unlinkConfirm = true;
      render();
      return;
    }
    if (action === "unlink-confirm-keep") {
      state.unlinkConfirm = false;
      render();
      return;
    }
    if (action === "unlink-confirm-unlink") {
      const prev = linkedCase();
      const keepDrawer = state.customerDrawer === "link-case";
      clearLinkedCase();
      if (keepDrawer) state.customerDrawer = "link-case";
      console.info("[analytics] unlink_servicing_case", prev?.id);
      render();
      showToast(prev ? `Unlinked case #${prev.id}` : "Case unlinked");
      return;
    }
    if (action === "create-case") {
      state.actionsMenuOpen = false;
      /** Always mint a new case — agents may need a separate case even when one is linked. */
      state.linkedCaseId = null;
      state.linkedCaseSnapshot = null;
      const created = ensureServicingCase({ topic: "General" });
      render();
      showToast(`Case #${created.id} created and linked`);
      return;
    }
    if (action === "attach-to-linked-case") {
      const linked = linkedCase();
      if (!linked) {
        state.customerDrawer = "link-case";
        render();
        return;
      }
      console.info("[analytics] attach_to_linked_case", linked.id);
      showToast(`Added to case #${linked.id} · ${linked.topic}`);
      return;
    }
    if (action === "refund-shipping") {
      enterRefund({ preselectShipping: true });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast("Refund shipping — shipping charge pre-selected");
      return;
    }
    if (action === "open-mirakl") {
      const sellerId =
        e.target.getAttribute("data-seller") ||
        actionEl?.getAttribute("data-seller");
      const channel =
        e.target.getAttribute("data-channel") ||
        actionEl?.getAttribute("data-channel") ||
        "mirakl";
      console.info("[analytics] open_mirakl", sellerId, channel);
      showToast(`Opened Mirakl for ${channel} refund (prototype)`);
      return;
    }
    if (action === "retry-shippit") {
      showToast("Retrying Shippit… (prototype)");
    }
  });

  rootEl.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-search-path]");
    if (!form) return;
    e.preventDefault();
    const path = form.getAttribute("data-search-path");
    goToDemoOrderFromSearch(path === "customer" ? "customer-details" : "order-number");
  });

  rootEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.unlinkConfirm) {
      e.preventDefault();
      state.unlinkConfirm = false;
      render();
      return;
    }
    if (e.key === "Escape" && state.customerDrawer) {
      e.preventDefault();
      state.customerDrawer = null;
      render();
      return;
    }

    const tab = e.target.closest('.views [role="tab"]');
    if (tab) {
      const tabs = [...rootEl.querySelectorAll('.views [role="tab"]')];
      const i = tabs.indexOf(tab);
      if (i < 0) return;
      let next = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next >= 0) {
        e.preventDefault();
        const target = tabs[next];
        target.focus();
        const view = target.getAttribute("data-view");
        if (view && view !== state.view) {
          state.view = view;
          state.actionsMenuOpen = false;
          render();
          document.getElementById(`view-tab-${view}`)?.focus();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
      return;
    }

    const row = e.target.closest(".history-row");
    if (!row) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      row.click();
    }
  });

  rootEl.addEventListener("input", (e) => {
    if (e.target.getAttribute("data-action") === "history-filter") {
      state.historyFilter = e.target.value;
      const keep = e.target;
      const start = keep.selectionStart;
      const end = keep.selectionEnd;
      render();
      const next = document.querySelector("[data-action='history-filter']");
      if (next) {
        next.focus();
        if (typeof start === "number") next.setSelectionRange(start, end);
      }
      return;
    }
    const field = e.target.getAttribute("data-search-field");
    if (!field || !(field in state.search)) return;
    state.search[field] = e.target.value;
    if (state.searchError) state.searchError = null;
    updateSearchButtonStates(rootEl);
    const err = rootEl.querySelector(".search-nz-error");
    if (err) err.remove();
  });

  rootEl.addEventListener("change", (e) => {
    const action = e.target.getAttribute("data-action");
    if (action === "refund-default-reason") {
      state.refund.defaultReason = e.target.value;
      /** Drop overrides that now match the new default. */
      for (const key of Object.keys(state.refund.itemReasonOverrides)) {
        if (state.refund.itemReasonOverrides[key] === state.refund.defaultReason) {
          delete state.refund.itemReasonOverrides[key];
        }
      }
      render();
      return;
    }
    if (action === "refund-item-qty") {
      const key = e.target.getAttribute("data-key");
      const max = Number(e.target.getAttribute("data-max") || 1);
      setItemSelectedQty(key, e.target.value, max);
      render();
      return;
    }
    if (action === "refund-item-reason") {
      const key = e.target.getAttribute("data-key");
      if (key) setItemReasonOverride(key, e.target.value);
      render();
      return;
    }
    if (action === "refund-shipping-reason") {
      state.refund.shippingReason = e.target.value;
      render();
      return;
    }
    if (action === "refund-shipping-amount") {
      const parsed = parseShippingAmount(e.target.value);
      if (parsed.ok) {
        state.refund.shippingAmount = parsed.value;
        state.refund.shippingAmountError = "";
      } else {
        state.refund.shippingAmountError = parsed.error;
      }
      render();
      /** Keep focus/caret on the amount field after re-render. */
      requestAnimationFrame(() => {
        const el = rootEl.querySelector("[data-action='refund-shipping-amount']");
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
      return;
    }
    const field = e.target.getAttribute("data-search-field");
    if (field && field in state.search) {
      state.search[field] = e.target.value;
      updateSearchButtonStates(rootEl);
    }
  });
}

applyCaseEntryFromUrl();
render();
