/**
 * Multi-seller / multi-shipment / multi-package demo — Order 451990612.
 * Kmart HD shipments may carry TrackingNumber → Shippit Track (per shipment).
 * Source field: OrderLine[].FulfillmentDetail[].TrackingNumber
 */
export const agent = { name: "Mason Conway" };

const hdCustomer = {
  name: "Mason Conway",
  email: "mason.conway@kmart.com.au",
  emailShort: "mason.conway@kmart.co…",
  phone: "0466962766",
  /** Current membership — shown in Order information customer section. */
  onePassMember: true,
};

const hdOrder = {
  id: "451990612",
  date: "21 Sep 2026",
  status: "Partially shipped",
  type: "Mixed",
  delivery: "HD",
  source: "web",
  total: 1032.88,
  shipping: 90.88,
  shippingRefunded: 23.0,
  shippingRemaining: 53.93,
  shippingRefundReason: "Delayed delivery",
  shippingRefundDate: "28 Sep 2026",
  /** Cumulative amount recorded as refunded — not a processing status. */
  totalRefunded: 302.0,
  items: 14,
  claims: 0,
  unitsReady: 0,
  unitsShipped: 2,
  unitsDelivered: 8,
  /** Original charged merchandise — reconciles with shipping to order total. */
  merchandiseSubtotal: 942.0,
  orderTotalDisplay: 1032.88,
  paymentMethod: "Visa",
  paymentLast4: "1234",
};

/** Line catalogue — refund balance lives here; packages only allocate units. */
const hdLines = {
  tramp: {
    id: "tramp",
    name: "12 Foot Springless Trampoline",
    sku: "42836155",
    qty: 3,
    price: 279.0,
    subtotal: 837.0,
    status: "Partially shipped",
    refundable: true,
    thumb: "TR",
    /** Kmart PDP hero — assets.kmart.com.au / 42836155 */
    image: "./assets/products/tramp.jpg",
    shippingFee: {
      name: "Big & Bulky shipping",
      original: 76.93,
      refunded: 23.0,
      remaining: 53.93,
      status: "Partially refunded",
      meta: "Delayed delivery · 28 Sep 2026",
      refundable: true,
    },
  },
  uno: {
    id: "uno",
    name: "UNO Card Game",
    sku: "6225544",
    qty: 3,
    price: 6.0,
    subtotal: 18.0,
    status: "Delivered",
    refundable: true,
    thumb: "UN",
    /** Kmart PDP hero — assets.kmart.com.au / 6225544 */
    image: "./assets/products/uno.jpg",
    shippingFee: null,
  },
  towel: {
    id: "towel",
    name: "Anko Bath Towel",
    sku: "43110288",
    qty: 2,
    price: 12.0,
    subtotal: 24.0,
    status: "Shipped",
    refundable: false,
    thumb: "TW",
    /** Kmart stand-in — Edan Cotton Bath Towel Moss 43489664 */
    image: "./assets/products/towel.jpg",
    shippingFee: null,
  },
  tee: {
    id: "tee",
    name: "Target Kids Tee",
    sku: "50721901",
    qty: 1,
    price: 12.0,
    subtotal: 12.0,
    status: "Shipped",
    refundable: false,
    thumb: "TE",
    /** Target AU basic tee stand-in */
    image: "./assets/products/tee.jpg",
    shippingFee: null,
  },
  chair: {
    id: "chair",
    name: "Folding Camping Chair",
    sku: "MP-88421",
    qty: 1,
    price: 49.0,
    subtotal: 49.0,
    /** OMS fulfilment only — no Shippit last-mile; do not infer carrier Delivered. */
    status: "Shipped",
    refundable: false,
    thumb: "CH",
    /** Kmart stand-in — AUSWAY folding camping chair */
    image: "./assets/products/chair.jpg",
    shippingFee: null,
  },
  cards: {
    id: "cards",
    name: "52's Playing Cards",
    sku: "42999171",
    qty: 2,
    price: 5.0,
    subtotal: 10.0,
    status: "Delivered",
    refundable: true,
    thumb: "PC",
    /** Kmart PDP hero — assets.kmart.com.au / 42999171 */
    image: "./assets/products/cards.png",
    shippingFee: null,
  },
  socks: {
    id: "socks",
    name: "5 Pack School Crew Socks",
    sku: "69555527",
    qty: 1,
    price: 8.0,
    subtotal: 8.0,
    status: "Delivered",
    refundable: true,
    thumb: "SK",
    /** Kmart PDP hero — assets.kmart.com.au / 69555527 (5 Pack School Crew Socks) */
    image: "./assets/products/socks.jpg",
    shippingFee: null,
  },
  notebook: {
    id: "notebook",
    name: "A5 Spiral Notebook - Black",
    sku: "43250134",
    qty: 1,
    price: 7.0,
    subtotal: 7.0,
    status: "Shipped",
    refundable: true,
    thumb: "NB",
    /** Kmart PDP hero — assets.kmart.com.au / 43250134 */
    image: "./assets/products/notebook.jpg",
    shippingFee: null,
  },
};

