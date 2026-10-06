/**
 * Configurable Shippit → Ecommerce Guide presentation mapping.
 * Keep UI components free of raw Shippit strings.
 */

export const SHIPPIT_STATUS_MAP = {
  processing: {
    label: "Preparing for delivery",
    explanation:
      "Your parcel is being prepared for the courier.",
    calculateDelay: false,
    kind: "progress",
  },
  order_placed: {
    label: "Preparing for delivery",
    explanation:
      "Your parcel is being prepared for the courier.",
    calculateDelay: false,
    kind: "progress",
  },
  despatch_in_progress: {
    label: "Preparing for delivery",
    explanation:
      "Your parcel is being prepared for the courier.",
    calculateDelay: false,
    kind: "progress",
  },
  ready_for_pickup: {
    label: "Awaiting courier collection",
    explanation:
      "The courier booking has been confirmed and the parcel is waiting to be collected from Kmart.",
    calculateDelay: false,
    kind: "label", // label/no-scan — does not reset meaningful-carrier clock
    meaningfulCarrier: false,
  },
  pickup_failed: {
    label: "Courier collection unsuccessful",
    explanation:
      "The courier was unable to collect the parcel. Kmart will rebook collection.",
    calculateDelay: false,
    kind: "exception",
  },
  in_transit: {
    label: "In transit",
    explanation:
      "Your parcel has been collected and is moving through the carrier network.",
    calculateDelay: true,
    kind: "progress",
    meaningfulCarrier: true,
  },
  with_driver: {
    label: "Out for delivery",
    explanation: "Your parcel is with the driver and on its way today.",
    calculateDelay: true,
    kind: "progress",
    meaningfulCarrier: true,
  },
  delivery_attempted: {
    label: "Delivery attempted",
    explanation:
      "The courier attempted delivery. Check carrier instructions for redelivery or collection.",
    calculateDelay: false,
    kind: "exception",
    pathway: "attempted",
  },
  delivery_failed: {
    label: "Delivery unsuccessful",
    explanation:
      "Delivery could not be completed. Follow the carrier’s recovery instructions.",
    calculateDelay: false,
    kind: "exception",
  },
  insufficient_address: {
    label: "Address issue",
    explanation:
      "The delivery address is incomplete or incorrect. Update the address or arrange recovery.",
    calculateDelay: false,
    kind: "exception",
    pathway: "address",
  },
  awaiting_collection: {
    label: "Ready for collection",
    explanation: "The parcel is ready to be collected from the carrier location.",
    calculateDelay: false,
    kind: "progress",
  },
  await_collection: {
    label: "Ready for collection",
    explanation: "The parcel is ready to be collected from the carrier location.",
    calculateDelay: false,
    kind: "progress",
  },
  completed: {
    label: "Delivered",
    explanation: "The carrier has marked this parcel as delivered.",
    calculateDelay: false,
    kind: "terminal",
    pathway: "delivered",
  },
  parcel_completed: {
    label: "Delivered",
    explanation: "The carrier has marked this parcel as delivered.",
    calculateDelay: false,
    kind: "terminal",
    pathway: "delivered",
  },
  partially_completed: {
    label: "Partially delivered",
    explanation: "Part of this consignment has been delivered.",
    calculateDelay: false,
    kind: "exception",
  },
  lost: {
    label: "Lost in transit",
    explanation:
      "This parcel has been reported lost. Refund the affected shipment if eligible, or record follow-up on a case.",
    calculateDelay: false,
    kind: "exception",
    pathway: "lost",
  },
  damaged: {
    label: "Damaged in transit",
    explanation: "This parcel has been reported damaged. Follow the damaged-item pathway.",
    calculateDelay: false,
    kind: "exception",
    pathway: "damaged",
  },
  returned_to_sender: {
    label: "Returning to Kmart",
    explanation:
      "The parcel is returning to Kmart after unsuccessful delivery. Apply the refund/recovery process.",
    calculateDelay: false,
    kind: "exception",
    pathway: "rts",
  },
  invalidated: {
    label: "Courier booking issue",
    explanation: "There is a problem with the courier booking for this shipment.",
    calculateDelay: false,
    kind: "exception",
  },
  cancelled: {
    label: "Delivery cancelled",
    explanation: "Delivery for this shipment has been cancelled.",
    calculateDelay: false,
    kind: "exception",
  },
  untrackable: {
    label: "Tracking unavailable",
    explanation: "Carrier tracking information isn't available for this shipment.",
    calculateDelay: false,
    kind: "unavailable",
  },
};

