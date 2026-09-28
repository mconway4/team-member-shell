import { agent, customer, order, seller, shipment } from "./data.js";

const money = (n) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

const state = {
  view: "detail", // detail | track | refund
  shippingSelected: false,
  orderReason: "",
};

const icons = {
  user: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`,
  mail: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  phone: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7A2 2 0 0 1 22 16.9z"/></svg>`,
  box: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>`,
  copy: `<svg class="copy" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  truck: `<svg width="16" height="14" viewBox="0 0 24 16" fill="none" aria-hidden="true"><path d="M1 4h14v9H1V4zm14 2h4l3 3v4h-7V6zM5 15.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm12 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" stroke="currentColor" stroke-width="1.5"/></svg>`,
  store: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9 12 3l9 6"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
};

function chip(icon, label, copyValue) {
  return `<button type="button" class="chip" data-copy="${copyValue}" title="Copy ${label}">
    ${icon}<span>${label}</span>${icons.copy}
  </button>`;
}

function crumbs() {
  const trail = {
    detail: [
      ["Order Search", "#"],
      ["Order History", "#"],
      [`Order ${order.id}`, null],
    ],
    track: [
      ["Order Search", "#"],
      ["Order History", "#"],
      [`Order ${order.id}`, "detail"],
      ["Track Order", null],
    ],
    refund: [
      ["Order Search", "#"],
      [`Order ${order.id}`, "detail"],
      ["Refund Request", null],
    ],
  }[state.view];

  return trail
    .map((part, i) => {
      const [label, target] = part;
      if (target === null) return `<span class="here">${label}</span>`;
      if (target === "#") return `<span>${label}</span><span>/</span>`;
      return `<a href="#" data-view="${target}" style="color:inherit;text-decoration:none">${label}</a><span>/</span>`;
    })
    .join("");
}

function identity() {
  return `
    <div class="identity">
      ${chip(icons.user, customer.name, customer.name)}
      ${chip(icons.mail, customer.emailShort, customer.email)}
      ${chip(icons.phone, customer.phone, customer.phone)}
      ${chip(icons.box, order.id, order.id)}
    </div>`;
}

function viewNav() {
  const tabs = [
    ["detail", "Order detail"],
    ["track", "Track"],
    ["refund", "Refund"],
  ];
  return `
    <nav class="views" aria-label="Order views">
      ${tabs
        .map(
          ([id, label]) =>
            `<button type="button" data-view="${id}" aria-current="${state.view === id ? "page" : "false"}">${label}</button>`
        )
        .join("")}
    </nav>`;
}

function hero(opts = {}) {
  const { showSource = true, showClaims = false, showShipping = false } = opts;
  return `
    <section class="card card-accent card-pad">
      <div class="hero">
        <div class="hero-main">
          <h1>Order ${order.id}</h1>
          <p class="sub">${customer.name} · ${order.date}</p>
          <div class="units-line">
            <strong>${order.items} units</strong>
            <span class="badge badge-amber">${order.unitsReady} Ready for Picking</span>
          </div>
        </div>
        <div class="hero-status">
          <span class="badge badge-amber">${order.status}</span>
        </div>
      </div>
      <div class="facts">
        <div class="fact"><span class="label">Type</span><span class="value">${order.type}</span></div>
        <div class="fact"><span class="label">Delivery</span><span class="value">${order.delivery}</span></div>
        ${showSource ? `<div class="fact"><span class="label">Source</span><span class="value">${order.source}</span></div>` : ""}
        <div class="fact-split" aria-hidden="true"></div>
        <div class="fact"><span class="label">Total</span><span class="value money">${money(order.total)}</span></div>
        ${showShipping ? `<div class="fact"><span class="label">Shipping</span><span class="value">${money(order.shipping)}</span></div>` : ""}
        <div class="fact"><span class="label">Items</span><span class="value">${order.items}</span></div>
        ${showClaims ? `<div class="fact"><span class="label">Claims</span><span class="value">${order.claims}</span></div>` : ""}
      </div>
    </section>`;
}