const shipToBase = {
  name: "Mason Conway",
  address: "690 Springvale Rd, Mulgrave VIC 3170",
  /** Shipping Region tool result for this postcode (3170). */
  region: "Metro",
};

/**
 * Kmart AU Home Delivery service windows by Shipping Region
 * (public guidance: metro 3–5, regional 7–10, remote 14–20).
 * Distinct from calculated Expected delivery dates on each shipment.
 */
export const KMART_HD_SERVICE_WINDOWS = {
  Metro: "3–5 business days",
  Regional: "7–10 business days",
  Remote: "14–20 business days",
};

/** Order-level service promise for destination — not per-shipment elapsed days. */
const hdDestinationService = {
  /** Care-facing service label; Express would swap this later. */
  service: "Standard delivery",
  timeframeByRegion: KMART_HD_SERVICE_WINDOWS,
  /** Sellers whose Home Delivery SLA this destination promise covers. */
  appliesToKinds: ["kmart"],
};

const hdShipTo = shipToBase;

/**
 * Shippit Track responses keyed by tracking number.
 * Never apply one result to another shipment.
 * Events deliberately out of chronological array order to prove client-side sort.
 *
 * Prototype "now" for SLA: 2026-09-28T14:00:00+10:00
 */
export const PROTO_NOW = "2026-09-28T14:00:00+10:00";

/**
 * Refund actions already recorded against the order (read-only history).
 * Sum should reconcile to order.totalRefunded when data is complete.
 * No Pending/Processing/Completed status — amount + when + why only.
 */
const hdRefundHistory = [
  {
    id: "refund-ship-1",
    timestamp: "2026-09-28T11:42:00+10:00",
    amount: 23.0,
    type: "Shipping",
    reason: "Delayed delivery",
    lineId: null,
    qty: null,
  },
  {
    id: "refund-item-1",
    timestamp: "2026-09-26T15:16:00+10:00",
    amount: 279.0,
    type: "Item",
    reason: "Cancellation",
    lineId: "tramp",
    qty: 1,
  },
];

/** Shipment-level carrier identity (who is delivering) — distinct from event status_owner. */
export const carriers = {
  "australia-post": {
    id: "australia-post",
    name: "Australia Post",
    logo: "./assets/carriers/australia-post.png",
  },
  "couriers-please": {
    id: "couriers-please",
    name: "Couriers Please",
    logo: "./assets/carriers/couriers-please.png",
  },
  uber: {
    id: "uber",
    name: "Uber",
    logo: "./assets/carriers/uber.png",
  },
};