const UNKNOWN = {
  label: "Tracking update available",
  explanation:
    "A tracking update was received but couldn’t be interpreted. Use Open Shippit tracking for detail.",
  calculateDelay: false,
  kind: "unknown",
};

export function mapShippitStatus(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  return SHIPPIT_STATUS_MAP[key] || { ...UNKNOWN, raw };
}

/**
 * Status → relative position on the normal delivery journey (0–1).
 * Visual cue only — heading remains semantic source of truth.
 * Exceptions: no position (neutral line, no marker).
 */
const JOURNEY_POSITION = {
  order_placed: 0.12,
  processing: 0.12,
  despatch_in_progress: 0.18,
  ready_for_pickup: 0.22,
  in_transit: 0.42,
  with_driver: 0.72,
  awaiting_collection: 0.78,
  await_collection: 0.78,
  completed: 1,
  parcel_completed: 1,
};

/** Exception / return states — linear progress is no longer meaningful. */
const JOURNEY_EXCEPTION = new Set([
  "pickup_failed",
  "delivery_attempted",
  "delivery_failed",
  "insufficient_address",
  "partially_completed",
  "returned_to_sender",
  "lost",
  "damaged",
  "cancelled",
  "invalidated",
  "untrackable",
]);

/**
 * Unlabeled progress cue for the normal journey.
 * Exceptions → neutral rail, no marker (do not invent a %).
 */
export function assessJourney(shippit) {
  if (!shippit || shippit.requestFailed) return null;

  const key = String(shippit.rawStatus || "")
    .trim()
    .toLowerCase();
  if (!key) return null;

  if (JOURNEY_EXCEPTION.has(key)) {
    return { mode: "neutral", position: null };
  }

  const mapped = mapShippitStatus(key);
  if (mapped?.kind === "exception" || mapped?.kind === "unavailable") {
    return { mode: "neutral", position: null };
  }

  const position = JOURNEY_POSITION[key];
  if (position == null) {
    return { mode: "neutral", position: null };
  }

  return {
    mode: "progress",
    position,
    delivered: position >= 1,
  };
}

export function isKmartHomeDelivery(seller) {
  return seller?.kind === "kmart" && seller?.delivery === "HD";
}

/** Distinct tracking numbers on a shipment (never cross-apply). */
export function trackingNumbersForShipment(ship) {
  const nums = [];
  if (ship.trackingNumber) nums.push(ship.trackingNumber);
  for (const pkg of ship.packages || []) {
    if (pkg.tracking && !nums.includes(pkg.tracking)) nums.push(pkg.tracking);
  }
  return nums;
}