function itemRows({ refundMode = false } = {}) {
  return shipment.lines
    .map((line) => {
      const blocked = refundMode && !line.refundable;
      const fee = line.shippingFee;
      const productRow = `
        <tr class="${blocked ? "row-blocked" : ""}">
          ${
            refundMode
              ? `<td><input class="checkbox" type="checkbox" disabled aria-label="Not refundable yet" /></td>`
              : ""
          }
          <td>
            <div class="item-cell">
              <div class="thumb">${line.thumb}</div>
              <div>
                <div class="item-name">${line.name}</div>
                <div class="item-sku">SKU ${line.sku}</div>
                ${blocked ? `<div class="blocked">Refunds are only available for packed, shipped, or delivered items</div>` : ""}
              </div>
            </div>
          </td>
          ${refundMode ? `<td>${line.qty}</td><td class="muted-dash">—</td><td class="muted-dash">—</td>` : ""}
          ${refundMode ? "" : `<td>${line.sku}</td>`}
          ${refundMode ? "" : `<td><span class="badge badge-neutral">${line.status}</span></td>`}
          ${refundMode ? "" : `<td class="num">${line.qty}</td>`}
          <td class="num">${money(line.price)}</td>
          <td class="num">${refundMode ? money(0) : money(line.subtotal)}</td>
        </tr>`;

      let feeRow = "";
      if (fee && refundMode) {
        feeRow = `
          <tr class="fee-row">
            <td class="fee-select">
              <input
                class="checkbox"
                type="checkbox"
                data-action="ship-fee"
                ${state.shippingSelected ? "checked" : ""}
                aria-label="Refund ${fee.name}"
              />
            </td>
            <td>
              <div class="fee-cell">
                <span class="fee-indent" aria-hidden="true">↳</span>
                <div>
                  <div class="fee-name">
                    ${icons.truck}
                    ${fee.name}
                    <span class="badge badge-amber">${fee.status}</span>
                  </div>
                  <div class="fee-meta">
                    ${money(fee.original)} original · ${money(fee.refunded)} refunded · ${money(fee.remaining)} remaining · ${fee.meta}
                  </div>
                </div>
              </div>
            </td>
            <td class="muted-dash">—</td>
            <td class="muted-dash">—</td>
            <td>
              ${
                state.shippingSelected
                  ? `<select class="select" style="max-width:160px" data-action="ship-reason">
                      <option>Delivery delay</option>
                      <option>Damaged</option>
                      <option>Customer request</option>
                    </select>`
                  : `<span style="color:var(--muted)">—</span>`
              }
            </td>
            <td class="num">${money(fee.remaining)}</td>
            <td class="num">${money(state.shippingSelected ? fee.remaining : 0)}</td>
          </tr>`;
      }

      return productRow + feeRow;
    })
    .join("");
}

function itemsTable({ refundMode = false } = {}) {
  if (refundMode) {
    return `
      <div class="table-wrap">
        <table class="items">
          <thead>
            <tr>
              <th style="width:36px"></th>
              <th>Item</th>
              <th>In package</th>
              <th>Select qty</th>
              <th>Reason</th>
              <th class="num">Refund amount</th>
              <th class="num">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemRows({ refundMode: true })}</tbody>
        </table>
      </div>`;
  }
  return `
    <div class="table-wrap">
      <table class="items">
        <thead>
          <tr>
            <th>Item</th>
            <th>SKU</th>
            <th>Status</th>
            <th class="num">Qty</th>
            <th class="num">Price</th>
            <th class="num">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows({ refundMode: false })}</tbody>
      </table>
    </div>
    <div class="ship-total">
      <span class="label">Shipment total</span>
      <span class="amount">${money(shipment.total)}</span>
    </div>`;
}