const hdShippitByTracking = {
  /** Kmart Ship 1 — delivered (terminal); Couriers Please */
  AU77120334: {
    requestFailed: false,
    trackingNumber: "AU77120334",
    trackingUrl: "https://app.shippit.com/tracking/AU77120334",
    rawStatus: "completed",
    statusOwner: "Couriers Please",
    carrierId: "couriers-please",
    events: [
      {
        rawStatus: "completed",
        statusOwner: "Couriers Please",
        timestamp: "2026-09-26T14:22:00+10:00",
      },
      {
        rawStatus: "with_driver",
        statusOwner: "Couriers Please",
        timestamp: "2026-09-26T08:05:00+10:00",
      },
      {
        rawStatus: "in_transit",
        statusOwner: "Couriers Please",
        timestamp: "2026-09-25T16:40:00+10:00",
      },
      {
        rawStatus: "ready_for_pickup",
        statusOwner: "Store 1014",
        timestamp: "2026-09-25T11:12:00+10:00",
      },
      {
        rawStatus: "despatch_in_progress",
        statusOwner: "Kmart Australia",
        timestamp: "2026-09-25T09:30:00+10:00",
      },
    ],
  },
  /** Kmart Ship 2 — last-mile progress; within SLA; Australia Post / eParcel */
  AU88291001: {
    requestFailed: false,
    trackingNumber: "AU88291001",
    trackingUrl: "https://app.shippit.com/tracking/AU88291001",
    rawStatus: "with_driver",
    statusOwner: "eParcel",
    carrierId: "australia-post",
    events: [
      {
        rawStatus: "with_driver",
        statusOwner: "eParcel",
        timestamp: "2026-09-28T11:16:00+10:00",
      },
      {
        rawStatus: "in_transit",
        statusOwner: "eParcel",
        timestamp: "2026-09-28T06:42:00+10:00",
      },
      {
        rawStatus: "ready_for_pickup",
        statusOwner: "Truganina CFC",
        timestamp: "2026-09-27T15:16:00+10:00",
      },
      {
        rawStatus: "despatch_in_progress",
        statusOwner: "Kmart Australia",
        timestamp: "2026-09-27T10:08:00+10:00",
      },
    ],
  },
  /**
   * Kmart Ship 3 — delayed / outside SLA (>48h past expected end, stale scans).
   * PROTO_NOW 28 Sep 14:00; expected end 25 Sep → investigate pathway.
   */
  AU99340122: {
    requestFailed: false,
    trackingNumber: "AU99340122",
    trackingUrl: "https://app.shippit.com/tracking/AU99340122",
    rawStatus: "in_transit",
    statusOwner: "Couriers Please",
    carrierId: "couriers-please",
    events: [
      {
        rawStatus: "in_transit",
        statusOwner: "Couriers Please",
        timestamp: "2026-09-24T18:10:00+10:00",
      },
      {
        rawStatus: "ready_for_pickup",
        statusOwner: "Store 1014",
        timestamp: "2026-09-23T14:05:00+10:00",
      },
      {
        rawStatus: "despatch_in_progress",
        statusOwner: "Kmart Australia",
        timestamp: "2026-09-23T09:40:00+10:00",
      },
    ],
  },
};

/**
 * Nested fulfilment tree: seller → shipments → packages → allocations.
 * OMS `status` is authoritative fulfilment state and is never overwritten by Shippit.
 */