function parseTs(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

const MS_DAY = 86400000;

function startOfLocalDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Elapsed business days from an anchor date to "now".
 * Weekends excluded; the anchor day itself is not counted (day one is the next business day).
 * Public holidays are not applied — do not present as precise SLA "delivery days".
 */
export function elapsedBusinessDays(fromTs, toTs = Date.now()) {
  const start = startOfLocalDay(fromTs);
  const end = startOfLocalDay(toTs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let days = 0;
  for (let t = start + MS_DAY; t <= end; t += MS_DAY) {
    const dow = new Date(t).getDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return days;
}

/** Sort events by actual carrier timestamps (newest first). Invalid timestamps last. */
export function sortEventsByTimestamp(events = []) {
  return [...events].sort((a, b) => {
    const ta = parseTs(a.timestamp);
    const tb = parseTs(b.timestamp);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return tb - ta;
  });
}

export function latestValidEvent(events = []) {
  return sortEventsByTimestamp(events).find((e) => parseTs(e.timestamp) != null) || null;
}

/** Label/no-scan events (e.g. ready_for_pickup) do not reset the meaningful-carrier clock. */
export function latestMeaningfulCarrierEvent(events = []) {
  const sorted = sortEventsByTimestamp(events);
  return (
    sorted.find((e) => {
      if (parseTs(e.timestamp) == null) return false;
      const mapped = mapShippitStatus(e.rawStatus);
      return mapped?.meaningfulCarrier !== false && mapped?.kind !== "label";
    }) || null
  );
}

/**
 * Display status for Order Details / Track.
 * Prefer mapped Shippit when it is usable last-mile data for this tracking number;
 * else OMS fulfilment. Capability is tracking-driven — not seller-kind.
 * Never mutates source OMS status.
 */
export function displayShipmentStatus(ship, seller, shippitByTracking) {
  const oms = ship.status;
  const tracking = trackingNumbersForShipment(ship)[0] || null;
  if (!tracking) {
    return { label: oms, source: "oms", mapped: null, shippit: null, tracking: null };
  }

  const shippit = shippitByTracking?.[tracking] || null;
  if (!shippit) {
    return { label: oms, source: "oms", mapped: null, shippit: null, tracking };
  }
  if (shippit.requestFailed) {
    return {
      label: oms,
      source: "oms",
      mapped: null,
      shippit,
      tracking,
      retrievalFailed: true,
    };
  }
  if (shippit.rawStatus === "untrackable") {
    const mapped = mapShippitStatus("untrackable");
    return { label: mapped.label, source: "shippit", mapped, shippit, tracking };
  }

  const mapped = mapShippitStatus(shippit.rawStatus);
  if (!mapped) {
    return { label: oms, source: "oms", mapped: null, shippit, tracking };
  }

  // Prefer Shippit when it represents more specific last-mile state
  const useShippit =
    mapped.kind === "progress" ||
    mapped.kind === "exception" ||
    mapped.kind === "terminal" ||
    mapped.kind === "label" ||
    mapped.kind === "unknown" ||
    mapped.kind === "unavailable";

  if (useShippit) {
    return { label: mapped.label, source: "shippit", mapped, shippit, tracking };
  }
  return { label: oms, source: "oms", mapped, shippit, tracking };
}

export function assessSla(ship, shippit, mapped, { now = Date.now() } = {}) {
  if (!mapped?.calculateDelay || !ship.sla) return null;
  if (mapped.kind === "terminal" || mapped.pathway === "delivered") return null;

  const end = parseTs(ship.sla.expectedEnd);
  if (end == null) return null;

  const outside = now > end;
  const hoursOutside = outside ? (now - end) / (MS_DAY / 24) : 0;

  const meaningful = latestMeaningfulCarrierEvent(shippit?.events || []);
  const meaningfulTs = parseTs(meaningful?.timestamp);
  const hoursSinceMeaningful =
    meaningfulTs != null ? (now - meaningfulTs) / (MS_DAY / 24) : Infinity;

  const investigate = outside && hoursOutside > 48 && hoursSinceMeaningful > 48;

  return {
    outside,
    within: !outside,
    expectedStart: ship.sla.expectedStart,
    expectedEnd: ship.sla.expectedEnd,
    expectedLabel: ship.sla.label,
    shippingPaid: !!ship.sla.shippingPaid,
    investigate,
    hoursOutside,
    hoursSinceMeaningful,
  };
}

export function formatEventWhen(timestamp) {
  const t = parseTs(timestamp);
  if (t == null) return "Unknown time";
  return new Date(t).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatEventWhenShort(timestamp) {
  const t = parseTs(timestamp);
  if (t == null) return "Unknown time";
  return new Date(t).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