function sellerBlock({ track = false, refundMode = false } = {}) {
  return `
    <div class="section-label">
      <span>${icons.store} Seller</span>
      <span>1 seller · ${seller.itemCount} items</span>
    </div>
    <section class="card">
      <div class="seller-head">
        <div>
          <div class="seller-title">
            ${seller.name}
            <span class="badge badge-hd">${seller.delivery}</span>
            <span style="font-weight:600;color:var(--text-secondary)">Store ${seller.store}</span>
          </div>
          <div class="seller-meta">Ordered ${seller.ordered} · ${seller.itemCount} items · ${money(seller.merchandiseTotal)}</div>
        </div>
        <span class="badge badge-neutral">${seller.status}</span>
      </div>
      ${
        track
          ? `<div class="addr-grid">
              <div>
                <div class="label">Shipped from</div>
                <div class="value">${seller.shipFrom}</div>
                <a href="#" onclick="return false">View store</a>
              </div>
              <div>
                <div class="label">Ship to</div>
                <div class="value">${seller.shipToName}</div>
                <div class="detail">${seller.shipToAddress}</div>
              </div>
            </div>`
          : ""
      }
      <div class="section-label" style="margin:12px 16px 0;text-transform:none;letter-spacing:0;font-size:12px;font-weight:600">
        <span>1 shipment · ${shipment.itemCount} items</span>
      </div>
      ${!shipment.tracked && track ? `<div class="untracked">${icons.truck} Untracked</div>` : ""}
      <div class="ship-head" style="margin-top:8px;border-radius:0">
        ${
          refundMode
            ? `<input class="checkbox" type="checkbox" disabled title="No refundable merchandise in this shipment" />`
            : ""
        }
        <h3>${shipment.label}${refundMode ? ` — ${shipment.store}` : ""}</h3>
        <span class="badge badge-neutral">${shipment.status}</span>
        <div class="ship-meta">
          <span>Release ID: ${shipment.releaseId}</span>
          <span class="store">Store: ${shipment.store}</span>
          <span>${shipment.itemCount} items</span>
          ${track ? `<span class="badge badge-teal">${shipment.shippingMethod}</span>` : ""}
        </div>
      </div>
      ${
        track
          ? `<div class="stepper">
              <div class="stepper-line"><div class="stepper-line-fill"></div></div>
              ${shipment.steps
                .map(
                  (s) => `
                <div class="step ${s.state}">
                  <div class="step-dot"></div>
                  <div class="step-label">${s.label}</div>
                </div>`
                )
                .join("")}
            </div>`
          : ""
      }
      ${
        refundMode
          ? `<div class="pkg-bar">
              <input class="checkbox" type="checkbox" disabled />
              Loose items · Store ${seller.store}
              <span class="muted">${order.items} units in package</span>
            </div>`
          : ""
      }
      ${itemsTable({ refundMode })}
    </section>`;
}

function totals({ refundMode = false } = {}) {
  const selected = state.shippingSelected ? order.shippingRemaining : 0;
  return `
    <section class="card totals">
      <div class="totals-row"><span>Subtotal (${order.items} items)</span><span>${money(order.merchandiseSubtotal)}</span></div>
      <div class="totals-row"><span>${icons.truck} Shipping</span><span>${money(order.shipping)}</span></div>
      <div class="totals-row credit"><span>Shipping refunded · ${order.shippingRefundReason}</span><span>−${money(order.shippingRefunded)}</span></div>
      ${
        refundMode
          ? `<div class="totals-row grand"><span>Refund total</span><span>${money(selected)}</span></div>`
          : `<div class="totals-row grand"><span>Order total</span><span>${money(order.orderTotalDisplay)}</span></div>`
      }
    </section>`;
}

function renderDetail() {
  return `
    ${hero({ showSource: true })}
    ${sellerBlock({ track: false })}
    ${totals()}`;
}

