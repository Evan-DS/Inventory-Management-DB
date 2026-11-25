'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(value || 0));
const dateText = (value) => value ? new Date(String(value).replace(' ', 'T')).toLocaleString() : '—';
let productOptions = [];
let toastTimer;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status}).`);
  return payload;
}
function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== '' && value !== null && value !== undefined) params.set(key, value); });
  return params.toString();
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
function setResult(element, message, kind = '') {
  element.className = `result-area ${kind}`.trim(); element.textContent = message;
}
function fillSelect(element, rows, valueKey, labelKey, placeholder) {
  element.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + rows.map(row =>
    `<option value="${escapeHtml(row[valueKey])}">${escapeHtml(row[labelKey])}</option>`).join('');
}
function rowsOrEmpty(rows, colspan, message = 'No matching records found.') {
  return rows.length ? rows : [{ _empty: message, _colspan: colspan }];
}
function renderRows(element, rows, renderer, colspan) {
  const safeRows = rowsOrEmpty(rows, colspan);
  element.innerHTML = safeRows.map((row, index) => row._empty
    ? `<tr><td class="empty" colspan="${row._colspan}">${escapeHtml(row._empty)}</td></tr>`
    : renderer(row, index)).join('');
}

async function loadReferenceData() {
  const [locations, categories, customers, products] = await Promise.all([
    api('/api/locations'), api('/api/categories'), api('/api/customers?limit=2000'), api('/api/products?limit=2000')
  ]);
  ['#inventory-location', '#low-location', '#order-location', '#transfer-source', '#transfer-destination'].forEach((selector, index) => {
    const placeholder = index === 0 || index === 1 ? 'All locations' : index === 3 ? 'Choose source' : index === 4 ? 'Choose destination' : 'Choose a location';
    fillSelect($(selector), locations, 'LocationID', 'LocationName', placeholder);
  });
  ['#inventory-category', '#low-category', '#analytics-category'].forEach(selector => fillSelect($(selector), categories, 'CategoryID', 'CategoryName', 'All categories'));
  fillSelect($('#order-customer'), customers, 'CustomerID', 'CustomerName', 'Choose a customer');
  productOptions = products;
  fillSelect($('#transfer-product'), products, 'ProductID', 'ProductName', 'Choose a product');
  addOrderLine();
}

async function checkHealth() {
  try {
    const result = await api('/api/health');
    $('#health-dot').classList.toggle('online', result.databaseConnected);
    $('#health-text').textContent = result.databaseConnected ? 'Database connected' : 'Database unavailable';
  } catch (_) {
    $('#health-dot').classList.remove('online'); $('#health-text').textContent = 'Database unavailable';
  }
}

async function searchInventory(event) {
  event?.preventDefault();
  const values = Object.fromEntries(new FormData($('#inventory-filter')));
  values.lowOnly = $('#inventory-filter [name="lowOnly"]').checked ? 'true' : 'false';
  try {
    const rows = await api(`/api/inventory?${queryString(values)}`);
    renderRows($('#inventory-rows'), rows, row => `<tr><td><strong>${escapeHtml(row.ProductName)}</strong><div class="muted">ID ${row.ProductID}</div></td><td>${escapeHtml(row.CategoryName)}</td><td>${escapeHtml(row.LocationName)}</td><td>${row.Quantity}</td><td>${row.ReorderPoint}</td><td><span class="pill ${row.StockStatus === 'LOW' ? 'pill-low' : 'pill-ok'}">${row.StockStatus === 'LOW' ? 'Low stock' : 'In stock'}</span></td></tr>`, 6);
    $('#inventory-count').textContent = `${rows.length} records`;
  } catch (error) { showToast(error.message); }
}

async function searchLowStock(event) {
  event?.preventDefault();
  const values = Object.fromEntries(new FormData($('#low-stock-filter')));
  try {
    const rows = await api(`/api/low-stock?${queryString(values)}`);
    renderRows($('#low-stock-rows'), rows, row => `<tr><td><strong>${escapeHtml(row.ProductName)}</strong><div class="muted">ID ${row.ProductID}</div></td><td>${escapeHtml(row.CategoryName)}</td><td>${escapeHtml(row.LocationName)}</td><td>${row.Quantity}</td><td>${row.ReorderPoint}</td><td><span class="pill pill-low">${row.UnitsBelowReorderPoint}</span></td><td>${row.RecentUnitsSold}</td></tr>`, 7);
  } catch (error) { showToast(error.message); }
}

function addOrderLine() {
  const container = $('#order-lines');
  if (container.children.length >= 20) { showToast('An order can contain at most 20 product lines.'); return; }
  const line = document.createElement('div'); line.className = 'order-line';
  line.innerHTML = `<label>Product<select class="line-product" required><option value="">Choose product</option>${productOptions.map(p => `<option value="${escapeHtml(p.ProductID)}">${escapeHtml(p.ProductName)} (ID ${escapeHtml(p.ProductID)})</option>`).join('')}</select></label><label>Quantity<input class="line-quantity" type="number" min="1" step="1" value="1" required></label><button class="remove-line" type="button" aria-label="Remove product line">×</button>`;
  $('.remove-line', line).addEventListener('click', () => { if (container.children.length > 1) line.remove(); else showToast('An order needs at least one product.'); });
  container.append(line);
}

async function createOrder(event) {
  event.preventDefault();
  const items = $$('.order-line').map(line => ({ productId: Number($('.line-product', line).value), quantity: Number($('.line-quantity', line).value) }));
  if (items.some(item => !Number.isSafeInteger(item.productId) || item.productId <= 0 || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) { showToast('Choose a product and enter a positive whole-number quantity for every line.'); return; }
  if (new Set(items.map(item => item.productId)).size !== items.length) { showToast('Each product can appear only once per order. Combine duplicate quantities.'); return; }
  try {
    const result = await api('/api/orders', { method: 'POST', body: JSON.stringify({ customerId: Number($('#order-customer').value), locationId: Number($('#order-location').value), items }) });
    showToast(result.message);
    renderOrder(result.order);
    $('#order-lookup [name="orderId"]').value = result.order.OrderID;
    $('#order-form').reset(); $('#order-lines').innerHTML = ''; addOrderLine();
  } catch (error) { showToast(error.message); }
}

function renderOrder(order) {
  const result = $('#order-result');
  const statusClass = `pill-${String(order.OrderStatus).toLowerCase()}`;
  result.className = 'result-area success';
  result.innerHTML = `<div class="order-summary"><span><strong>Order #${order.OrderID}</strong></span><span>${escapeHtml(dateText(order.OrderDate))}</span><span>${escapeHtml(order.CustomerName)}</span><span>${escapeHtml(order.LocationName)}</span><span class="pill ${statusClass}">${escapeHtml(order.OrderStatus)}</span><strong>${money(order.TotalAmount)}</strong></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${order.items.map(item => `<tr><td>${escapeHtml(item.ProductName)} (ID ${item.ProductID})</td><td>${item.QuantityOrdered}</td><td>${money(item.UnitPrice)}</td><td>${money(item.LineTotal)}</td></tr>`).join('')}</tbody></table></div><div class="result-actions">${order.OrderStatus === 'Pending' ? `<button class="button" data-order-action="confirm" type="button">Confirm and deduct stock</button>` : ''}${['Pending', 'Confirmed'].includes(order.OrderStatus) ? `<button class="button button-light" data-order-action="cancel" type="button">Cancel order</button>` : ''}</div>`;
  $$('[data-order-action]', result).forEach(button => button.addEventListener('click', () => updateOrder(order.OrderID, button.dataset.orderAction)));
}

