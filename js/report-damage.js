/**
 * Report damage workflow — Refund-like selection + evidence branching.
 * Imported by app.js; receives shared helpers via bindReportDamage(ctx).
 */

export const DAMAGE_TYPES = [
  "Item arrived damaged",
  "Item is defective",
  "Missing parts or accessories",
  "Packaging damaged",
  "Other",
];

export function emptyDamageState() {
  return {
    step: "select",
    items: {},
    itemTypes: {},
    evidencePath: null,
    requestChannel: "sms",
    notes: "",
    photoCount: 0,
    outcome: "resolved",
    attested: false,
    result: null,
  };
}

/**
 * @param {object} ctx — shared shell helpers + mutable state accessor
 */
export function bindReportDamage(ctx) {
  const {
    getState,
    money,
    icons,
    shippitByTracking,
    displayShipmentStatus,
    statusBadge,
    copyControl,
    productThumbHtml,
    packageHeadingText,
    storeMeta,
    serviceLabel,
    checkboxTriHtml,
    allocKey,
    workflowHead,
    workspace,
    createAndLinkCase,
    linkedCase,
    reviewCaseDestinationHtml,
    formatPhone,
    sellerRefundsInMirakl,
  } = ctx;

  const customer = () => ctx.customer;
  const order = () => ctx.order;
  const lines = () => ctx.lines;
  const sellers = () => ctx.sellers;

  function damage() {
    return getState().damage;
  }

  function resetDamageDraft() {
    getState().damage = emptyDamageState();
  }

  function shipmentIsDelivered(ship, seller) {
    const display = displayShipmentStatus(ship, seller, shippitByTracking);
    const s = String(display.label || ship.status || "").toLowerCase();
    return (
      s.includes("deliver") &&
      !s.includes("attempt") &&
      !s.includes("unsuccessful")
    );
  }

  function damageEligibleInPackage(pkg) {
    return (pkg.allocations || [])
      .map((alloc) => {
        const line = lines()[alloc.lineId];
        /** Merchandise only — nested shippingFee on a product line is not a fee row. */
        if (!line) return null;
        return {
          alloc,
          line,
          key: allocKey(pkg.id, alloc.lineId),
          maxQty: alloc.qtyInPackage,
        };
      })
      .filter(Boolean);
  }

  function damageEligibleInShipment(ship) {
    return ship.packages.flatMap((pkg) =>
      damageEligibleInPackage(pkg).map((entry) => ({ ...entry, pkg }))
    );
  }

  function damageItemQty(key) {
    return damage().items[key] || 0;
  }

  function damageItemType(key) {
    return damage().itemTypes[key] || "";
  }

  function setDamageItemQty(key, qty, maxQty) {
    const d = damage();
    const next = Math.max(0, Math.min(Number(qty) || 0, maxQty));
    if (next <= 0) {
      delete d.items[key];
      delete d.itemTypes[key];
    } else {
      d.items[key] = next;
      /** Damage type stays blank until the agent chooses — required to continue. */
    }
  }

  function setDamageItemType(key, value) {
    if (!key || !damage().items[key]) return;
    damage().itemTypes[key] = value || "";
  }

  function damagePackageSelectState(ship, pkg) {
    const entries = damageEligibleInPackage(pkg);
    if (!entries.length) return "empty";
    const parts = entries.map((e) => damageItemQty(e.key) > 0);
    const selected = parts.filter(Boolean).length;
    if (!selected) return "none";
    if (selected === parts.length) return "all";
    return "some";
  }

  function damageShipmentSelectState(ship) {
    const entries = damageEligibleInShipment(ship);
    if (!entries.length) return "empty";
    const parts = entries.map((e) => damageItemQty(e.key) > 0);
    const selected = parts.filter(Boolean).length;
    if (!selected) return "none";
    if (selected === parts.length) return "all";
    return "some";
  }

  function selectAllDamageInPackage(ship, pkg, on) {
    for (const entry of damageEligibleInPackage(pkg)) {
      setDamageItemQty(entry.key, on ? entry.maxQty : 0, entry.maxQty);
    }
  }

  function selectAllDamageInShipment(ship, on) {
    for (const pkg of ship.packages) {
      selectAllDamageInPackage(ship, pkg, on);
    }
  }

  function damageSelectionSummary() {
    const rows = [];
    let amount = 0;
    let units = 0;
    for (const seller of sellers()) {
      for (const ship of seller.shipments) {
        if (!shipmentIsDelivered(ship, seller)) continue;
        for (const pkg of ship.packages) {
          for (const entry of damageEligibleInPackage(pkg)) {
            const qty = damageItemQty(entry.key);
            if (!qty) continue;
            const lineAmount = entry.line.price * qty;
            amount += lineAmount;
            units += qty;
            rows.push({
              key: entry.key,
              label: `${entry.line.name} ×${qty}`,
              damageType: damageItemType(entry.key) || "Select damage type",
              amount: lineAmount,
              line: entry.line,
              qty,
            });
          }
        }
      }
    }
    return { rows, amount, units };
  }

  function damageSelectReady() {
    const { rows } = damageSelectionSummary();
    if (!rows.length) return false;
    return rows.every((r) => DAMAGE_TYPES.includes(r.damageType));
  }

  function damageHasDraft() {
    const d = damage();
    if (d.step === "done") return false;
    if (Object.keys(d.items || {}).length) return true;
    if (d.evidencePath) return true;
    if (String(d.notes || "").trim()) return true;
    if (d.photoCount > 0) return true;
    if (d.attested) return true;
    return false;
  }

  function damageTypeOptionsHtml(selected) {
    const blank = !selected
      ? `<option value="" selected>Select damage type</option>`
      : "";
    return (
      blank +
      DAMAGE_TYPES.map(
        (t) =>
          `<option value="${t}" ${t === selected ? "selected" : ""}>${t}</option>`
      ).join("")
    );
  }

  function damageQtyControlsHtml(key, maxQty, selectedQty) {
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
        <select class="select select-compact select-qty" data-action="damage-item-qty" data-key="${key}" data-max="${maxQty}">
          ${qtyOptions}
        </select>
      </label>`;
  }

  function damageTypeControlsHtml(key) {
    const effective = damageItemType(key);
    return `
      <label class="refund-config-field refund-config-reason">
        <span>Damage type <span class="optional-tag">Required</span></span>
        <select class="select select-compact select-reason" data-action="damage-item-type" data-key="${key}">
          ${damageTypeOptionsHtml(effective)}
        </select>
      </label>`;
  }

  function damageItemRowHtml(ship, pkg, entry) {
    const selectedQty = damageItemQty(entry.key);
    const selected = selectedQty > 0;
    const config = selected
      ? `<div class="refund-item-config">
          ${damageQtyControlsHtml(entry.key, entry.maxQty, selectedQty)}
          ${damageTypeControlsHtml(entry.key)}
        </div>`
      : "";

    return `
      <div class="refund-item damage-item${selected ? " is-selected" : ""}">
        <div class="refund-item-main">
          <input
            class="checkbox"
            type="checkbox"
            data-action="damage-toggle-item"
            data-key="${entry.key}"
            data-max="${entry.maxQty}"
            ${selected ? "checked" : ""}
            aria-label="Select ${entry.line.name}"
          />
          <div class="item-cell">
            ${productThumbHtml(entry.line)}
            <div class="pkg-item-body">
              <div class="item-name">${entry.line.name} <span class="item-qty-inline">×${entry.maxQty}</span></div>
              <div class="item-meta-line">SKU ${entry.line.sku} · ${money(entry.line.price)} each</div>
              ${config}
            </div>
          </div>
        </div>
      </div>`;
  }

  function damagePackageBlockHtml(ship, pkg, packageTotal) {
    const entries = damageEligibleInPackage(pkg);
    if (!entries.length) return "";
    const tri = damagePackageSelectState(ship, pkg);
    const showHeader = packageTotal > 1;
    const title = packageHeadingText(pkg, packageTotal);
    const head = showHeader
      ? `<div class="package-label refund-pkg-head">
          ${checkboxTriHtml({
            action: "damage-toggle-pkg",
            attrs: `data-ship="${ship.id}" data-pkg="${pkg.id}"`,
            state: tri,
            label: `Select ${title}`,
            hideWhenEmpty: true,
            disabled: false,
          })}
          <span class="package-title">${title}</span>
        </div>`
      : "";

    return `
      <div class="package-group refund-pkg${!showHeader ? " is-headerless" : ""}">
        ${head}
        <div class="package-items refund-pkg-items">
          ${entries.map((entry) => damageItemRowHtml(ship, pkg, entry)).join("")}
        </div>
      </div>`;
  }

  function damageShipmentBlockHtml(ship, seller) {
    if (!shipmentIsDelivered(ship, seller)) return "";
    const display = displayShipmentStatus(ship, seller, shippitByTracking);
    const pkgTotal = ship.packages.length;
    const tri = damageShipmentSelectState(ship);
    const body = ship.packages
      .map((pkg) => damagePackageBlockHtml(ship, pkg, pkgTotal))
      .filter(Boolean)
      .join("");
    if (!body) return "";

    return `
      <div class="shipment-block shipment-block-refund">
        <div class="refund-ship-head">
          <div class="refund-ship-title-row">
            ${checkboxTriHtml({
              action: "damage-toggle-ship",
              attrs: `data-ship="${ship.id}"`,
              state: tri,
              label: `Select ${ship.label}`,
              hideWhenEmpty: true,
              disabled: false,
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
        <div class="refund-ship-body package-stack refund-pkg-stack">${body}</div>
      </div>`;
  }

  function damageSellersHtml() {
    return sellers()
      .map((seller) => {
        if (sellerRefundsInMirakl?.(seller)) return "";
        const ships = seller.shipments
          .map((ship) => damageShipmentBlockHtml(ship, seller))
          .filter(Boolean)
          .join("");
        if (!ships) return "";
        return `
          <section class="card seller-card seller-card-refund">
            <div class="seller-head">
              <div class="seller-head-main">
                <div class="seller-title">${seller.name}</div>
              </div>
            </div>
            <div class="seller-body">${ships}</div>
          </section>`;
      })
      .filter(Boolean)
      .join("");
  }

  function damageStepIndicator(current) {
    const steps = [
      { id: "select", label: "Select damage" },
      { id: "evidence", label: "Photo evidence" },
      { id: "review", label: "Review" },
    ];
    const d = damage();
    const activeId =
      current === "upload" || current === "request"
        ? "evidence"
        : current === "done"
          ? "review"
          : current;
    /** Request-photos path never reaches Review. */
    const visible =
      d.evidencePath === "request"
        ? steps.filter((s) => s.id !== "review")
        : steps;

    return `
      <ol class="damage-steps" aria-label="Report damage steps">
        ${visible
          .map((s, i) => {
            const done =
              (s.id === "select" && activeId !== "select") ||
              (s.id === "evidence" &&
                (activeId === "review" || activeId === "done"));
            const currentStep = s.id === activeId;
            return `
              <li class="damage-step${currentStep ? " is-current" : ""}${
                done ? " is-done" : ""
              }">
                <span class="damage-step-num">${i + 1}</span>
                <span class="damage-step-label">${s.label}</span>
              </li>`;
          })
          .join("")}
      </ol>`;
  }

  function damageWorkflowHead() {
    return workflowHead({
      title: `Report damage — Order ${order().id}`,
      linkLabel: "Link case",
    });
  }

  function renderDamageSelect() {
    const summary = damageSelectionSummary();
    const ready = damageSelectReady();
    const tree = damageSellersHtml();
    const needsType =
      summary.units > 0 &&
      summary.rows.some((r) => !DAMAGE_TYPES.includes(r.damageType));
    return `
      ${damageWorkflowHead()}
      ${damageStepIndicator("select")}
      <section class="card card-pad refund-build">
        <div class="select-head select-head-inline">
          <div>
            <h2>Select damaged merchandise</h2>
            <p class="help">Select delivered items and quantities. Choose a damage type for each item before continuing.</p>
          </div>
          <div class="pill-count">${
            summary.units
              ? `${summary.units} unit${summary.units === 1 ? "" : "s"} selected`
              : "Nothing selected"
          }</div>
        </div>
      </section>
      ${
        tree ||
        `<section class="card card-pad"><p class="help">No delivered merchandise is available to report as damaged on this order.</p></section>`
      }
      <div class="actions refund-confirm-actions">
        <button class="btn btn-secondary" data-action="back-to-order">Cancel</button>
        <button
          class="btn btn-primary"
          data-action="damage-next-evidence"
          ${!ready ? "disabled" : ""}
          ${needsType ? 'title="Choose a damage type for each selected item"' : ""}
        >Continue</button>
      </div>
      ${
        needsType
          ? `<p class="help refund-confirm-hint">Choose a damage type for each selected item to continue.</p>`
          : ""
      }`;
  }

  function renderDamageEvidence() {
    const path = damage().evidencePath;
    return `
      ${damageWorkflowHead()}
      ${damageStepIndicator("evidence")}
      <section class="card card-pad damage-evidence" aria-label="Photo evidence">
        <h2 class="damage-section-title">Photo evidence</h2>
        <div class="create-case-scope-options" role="radiogroup" aria-label="Photo evidence">
          <label class="create-case-scope-option${
            path === "upload" ? " is-selected" : ""
          }">
            <input
              type="radio"
              name="damage-evidence-path"
              value="upload"
              data-action="damage-evidence-path"
              ${path === "upload" ? "checked" : ""}
            />
            <span class="create-case-scope-option-body">
              <span class="create-case-scope-option-title">Yes — upload photos now</span>
              <span class="create-case-scope-option-meta">Attach evidence and continue to review and refund.</span>
            </span>
          </label>
          <label class="create-case-scope-option${
            path === "request" ? " is-selected" : ""
          }">
            <input
              type="radio"
              name="damage-evidence-path"
              value="request"
              data-action="damage-evidence-path"
              ${path === "request" ? "checked" : ""}
            />
            <span class="create-case-scope-option-body">
              <span class="create-case-scope-option-title">No — request photos from customer</span>
              <span class="create-case-scope-option-meta">Create an open damage case and send an upload link.</span>
            </span>
          </label>
        </div>
      </section>
      <div class="actions refund-confirm-actions">
        <button class="btn btn-secondary" data-action="damage-back-select">Back</button>
        <button class="btn btn-primary" data-action="damage-next-from-evidence" ${
          !path ? "disabled" : ""
        }>Continue</button>
      </div>`;
  }

  function renderDamageUpload() {
    const d = damage();
    const notesOk = String(d.notes || "").trim().length > 0;
    const photosOk = d.photoCount > 0;
    return `
      ${damageWorkflowHead()}
      ${damageStepIndicator("upload")}
      <section class="card card-pad damage-upload" aria-label="Upload photos">
        <h2 class="damage-section-title">Upload photos</h2>
        <button type="button" class="damage-dropzone" data-action="damage-add-photo">
          <span class="damage-dropzone-title">${
            d.photoCount
              ? `${d.photoCount} photo${d.photoCount === 1 ? "" : "s"} attached`
              : "Drop photos here or click to upload"
          }</span>
          <span class="damage-dropzone-meta">Prototype — click to attach a sample photo</span>
        </button>
        <div class="create-case-field create-case-field-notes">
          <label for="damage-notes">Case notes <span class="damage-required">Required</span></label>
          <textarea
            id="damage-notes"
            class="create-case-textarea"
            rows="4"
            data-field="damage-notes"
            placeholder="Add relevant details about the damage…"
          >${d.notes || ""}</textarea>
        </div>
      </section>
      <div class="actions refund-confirm-actions">
        <button class="btn btn-secondary" data-action="damage-back-evidence">Back</button>
        <button class="btn btn-primary" data-action="damage-next-review" ${
          !notesOk || !photosOk ? "disabled" : ""
        }>Review damage report</button>
      </div>`;
  }

  function renderDamageRequest() {
    const d = damage();
    const channel = d.requestChannel === "email" ? "email" : "sms";
    const notesOk = String(d.notes || "").trim().length > 0;
    const contact =
      channel === "email"
        ? customer().email || ""
        : formatPhone(customer().phone) || customer().phone || "";
    return `
      ${damageWorkflowHead()}
      ${damageStepIndicator("request")}
      <section class="card card-pad damage-request" aria-label="Request photos">
        <h2 class="damage-section-title">Request photos</h2>
        <fieldset class="damage-channel">
          <legend>Send upload link by</legend>
          <div class="damage-channel-options">
            <label class="damage-channel-option${
              channel === "sms" ? " is-selected" : ""
            }">
              <input
                type="radio"
                name="damage-request-channel"
                value="sms"
                data-action="damage-request-channel"
                ${channel === "sms" ? "checked" : ""}
              />
              SMS
            </label>
            <label class="damage-channel-option${
              channel === "email" ? " is-selected" : ""
            }">
              <input
                type="radio"
                name="damage-request-channel"
                value="email"
                data-action="damage-request-channel"
                ${channel === "email" ? "checked" : ""}
              />
              Email
            </label>
          </div>
        </fieldset>
        <div class="create-case-field">
          <label for="damage-request-contact">${
            channel === "email" ? "Email" : "Mobile"
          }</label>
          <input
            id="damage-request-contact"
            class="create-case-input"
            type="text"
            value="${contact}"
            readonly
            aria-readonly="true"
          />
        </div>
        <div class="create-case-field create-case-field-notes">
          <label for="damage-notes-request">Case notes <span class="damage-required">Required</span></label>
          <textarea
            id="damage-notes-request"
            class="create-case-textarea"
            rows="4"
            data-field="damage-notes"
            placeholder="Add relevant details about the damage…"
          >${d.notes || ""}</textarea>
        </div>
        <div class="damage-open-outcome" aria-label="Case status">
          <p class="damage-open-outcome-title">Case will remain open</p>
          <p class="damage-open-outcome-meta">Awaiting customer photo evidence.</p>
        </div>
      </section>
      <div class="actions refund-confirm-actions">
        <button class="btn btn-secondary" data-action="damage-back-evidence">Back</button>
        <button class="btn btn-primary" data-action="damage-submit-request" ${
          !notesOk ? "disabled" : ""
        }>Create case &amp; request photos</button>
      </div>`;
  }

  function damageAttestationHtml() {
    const d = damage();
    const pre = !!getState().aiThreeStepPreVerified;
    const label = pre
      ? "I confirm the customer has requested this refund."
      : "I confirm the customer has requested this refund and required verification is complete.";
    const hint = pre
      ? "3-step pre-verification was completed before handoff."
      : "";
    return `
      <label class="damage-attest">
        <input
          type="checkbox"
          data-action="damage-attest"
          ${d.attested ? "checked" : ""}
        />
        <span>
          <span class="damage-attest-label">${label}</span>
          ${hint ? `<span class="damage-attest-hint">${hint}</span>` : ""}
        </span>
      </label>`;
  }

  function renderDamageReview() {
    const d = damage();
    const summary = damageSelectionSummary();
    const outcome = d.outcome === "follow-up" ? "follow-up" : "resolved";
    const canSubmit = summary.units > 0 && d.attested;
    const cta = `Refund ${money(summary.amount)}`;
    return `
      ${damageWorkflowHead()}
      ${damageStepIndicator("review")}
      <section class="card card-pad damage-review" aria-label="Review damage report">
        <h2 class="damage-section-title">Review damage report</h2>
        <ul class="refund-review-list damage-review-list">
          ${summary.rows
            .map(
              (r) => `
            <li>
              <div class="refund-review-main">
                <span class="refund-review-label">${r.label}</span>
                <span class="refund-review-amount">${money(r.amount)}</span>
              </div>
              <div class="refund-review-reason">${r.damageType}</div>
            </li>`
            )
            .join("")}
        </ul>
        <div class="damage-review-block">
          <h3 class="damage-review-subhead">Evidence</h3>
          <p>${d.photoCount} photo${d.photoCount === 1 ? "" : "s"} attached</p>
        </div>
        <div class="damage-review-block">
          <h3 class="damage-review-subhead">Case notes</h3>
          <p class="damage-review-notes">${escapeHtml(d.notes || "")}</p>
        </div>
        <div class="totals-row grand"><span>Refund total</span><span>${money(
          summary.amount
        )}</span></div>
        <div class="totals-row refund-destination">
          <span>Refund to</span>
          <span>${
            order().paymentLast4
              ? `${order().paymentMethod || "Card"} ···· ${order().paymentLast4}`
              : order().paymentMethod || "original payment method"
          }</span>
        </div>
        ${reviewCaseDestinationHtml()}
      </section>
      <section class="card create-case-outcome" aria-label="Case outcome">
        <header class="create-case-scope-head">
          <h2>Case outcome</h2>
        </header>
        <div class="create-case-scope-options" role="radiogroup" aria-label="Case outcome">
          <label class="create-case-scope-option${
            outcome === "resolved" ? " is-selected" : ""
          }">
            <input
              type="radio"
              name="damage-outcome"
              value="resolved"
              data-action="damage-outcome"
              ${outcome === "resolved" ? "checked" : ""}
            />
            <span class="create-case-scope-option-body">
              <span class="create-case-scope-option-title">Resolved during this interaction</span>
              <span class="create-case-scope-option-meta">Record the damage case and close it with the refund.</span>
            </span>
          </label>
          <label class="create-case-scope-option${
            outcome === "follow-up" ? " is-selected" : ""
          }">
            <input
              type="radio"
              name="damage-outcome"
              value="follow-up"
              data-action="damage-outcome"
              ${outcome === "follow-up" ? "checked" : ""}
            />
            <span class="create-case-scope-option-body">
              <span class="create-case-scope-option-title">Follow-up required</span>
              <span class="create-case-scope-option-meta">Refund now and keep the damage case open.</span>
            </span>
          </label>
        </div>
      </section>
      <section class="card card-pad damage-review-attest">
        ${damageAttestationHtml()}
      </section>
      <div class="actions refund-confirm-actions">
        <button class="btn btn-secondary" data-action="damage-back-upload">Back</button>
        <button class="btn btn-primary" data-action="damage-submit-refund" ${
          !canSubmit ? "disabled" : ""
        }>${cta}</button>
      </div>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function relatedKeysFromDamage() {
    return Object.keys(damage().items || {});
  }

  function relatedLineIdsFromDamage() {
    return relatedKeysFromDamage()
      .map((k) => k.split(":")[1])
      .filter(Boolean);
  }

  function completeDamageRequest() {
    const d = damage();
    const channel = d.requestChannel === "email" ? "email" : "sms";
    const summary = damageSelectionSummary();
    const existing = linkedCase();
    let caseRec;
    if (existing) {
      caseRec = existing;
    } else {
      caseRec = createAndLinkCase({
        topic: "Damage",
        summary: `Damage claim — ${summary.units} unit${
          summary.units === 1 ? "" : "s"
        }`,
        notes: d.notes || "",
        scope: "specific",
        outcome: "follow-up",
        relatedLineIds: relatedLineIdsFromDamage(),
        relatedKeys: relatedKeysFromDamage(),
        linkAsCurrent: true,
      });
    }
    d.result = {
      kind: "request",
      id: caseRec.id,
      topic: "Damage",
      outcome: "follow-up",
      channel,
      units: summary.units,
      amount: null,
    };
    d.step = "done";
  }

  function completeDamageRefund() {
    const d = damage();
    const summary = damageSelectionSummary();
    const outcome = d.outcome === "follow-up" ? "follow-up" : "resolved";
    const existing = linkedCase();
    let caseRec;
    if (existing) {
      caseRec = existing;
      if (outcome === "resolved" && existing.open) {
        existing.open = false;
        existing.state = "Closed";
        existing.outcome = "resolved";
        getState().lastClosedCase = {
          id: existing.id,
          topic: existing.topic || "Damage",
          state: "Closed",
        };
        getState().linkedCaseId = null;
        getState().linkedCaseSnapshot = null;
      }
    } else {
      caseRec = createAndLinkCase({
        topic: "Damage",
        summary: `Damage claim — refund ${money(summary.amount)}`,
        notes: d.notes || "",
        scope: "specific",
        outcome,
        relatedLineIds: relatedLineIdsFromDamage(),
        relatedKeys: relatedKeysFromDamage(),
        linkAsCurrent: outcome === "follow-up",
      });
    }
    d.result = {
      kind: "refund",
      id: caseRec.id,
      topic: "Damage",
      outcome,
      channel: null,
      units: summary.units,
      amount: summary.amount,
      photoCount: d.photoCount,
    };
    d.step = "done";
  }

  function renderDamageDone() {
    const result = damage().result;
    if (!result) {
      damage().step = "select";
      return renderDamageSelect();
    }
    const isRequest = result.kind === "request";
    const resolved = result.outcome === "resolved";
    const banner = isRequest
      ? "Case created"
      : resolved
        ? "Damage recorded"
        : "Damage recorded";
    const body = isRequest
      ? `Photos requested by ${
          result.channel === "email" ? "email" : "SMS"
        }. Awaiting customer evidence.`
      : resolved
        ? `Refund ${money(result.amount)} processed. Resolved during this interaction.`
        : `Refund ${money(result.amount)} processed. Case remains open for follow-up.`;

    return `
      <div class="create-case-done damage-done">
        <section class="card card-pad create-case-confirm" aria-label="Damage report complete">
          <p class="create-case-confirm-banner">
            <span class="create-case-confirm-check" aria-hidden="true">${icons.check}</span>
            ${banner}
          </p>
          <div class="create-case-confirm-ref">
            <p class="create-case-confirm-ref-label">Case reference</p>
            <p class="create-case-confirm-ref-row">
              <span class="create-case-confirm-ref-id">#${result.id}</span>
              ${copyControl(result.id, "case reference")}
            </p>
          </div>
          <div class="create-case-confirm-outcome">
            <p class="create-case-confirm-meta">Damage</p>
            <p class="create-case-confirm-body">${body}</p>
          </div>
          <div class="create-case-confirm-actions">
            <button
              type="button"
              class="btn btn-primary"
              data-action="damage-done-back"
            >Back to order</button>
            <button
              type="button"
              class="btn btn-secondary"
              data-action="view-case"
              data-case="${result.id}"
            >View case</button>
          </div>
        </section>
      </div>`;
  }

  function renderReportDamage() {
    const step = damage().step || "select";
    let body = "";
    if (step === "done") body = renderDamageDone();
    else if (step === "evidence") body = renderDamageEvidence();
    else if (step === "upload") body = renderDamageUpload();
    else if (step === "request") body = renderDamageRequest();
    else if (step === "review") body = renderDamageReview();
    else body = renderDamageSelect();

    if (step === "done") {
      return workspace(body, { showRail: false });
    }
    return workspace(body);
  }

  function enterReportDamage() {
    const state = getState();
    const from =
      state.view === "track" || state.view === "detail"
        ? state.view
        : state.originView;
    state.originView = from === "track" ? "track" : "detail";
    resetDamageDraft();
    state.leaveConfirm = null;
    state.actionsMenuOpen = false;
    state.view = "damage";
  }

  function findShipment(shipId) {
    for (const seller of sellers()) {
      const ship = seller.shipments.find((s) => s.id === shipId);
      if (ship) return { seller, ship };
    }
    return null;
  }

  function findPackage(ship, pkgId) {
    return ship?.packages.find((p) => p.id === pkgId) || null;
  }

  /** Handle click actions; return true if handled. */
  function handleDamageAction(action, el, e) {
    const d = damage();
    if (action === "report-damage" || action === "start-damage") {
      enterReportDamage();
      return true;
    }
    if (action === "damage-toggle-item") {
      const key =
        e.target.getAttribute("data-key") || el?.getAttribute("data-key");
      const max = Number(
        e.target.getAttribute("data-max") || el?.getAttribute("data-max") || 1
      );
      if (!key) return true;
      const on = damageItemQty(key) <= 0;
      setDamageItemQty(key, on ? max : 0, max);
      return true;
    }
    if (action === "damage-toggle-pkg") {
      const shipId =
        e.target.getAttribute("data-ship") || el?.getAttribute("data-ship");
      const pkgId =
        e.target.getAttribute("data-pkg") || el?.getAttribute("data-pkg");
      const found = findShipment(shipId);
      const pkg = found && findPackage(found.ship, pkgId);
      if (!found || !pkg) return true;
      const on = damagePackageSelectState(found.ship, pkg) !== "all";
      selectAllDamageInPackage(found.ship, pkg, on);
      return true;
    }
    if (action === "damage-toggle-ship") {
      const shipId =
        e.target.getAttribute("data-ship") || el?.getAttribute("data-ship");
      const found = findShipment(shipId);
      if (!found) return true;
      const on = damageShipmentSelectState(found.ship) !== "all";
      selectAllDamageInShipment(found.ship, on);
      return true;
    }
    if (action === "damage-next-evidence") {
      if (!damageSelectReady()) return true;
      d.step = "evidence";
      return true;
    }
    if (action === "damage-back-select") {
      d.step = "select";
      return true;
    }
    if (action === "damage-evidence-path") {
      const value = e.target.value || el?.value;
      if (value === "upload" || value === "request") d.evidencePath = value;
      return true;
    }
    if (action === "damage-next-from-evidence") {
      if (d.evidencePath === "upload") d.step = "upload";
      else if (d.evidencePath === "request") d.step = "request";
      return true;
    }
    if (action === "damage-back-evidence") {
      d.step = "evidence";
      return true;
    }
    if (action === "damage-add-photo") {
      d.photoCount = (d.photoCount || 0) + 1;
      return true;
    }
    if (action === "damage-next-review") {
      if (!String(d.notes || "").trim() || !(d.photoCount > 0)) return true;
      d.step = "review";
      return true;
    }
    if (action === "damage-back-upload") {
      d.step = "upload";
      return true;
    }
    if (action === "damage-request-channel") {
      const value = e.target.value || el?.value;
      if (value === "sms" || value === "email") d.requestChannel = value;
      return true;
    }
    if (action === "damage-submit-request") {
      if (!String(d.notes || "").trim()) return true;
      completeDamageRequest();
      return true;
    }
    if (action === "damage-outcome") {
      const value = e.target.value || el?.value;
      if (value === "resolved" || value === "follow-up") d.outcome = value;
      return true;
    }
    if (action === "damage-attest") {
      d.attested = !!e.target.checked;
      return true;
    }
    if (action === "damage-submit-refund") {
      if (!d.attested || !damageSelectionSummary().units) return true;
      completeDamageRefund();
      return true;
    }
    if (action === "damage-done-back") {
      resetDamageDraft();
      getState().view = getState().originView || "detail";
      return true;
    }
    return false;
  }

  /** Handle change events; return true if handled. */
  function handleDamageChange(action, el, e) {
    const d = damage();
    if (action === "damage-item-qty") {
      const key = e.target.getAttribute("data-key");
      const max = Number(e.target.getAttribute("data-max") || 1);
      if (!key) return true;
      setDamageItemQty(key, e.target.value, max);
      return true;
    }
    if (action === "damage-item-type") {
      const key = e.target.getAttribute("data-key");
      if (!key) return true;
      setDamageItemType(key, e.target.value);
      return true;
    }
    if (action === "damage-evidence-path") {
      const value = e.target.value;
      if (value === "upload" || value === "request") d.evidencePath = value;
      return true;
    }
    if (action === "damage-request-channel") {
      const value = e.target.value;
      if (value === "sms" || value === "email") d.requestChannel = value;
      return true;
    }
    if (action === "damage-outcome") {
      const value = e.target.value;
      if (value === "resolved" || value === "follow-up") d.outcome = value;
      return true;
    }
    if (action === "damage-attest") {
      d.attested = !!e.target.checked;
      return true;
    }
    return false;
  }

  function handleDamageField(field, e) {
    if (field === "damage-notes") {
      damage().notes = e.target.value;
      return true;
    }
    return false;
  }

  return {
    resetDamageDraft,
    damageHasDraft,
    enterReportDamage,
    renderReportDamage,
    handleDamageAction,
    handleDamageChange,
    handleDamageField,
  };
}