function renderTrack() {
  return `
    ${hero({ showSource: false, showClaims: true, showShipping: true })}
    <section class="card card-pad" style="margin-bottom:12px">
      <h2 style="margin:0 0 12px;font-size:15px">Customer &amp; delivery preferences</h2>
      <div class="addr-grid" style="padding:0;border:none">
        <div>
          <div class="label">Name</div>
          <div class="value">${customer.name}</div>
          <div class="label" style="margin-top:10px">Phone</div>
          <div class="value">${customer.phone}</div>
        </div>
        <div>
          <div class="label">Email</div>
          <div class="value">${customer.email}</div>
        </div>
      </div>
    </section>
    ${sellerBlock({ track: true })}`;
}

function renderRefund() {
  const selectedAmt = state.shippingSelected ? order.shippingRemaining : 0;
  const selectedCount = state.shippingSelected ? 1 : 0;
  return `
    <div class="field-block card card-pad">
      <label for="order-reason">Order-level refund reason</label>
      <select id="order-reason" class="select" data-action="order-reason">
        <option value="">Please select</option>
        <option>Damaged</option>
        <option>Delivery delay</option>
        <option>Customer request</option>
      </select>
      <p class="help">Not needed for a shipping-only refund — shipping charges carry their own reason.</p>
    </div>

    <div class="select-head">
      <div>
        <h2>Select items to refund</h2>
        <p class="help">What’s actionable is highlighted. Blocked merchandise stays visible for context.</p>
      </div>
      <div class="pill-count">${selectedCount} charge · ${money(selectedAmt)}</div>
    </div>

    <div class="banner">
      <div>${icons.truck}</div>
      <div>
        <strong>Shipping fee of ${money(order.shippingRemaining)} can be refunded</strong>
        Nothing on this order has been delivered or collected, so no item can be refunded yet. The shipping fee below can still be refunded on its own.
      </div>
    </div>

    ${sellerBlock({ refundMode: true })}
    ${totals({ refundMode: true })}
    <div class="actions">
      <button class="btn btn-primary" data-action="submit" ${!state.shippingSelected ? "disabled" : ""}>Process refund</button>
      <button class="btn btn-secondary" data-action="cancel">Cancel</button>
    </div>`;
}

function render() {
  const root = document.getElementById("root");
  const body =
    state.view === "detail"
      ? renderDetail()
      : state.view === "track"
        ? renderTrack()
        : renderRefund();

  root.innerHTML = `
    <div class="app">
      <div class="proto-bar">
        <div>
          <strong>Team Member order shell — usability refresh</strong>
          <p>Same fields and order data. Redesigned for faster scanning and lower AHT: sticky identity, answer-first hero, clearer hierarchy, refund path that surfaces what’s actionable.</p>
        </div>
      </div>
      <div class="top">
        <div class="crumbs">${crumbs()}</div>
        <div class="agent">${agent.name}</div>
      </div>
      ${identity()}
      ${viewNav()}
      ${body}
    </div>
    <div class="toast" id="toast">Copied</div>
  `;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 1200);
}

document.getElementById("root").addEventListener("click", (e) => {
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    navigator.clipboard?.writeText(copyBtn.getAttribute("data-copy"));
    showToast("Copied");
    return;
  }

  const viewBtn = e.target.closest("[data-view]");
  if (viewBtn) {
    e.preventDefault();
    state.view = viewBtn.getAttribute("data-view");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const action = e.target.getAttribute("data-action");
  if (action === "ship-fee") {
    state.shippingSelected = e.target.checked;
    render();
  }
  if (action === "cancel") {
    state.shippingSelected = false;
    render();
  }
  if (action === "submit") {
    showToast(`Refund ${money(order.shippingRemaining)} recorded (prototype)`);
  }
});

document.getElementById("root").addEventListener("change", (e) => {
  if (e.target.getAttribute("data-action") === "ship-fee") {
    state.shippingSelected = e.target.checked;
    render();
  }
});

render();