async function lookupOrder(event) {
  event.preventDefault();
  const orderId = Number($('#order-lookup [name="orderId"]').value);
  try { renderOrder(await api(`/api/orders/${orderId}`)); }
  catch (error) { setResult($('#order-result'), error.message, 'error'); }
}
async function updateOrder(orderId, action) {
  const verb = action === 'confirm' ? 'confirm this order and deduct inventory' : 'cancel this order';
  if (!window.confirm(`Are you sure you want to ${verb}?`)) return;
  try {
    const result = await api(`/api/orders/${orderId}/${action}`, { method: 'POST', body: '{}' });
    showToast(result.message); renderOrder(result.order);
    await searchInventory();
  } catch (error) { showToast(error.message); }
}

async function createTransfer(event) {
  event.preventDefault();
  const form = $('#transfer-form'); const values = Object.fromEntries(new FormData(form));
  const body = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
  if (body.sourceLocationId === body.destinationLocationId) { showToast('Choose two different locations.'); return; }
  if (Object.values(body).some(value => !Number.isSafeInteger(value) || value <= 0)) { showToast('All transfer fields must contain valid positive whole numbers.'); return; }
  try {
    const result = await api('/api/transfers', { method: 'POST', body: JSON.stringify(body) });
    setResult($('#transfer-result'), `${result.message} Transfer #${result.transfer.TransferID}: ${result.transfer.Quantity} units of ${result.transfer.ProductName} moved from ${result.transfer.SourceLocation} to ${result.transfer.DestinationLocation}.`, 'success');
    form.reset(); await searchInventory();
  } catch (error) { setResult($('#transfer-result'), error.message, 'error'); }
}

async function runAnalytics(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData($('#analytics-filter')));
  if (!values.from || !values.to) { showToast('Choose both dates.'); return; }
  try {
    const rows = await api(`/api/analytics/sales?${queryString(values)}`);
    renderRows($('#analytics-rows'), rows, (row, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.ProductName)}</strong><div class="muted">ID ${row.ProductID}</div></td><td>${escapeHtml(row.CategoryName)}</td><td>${row.UnitsSold}</td><td>${money(row.SalesRevenue)}</td><td>${row.CurrentInventory}</td></tr>`, 6);
  } catch (error) { showToast(error.message); }
}

function activateTab(name) {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${name}`));
}

function setDefaultDates() {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today); fromDate.setDate(today.getDate() - 90);
  $('#analytics-filter [name="from"]').value = fromDate.toISOString().slice(0, 10);
  $('#analytics-filter [name="to"]').value = to;
}

async function initialize() {
  $$('.tab').forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
  $('#inventory-filter').addEventListener('submit', searchInventory);
  $('#low-stock-filter').addEventListener('submit', searchLowStock);
  $('#order-form').addEventListener('submit', createOrder);
  $('#order-lookup').addEventListener('submit', lookupOrder);
  $('#transfer-form').addEventListener('submit', createTransfer);
  $('#analytics-filter').addEventListener('submit', runAnalytics);
  $('#add-order-line').addEventListener('click', addOrderLine);
  $('#refresh-all').addEventListener('click', async () => { await checkHealth(); await searchInventory(); showToast('Inventory refreshed.'); });
  setDefaultDates();
  await checkHealth();
  try {
    await loadReferenceData();
    await searchInventory();
    await searchLowStock();
    await runAnalytics(new Event('submit', { cancelable: true }));
  } catch (error) { showToast(`Could not load application data: ${error.message}`); }
}

document.addEventListener('DOMContentLoaded', initialize);
