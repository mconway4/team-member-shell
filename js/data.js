/**
 * Frozen fixture from current Team Member screens — Order 451990612.
 * Visual refresh only; field names/values intentionally unchanged.
 */
export const agent = { name: "Mason Conway" };

export const customer = {
  name: "Mason Conway",
  email: "mason.conway@kmart.com.au",
  emailShort: "mason.conway@kmart.co…",
  phone: "0466962766",
};

export const order = {
  id: "451990612",
  date: "Sep 21, 2026",
  status: "Released",
  type: "Kmart",
  delivery: "HD",
  source: "web",
  total: 914.93,
  shipping: 76.93,
  shippingRefunded: 23.0,
  shippingRemaining: 53.93,
  shippingRefundReason: "Delayed",
  shippingRefundDate: "23 Sept 2026",
  items: 7,
  claims: 0,
  unitsReady: 7,
  merchandiseSubtotal: 861.0,
  orderTotalDisplay: 937.93,
};

export const seller = {
  name: "Kmart",
  store: "1014",
  storeLabel: "Kmart Store 1014",
  delivery: "HD",
  ordered: "Sep 21, 2026",
  itemCount: 7,
  merchandiseTotal: 861.0,
  status: "Ready for Picking",
  shipFrom: "Kmart Store 1014",
  shipToName: "Mason Conway",
  shipToAddress: "690 Springvale Rd, MULGRAVE VIC 3170",
};

export const shipment = {
  id: "1",
  label: "Shipment 1",
  releaseId: "4519906121",
  store: "1014",
  itemCount: 7,
  status: "Ready for Picking",
  shippingMethod: "Standard",
  tracked: false,
  total: 861.0,
  steps: [
    { id: "created", label: "Created", state: "done" },
    { id: "released", label: "Released", state: "current" },
    { id: "packed", label: "Packed", state: "todo" },
    { id: "shipped", label: "Shipped", state: "todo" },
    { id: "delivered", label: "Delivered", state: "todo" },
  ],
  lines: [
    {
      id: "tramp",
      name: "12 Foot Springless Trampoline",
      sku: "42836155",
      qty: 3,
      price: 279.0,
      subtotal: 837.0,
      status: "Ready for Picking",
      refundable: false,
      thumb: "TR",
      shippingFee: {
        name: "Big & bulky shipping fee",
        original: 76.93,
        refunded: 23.0,
        remaining: 53.93,
        status: "Partially refunded",
        meta: "Delayed · 23 Sept 2026",
        refundable: true,
      },
    },
    {
      id: "uno",
      name: "UNO Card Game",
      sku: "6225544",
      qty: 4,
      price: 6.0,
      subtotal: 24.0,
      status: "Ready for Picking",
      refundable: false,
      thumb: "UN",
      shippingFee: null,
    },
  ],
};