const hdSellers = [
  {
    id: "kmart",
    name: "Kmart",
    kind: "kmart",
    delivery: "HD",
    status: "Partially shipped",
    itemCount: 10,
    merchandiseTotal: 880.0,
    shipFrom: "Kmart Store 1014",
    shipToName: shipToBase.name,
    shipToAddress: shipToBase.address,
    shipments: [
      {
        id: "kmart-ship-1",
        label: "Shipment 1",
        releaseId: "4519906121",
        store: "1014",
        itemCount: 8,
        /** OMS fulfilment — remains Delivered; Track UI uses Shippit completed */
        status: "Delivered",
        shippingMethod: "Standard",
        tracked: true,
        trackingNumber: "AU77120334",
        shippedAt: "2026-09-25T09:30:00+10:00",
        total: 594.0,
        sla: {
          expectedStart: "2026-09-24",
          expectedEnd: "2026-09-26T23:59:59+10:00",
          label: "24–26 Sep",
          shippingPaid: false,
        },
        packages: [
          {
            id: "kmart-s1-p1",
            index: 1,
            status: "Delivered",
            tracking: "AU77120334",
            allocations: [{ lineId: "tramp", qtyInPackage: 2 }],
          },
          {
            id: "kmart-s1-p2",
            index: 2,
            status: "Delivered",
            tracking: "AU77120334",
            /** Multi-line package — exercises stacked item rows under one package card. */
            allocations: [
              { lineId: "uno", qtyInPackage: 3 },
              { lineId: "cards", qtyInPackage: 2 },
              { lineId: "socks", qtyInPackage: 1 },
            ],
          },
        ],
      },
      {
        id: "kmart-ship-2",
        label: "Shipment 2",
        releaseId: "4519906122",
        store: "1240",
        itemCount: 1,
        /** OMS fulfilment — remains Shipped even when UI shows Out for delivery */
        status: "Shipped",
        shippingMethod: "Big & Bulky",
        tracked: true,
        trackingNumber: "AU88291001",
        /** OMS dispatch — shipment clock; distinct from destination Metro SLA. */
        shippedAt: "2026-09-17T10:00:00+10:00",
        total: 279.0,
        /**
         * Outside SLA but still moving — recent with_driver scan.
         * Care: delayed attention + refund shipping; not investigation.
         */
        sla: {
          expectedStart: "2026-09-25",
          expectedEnd: "2026-09-26T23:59:59+10:00",
          label: "25–26 Sep",
          shippingPaid: true,
        },
        packages: [
          {
            id: "kmart-s2-p1",
            index: 1,
            status: "Shipped",
            tracking: "AU88291001",
            allocations: [{ lineId: "tramp", qtyInPackage: 1 }],
          },
        ],
      },
      {
        id: "kmart-ship-3",
        label: "Shipment 3",
        releaseId: "4519906123",
        store: "1014",
        itemCount: 1,
        /** OMS fulfilment — Shipped; Track shows In transit + Needs investigation */
        status: "Shipped",
        shippingMethod: "Standard",
        tracked: true,
        trackingNumber: "AU99340122",
        shippedAt: "2026-09-15T09:40:00+10:00",
        total: 7.0,
        /**
         * Outside SLA >48h and stale carrier scans (>48h) → investigate pathway.
         * Contrast with Ship 2 (delayed but still moving).
         */
        sla: {
          expectedStart: "2026-09-23",
          expectedEnd: "2026-09-25T23:59:59+10:00",
          label: "23–25 Sep",
          shippingPaid: false,
        },
        packages: [
          {
            id: "kmart-s3-p1",
            index: 1,
            status: "Shipped",
            tracking: "AU99340122",
            allocations: [{ lineId: "notebook", qtyInPackage: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "target",
    name: "Target",
    kind: "target",
    delivery: "HD",
    status: "Shipped",
    itemCount: 3,
    merchandiseTotal: 36.0,
    shipFrom: "Target Store 5072",
    shipToName: shipToBase.name,
    shipToAddress: shipToBase.address,
    shipments: [
      {
        id: "target-ship-1",
        label: "Shipment 1",
        releaseId: "T5072-99102",
        store: "5072",
        itemCount: 3,
        status: "Shipped",
        shippingMethod: "Standard",
        tracked: true,
        trackingNumber: "TG88291044",
        /** Search Order carrier identity — no Shippit last-mile for this tracking. */
        carrierId: "australia-post",
        carrierTrackingUrl:
          "https://auspost.com.au/mypost/track/details/TG88291044",
        /** OMS dispatch timestamp — used for business-day age in standard tracking. */
        shippedAt: "2026-09-24T16:05:00+10:00",
        total: 36.0,
        packages: [
          {
            id: "target-s1-p1",
            index: 1,
            status: "Shipped",
            tracking: "TG88291044",
            allocations: [{ lineId: "towel", qtyInPackage: 2 }],
          },
          {
            id: "target-s1-p2",
            index: 2,
            status: "Shipped",
            tracking: "TG88291045",
            allocations: [{ lineId: "tee", qtyInPackage: 1 }],
          },
        ],
      },
    ],
  },
  {
    id: "marketplace",
    name: "Outdoor Living Hub",
    kind: "marketplace",
    delivery: "HD",
    /** Fulfilment status only — carrier last-mile not retrieved. */
    status: "Shipped",
    itemCount: 1,
    merchandiseTotal: 49.0,
    shipFrom: "Marketplace seller",
    shipToName: shipToBase.name,
    shipToAddress: shipToBase.address,
    shipments: [
      {
        id: "mp-ship-1",
        label: "Shipment 1",
        releaseId: "MP-774201",
        store: "MP",
        storeLabel: "Marketplace",
        itemCount: 1,
        status: "Shipped",
        shippingMethod: "Standard",
        tracked: true,
        trackingNumber: "AU44910283",
        /**
         * Standard carrier tracking: OMS Shipped + carrier link.
         * Do not infer Delivered from the external carrier page until retrieved.
         */
        carrierId: "australia-post",
        carrierTrackingUrl:
          "https://auspost.com.au/mypost/track/details/AU44910283",
        shippedAt: "2026-09-24T11:20:00+10:00",
        total: 49.0,
        packages: [
          {
            id: "mp-s1-p1",
            index: 1,
            status: "Shipped",
            tracking: "AU44910283",
            allocations: [{ lineId: "chair", qtyInPackage: 1 }],
          },
        ],
      },
    ],
  },
];


/** Shared customer for both selectable demo orders. */
const demoCustomer = hdCustomer;

/**
 * Mixed fulfilment demo — Order 452014820.
 * Kmart Click & Collect (Ready for collection) + Marketplace Home delivery (Shipped).
 * No Shippit last-mile for CNC; Marketplace uses standard carrier tracking.
 */
const cncMpOrder = {
  id: "452014820",
  date: "27 Sep 2026",
  status: "Ready for collection",
  type: "Mixed",
  delivery: "Mixed",
  source: "web",
  total: 66.0,
  shipping: 0,
  shippingRefunded: 0,
  shippingRemaining: 0,
  shippingRefundReason: null,
  shippingRefundDate: null,
  totalRefunded: 0,
  items: 4,
  claims: 0,
  unitsReady: 3,
  unitsShipped: 1,
  unitsDelivered: 0,
  merchandiseSubtotal: 66.0,
  orderTotalDisplay: 66.0,
  paymentMethod: "Visa",
  paymentLast4: "1234",
};

const cncMpLines = {
  uno: {
    id: "uno",
    name: "UNO Card Game",
    sku: "6225544",
    qty: 2,
    price: 6.0,
    subtotal: 12.0,
    status: "Ready for collection",
    refundable: true,
    thumb: "UN",
    image: "./assets/products/uno.jpg",
    shippingFee: null,
  },
  cards: {
    id: "cards",
    name: "52's Playing Cards",
    sku: "42999171",
    qty: 1,
    price: 5.0,
    subtotal: 5.0,
    status: "Ready for collection",
    refundable: true,
    thumb: "PC",
    image: "./assets/products/cards.png",
    shippingFee: null,
  },
  chair: {
    id: "chair",
    name: "Folding Camping Chair",
    sku: "MP-88421",
    qty: 1,
    price: 49.0,
    subtotal: 49.0,
    status: "Shipped",
    refundable: false,
    thumb: "CH",
    image: "./assets/products/chair.jpg",
    shippingFee: null,
  },
};

const cncMpSellers = [
  {
    id: "kmart",
    name: "Kmart",
    kind: "kmart",
    delivery: "CNC",
    status: "Ready for collection",
    itemCount: 3,
    merchandiseTotal: 17.0,
    collectionStore: "1014",
    shipFrom: "Kmart Store 1014",
    shipToName: hdShipTo.name,
    shipToAddress: hdShipTo.address,
    shipments: [
      {
        id: "kmart-cnc-1",
        label: "Collection",
        releaseId: "4520148201",
        store: "1014",
        itemCount: 3,
        status: "Ready for collection",
        shippingMethod: "Click & Collect",
        tracked: false,
        trackingNumber: null,
        shippedAt: null,
        readyAt: "2026-09-27T10:15:00+10:00",
        total: 17.0,
        packages: [
          {
            id: "kmart-cnc-p1",
            index: 1,
            status: "Ready for collection",
            tracking: null,
            allocations: [
              { lineId: "uno", qtyInPackage: 2 },
              { lineId: "cards", qtyInPackage: 1 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "marketplace",
    name: "Outdoor Living Hub",
    kind: "marketplace",
    delivery: "HD",
    status: "Shipped",
    itemCount: 1,
    merchandiseTotal: 49.0,
    shipFrom: "Marketplace seller",
    shipToName: hdShipTo.name,
    shipToAddress: hdShipTo.address,
    shipments: [
      {
        id: "mp-hd-1",
        label: "Shipment 1",
        releaseId: "MP-8842101",
        store: "MP",
        storeLabel: "Marketplace",
        itemCount: 1,
        status: "Shipped",
        shippingMethod: "Standard",
        tracked: true,
        trackingNumber: "AU55201993",
        carrierId: "australia-post",
        carrierTrackingUrl:
          "https://auspost.com.au/mypost/track/details/AU55201993",
        shippedAt: "2026-09-26T14:40:00+10:00",
        total: 49.0,
        packages: [
          {
            id: "mp-hd-p1",
            index: 1,
            status: "Shipped",
            tracking: "AU55201993",
            allocations: [{ lineId: "chair", qtyInPackage: 1 }],
          },
        ],
      },
    ],
  },
];

const cncMpDestinationService = {
  service: "Standard delivery",
  timeframeByRegion: KMART_HD_SERVICE_WINDOWS,
  appliesToKinds: ["marketplace"],
};

const DEMO_ORDER_HD = "451990612";
const DEMO_ORDER_CNC_MP = "452014820";

export const demoOrderIds = {
  HD_MULTI: DEMO_ORDER_HD,
  CNC_MP: DEMO_ORDER_CNC_MP,
};

export const demoOrders = {
  [DEMO_ORDER_HD]: {
    order: hdOrder,
    customer: demoCustomer,
    lines: hdLines,
    sellers: hdSellers,
    shipTo: hdShipTo,
    destinationService: hdDestinationService,
    refundHistory: hdRefundHistory,
    shippitByTracking: hdShippitByTracking,
  },
  [DEMO_ORDER_CNC_MP]: {
    order: cncMpOrder,
    customer: demoCustomer,
    lines: cncMpLines,
    sellers: cncMpSellers,
    shipTo: hdShipTo,
    destinationService: cncMpDestinationService,
    refundHistory: [],
    shippitByTracking: {},
  },
};

/** Active order workspace — swapped when Care opens a selectable demo from history. */
export let order = hdOrder;
export let customer = demoCustomer;
export let lines = hdLines;
export let sellers = hdSellers;
export let shipTo = hdShipTo;
export let destinationService = hdDestinationService;
export let refundHistory = hdRefundHistory;
export let shippitByTracking = hdShippitByTracking;
export let activeDemoOrderId = DEMO_ORDER_HD;

export function loadDemoOrder(id) {
  const demo = demoOrders[id];
  if (!demo) return false;
  order = demo.order;
  customer = demo.customer;
  lines = demo.lines;
  sellers = demo.sellers;
  shipTo = demo.shipTo;
  destinationService = demo.destinationService;
  refundHistory = demo.refundHistory;
  shippitByTracking = demo.shippitByTracking;
  activeDemoOrderId = id;
  return true;
}

export function isSelectableDemoOrder(id) {
  return Object.prototype.hasOwnProperty.call(demoOrders, id);
}

/** Demo focus: delayed + stale scans → Needs investigation (kmart-ship-3). */
export const DEMO_DELAYED_SHIPMENT_ID = "kmart-ship-3";

/**
 * Mock Order History results for a contact-based customer search.
 * Names deliberately vary — search key (email) is the page anchor, not a single customer name.
 * `products` = unique product image paths for order recognition (not quantities).
 */
export const orderSearchResults = [
  {
    id: "452013509",
    placedAt: "2026-09-28",
    customerName: "Haroon Khan",
    email: "kmaorderkoms@gmail.com",
    phone: "0451578523",
    brand: "Kmart",
    delivery: "Click & Collect",
    status: "Fulfilled",
    total: 550.0,
    products: [
      "./assets/products/tramp.jpg",
      "./assets/products/uno.jpg",
      "./assets/products/towel.jpg",
      "./assets/products/tee.jpg",
      "./assets/products/cards.png",
    ],
  },
  {
    id: "452014820",
    placedAt: "2026-09-27",
    customerName: "Mason Conway",
    email: "kmaorderkoms@gmail.com",
    phone: "0466962766",
    brand: "Kmart",
    delivery: "Click & Collect + Home delivery",
    status: "Ready for collection",
    total: 66.0,
    products: [
      "./assets/products/uno.jpg",
      "./assets/products/cards.png",
      "./assets/products/chair.jpg",
    ],
    selectable: true,
  },
  {
    id: "452011548",
    placedAt: "2026-09-28",
    customerName: "HDSRB Pasta",
    email: "kmaorderkoms@gmail.com",
    phone: "0451578523",
    brand: "Kmart",
    delivery: "Home delivery",
    status: "Fulfilled",
    total: 45.0,
    products: ["./assets/products/towel.jpg", "./assets/products/tee.jpg"],
  },
  {
    id: "452011520",
    placedAt: "2026-09-27",
    customerName: "Rahul Jain",
    email: "kmaorderkoms@gmail.com",
    phone: "0411222333",
    brand: "Target Marketplace",
    delivery: "Home delivery",
    status: "Fulfilled",
    /** Marketplace total not returned for this order type — show em dash, not $0.00. */
    total: null,
    products: ["./assets/products/chair.jpg"],
  },
  {
    id: "451990612",
    selectable: true,
    placedAt: "2026-09-21",
    customerName: "Mason Conway",
    email: "kmaorderkoms@gmail.com",
    phone: "0466962766",
    brand: "Kmart",
    delivery: "Home delivery",
    status: "Partially shipped",
    total: 1032.88,
    products: [
      "./assets/products/tramp.jpg",
      "./assets/products/uno.jpg",
      "./assets/products/cards.png",
      "./assets/products/towel.jpg",
      "./assets/products/tee.jpg",
      "./assets/products/chair.jpg",
    ],
  },
  {
    id: "451988201",
    placedAt: "2026-09-18",
    customerName: "Haroon Khan",
    email: "kmaorderkoms@gmail.com",
    phone: "0451578523",
    brand: "Kmart",
    delivery: "Home delivery",
    status: "Delivered",
    total: 89.0,
    products: ["./assets/products/uno.jpg", "./assets/products/cards.png", "./assets/products/tee.jpg"],
  },
  {
    id: "451970114",
    placedAt: "2026-09-10",
    customerName: "Aisha Rahman",
    email: "kmaorderkoms@gmail.com",
    phone: "0400111222",
    brand: "Kmart",
    delivery: "Click & Collect",
    status: "Cancelled",
    total: 32.5,
    products: ["./assets/products/cards.png"],
  },
  {
    id: "451955002",
    placedAt: "2026-08-30",
    customerName: "Haroon Khan",
    email: "kmaorderkoms@gmail.com",
    phone: "0451578523",
    brand: "Kmart",
    delivery: "Home delivery",
    status: "Delivered",
    total: 126.4,
    products: [
      "./assets/products/towel.jpg",
      "./assets/products/tee.jpg",
      "./assets/products/uno.jpg",
      "./assets/products/chair.jpg",
    ],
  },
];
