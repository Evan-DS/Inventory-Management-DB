'use strict';

const $ = (selector) => document.querySelector(selector);
let orderLines = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function showMessage(element, message, isError = false) {
  element.innerHTML = `<div class="${isError ? 'error' : 'notice'}">${escapeHtml(message)}</div>`;
}

function renderTable(element, columns, rows) {
  if (!rows || rows.length === 0) {
    element.innerHTML = '<div class="result-card muted">No records matched this request.</div>';
    return;
  }
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((c) => {
    const value = row[c.key];
    if (c.key === 'StockStatus') return `<td><span class="pill ${value === 'LOW' ? 'low' : 'ok'}">${escapeHtml(value)}</span></td>`;
    if (c.numeric) return `<td class="numeric">${escapeHtml(value)}</td>`;
    return `<td>${escapeHtml(value)}</td>`;
  }).join('')}</tr>`).join('');
  element.innerHTML = `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function addOptions(select, rows, idKey, nameKey, firstLabel = null) {
  select.innerHTML = firstLabel ? `<option value="">${escapeHtml(firstLabel)}</option>` : '';
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row[idKey];
    option.textContent = `${row[idKey]} · ${row[nameKey]}`;
    select.appendChild(option);
  }
}

async function initialize() {
  try {
    const health = await api('/api/health');
    $('#connectionStatus').textContent = health.databaseConnected ? 'MySQL connected' : 'Database unavailable';
    $('#connectionStatus').className = `connection ${health.databaseConnected ? 'ok' : 'fail'}`;
    const [locations, categories] = await Promise.all([api('/api/locations'), api('/api/categories')]);
    addOptions($('#inventoryLocation'), locations, 'LocationID', 'LocationName', 'All locations');
    addOptions($('#lowStockLocation'), locations, 'LocationID', 'LocationName', 'All locations');
    addOptions($('#inventoryCategory'), categories, 'CategoryID', 'CategoryName', 'All categories');
    addOptions($('#lowStockCategory'), categories, 'CategoryID', 'CategoryName', 'All categories');
    addOptions($('#analyticsCategory'), categories, 'CategoryID', 'CategoryName', 'All categories');
    addOptions($('#orderLocation'), locations, 'LocationID', 'LocationName');
    addOptions($('#transferSource'), locations, 'LocationID', 'LocationName');
    addOptions($('#transferDestination'), locations, 'LocationID', 'LocationName');
    await loadInventory();
  } catch (error) {
    $('#connectionStatus').textContent = 'Database connection failed';
    $('#connectionStatus').className = 'connection fail';
    showMessage($('#inventoryResults'), error.message, true);
  }
}

async function loadInventory() {
  const params = new URLSearchParams();
  const search = $('#inventorySearchForm').elements.search.value.trim();
  const locationId = $('#inventoryLocation').value;
  const categoryId = $('#inventoryCategory').value;
  if (search) params.set('search', search);
  if (locationId) params.set('locationId', locationId);
  if (categoryId) params.set('categoryId', categoryId);
  const rows = await api(`/api/inventory?${params}`);
  renderTable($('#inventoryResults'), [
    { key: 'ProductID', label: 'Product ID', numeric: true },
    { key: 'ProductName', label: 'Product' },
    { key: 'CategoryName', label: 'Category' },
    { key: 'LocationName', label: 'Location' },
    { key: 'Quantity', label: 'Quantity', numeric: true },
    { key: 'ReorderPoint', label: 'Reorder point', numeric: true },
    { key: 'StockStatus', label: 'Status' }
  ], rows);
}

async function loadLowStock() {
  const params = new URLSearchParams();
  const locationId = $('#lowStockLocation').value;
  const categoryId = $('#lowStockCategory').value;
  const days = $('#lowStockDays').value || '30';
  if (locationId) params.set('locationId', locationId);
  if (categoryId) params.set('categoryId', categoryId);
  params.set('days', days);
  const rows = await api(`/api/low-stock?${params}`);
  renderTable($('#lowStockResults'), [
    { key: 'ProductID', label: 'Product ID', numeric: true },
    { key: 'ProductName', label: 'Product' },
    { key: 'CategoryName', label: 'Category' },
    { key: 'LocationName', label: 'Location' },
    { key: 'Quantity', label: 'Quantity', numeric: true },
    { key: 'ReorderPoint', label: 'Reorder point', numeric: true },
    { key: 'UnitsBelowReorderPoint', label: 'Units below', numeric: true },
    { key: 'RecentUnitsSold', label: `Sold in last ${days} days`, numeric: true }
  ], rows);
}

function renderOrderLines() {
  const target = $('#orderLines');
  if (orderLines.length === 0) {
    target.innerHTML = '<p class="muted">No product lines added yet.</p>';
    return;
  }
  target.innerHTML = orderLines.map((line, index) => `
    <div class="line-item"><span>Product ${line.productId} × ${line.quantity}</span>
      <button type="button" class="remove-line" data-index="${index}">Remove</button></div>`).join('');
}

function renderOrder(order) {
  const target = $('#orderResults');
  const items = order.items || [];
  const table = items.map((item) => `<tr>
    <td>${escapeHtml(item.ProductID)}</td><td>${escapeHtml(item.ProductName)}</td>
    <td>${escapeHtml(item.QuantityOrdered)}</td><td>${Number(item.UnitPrice).toFixed(2)}</td>
    <td>${Number(item.LineTotal).toFixed(2)}</td></tr>`).join('');
  target.innerHTML = `<div class="result-card"><h3>Order #${escapeHtml(order.OrderID)}</h3>
    <p><strong>Status:</strong> <span class="pill">${escapeHtml(order.OrderStatus)}</span>
    &nbsp; <strong>Customer:</strong> ${escapeHtml(order.CustomerName)}
    &nbsp; <strong>Location:</strong> ${escapeHtml(order.LocationName)}</p>
    <table class="data-table"><thead><tr><th>Product ID</th><th>Product</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${table}</tbody></table>
    <p><strong>Order total:</strong> $${Number(order.TotalAmount).toFixed(2)}</p>
    ${order.OrderStatus === 'Pending' ? `<div class="order-actions"><button id="confirmOrderButton" class="primary" data-order-id="${escapeHtml(order.OrderID)}">Confirm order and deduct stock</button><button id="cancelOrderButton" class="secondary" data-order-id="${escapeHtml(order.OrderID)}">Cancel order</button></div>` : ''}
    ${order.OrderStatus === 'Confirmed' ? `<div class="order-actions"><button id="cancelOrderButton" class="secondary" data-order-id="${escapeHtml(order.OrderID)}">Cancel and restore inventory</button></div>` : ''}
  </div>`;
  const confirmButton = $('#confirmOrderButton');
  if (confirmButton) confirmButton.addEventListener('click', confirmOrder);
  const cancelButton = $('#cancelOrderButton');
  if (cancelButton) cancelButton.addEventListener('click', cancelOrder);
}

async function lookupOrder(orderId) {
  const order = await api(`/api/orders/${encodeURIComponent(orderId)}`);
  renderOrder(order);
}

async function confirmOrder(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api(`/api/orders/${button.dataset.orderId}/confirm`, { method: 'POST', body: '{}' });
    showMessage($('#orderMessage'), result.message);
    renderOrder(result.order);
  } catch (error) {
    showMessage($('#orderMessage'), error.message, true);
    button.disabled = false;
  }
}

async function cancelOrder(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api(`/api/orders/${button.dataset.orderId}/cancel`, { method: 'POST', body: '{}' });
    showMessage($('#orderMessage'), result.message);
    renderOrder(result.order);
  } catch (error) {
    showMessage($('#orderMessage'), error.message, true);
    button.disabled = false;
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${tabName}`));
  if (tabName === 'low-stock') loadLowStock().catch((error) => showMessage($('#lowStockResults'), error.message, true));
}

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('#inventorySearchForm').addEventListener('submit', (event) => {
  event.preventDefault(); loadInventory().catch((error) => showMessage($('#inventoryResults'), error.message, true));
});
$('#refreshLowStock').addEventListener('click', () => loadLowStock().catch((error) => showMessage($('#lowStockResults'), error.message, true)));
$('#lowStockFilterForm').addEventListener('submit', (event) => { event.preventDefault(); loadLowStock().catch((error) => showMessage($('#lowStockResults'), error.message, true)); });
$('#addOrderLine').addEventListener('click', () => {
  const productId = Number($('#orderProductId').value);
  const quantity = Number($('#orderQuantity').value);
  if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
    showMessage($('#orderMessage'), 'Enter a valid product ID and positive whole-number quantity.', true); return;
  }
  if (orderLines.some((line) => line.productId === productId)) {
    showMessage($('#orderMessage'), 'That product is already in this order. Change its quantity instead of adding a duplicate line.', true); return;
  }
  orderLines.push({ productId, quantity });
  renderOrderLines();
  $('#orderProductId').value = '';
  $('#orderQuantity').value = '1';
  $('#orderMessage').innerHTML = '';
});
$('#orderLines').addEventListener('click', (event) => {
  const button = event.target.closest('.remove-line');
  if (!button) return;
  orderLines.splice(Number(button.dataset.index), 1); renderOrderLines();
});
$('#orderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (orderLines.length === 0) { showMessage($('#orderMessage'), 'Add at least one product line first.', true); return; }
  try {
    const result = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ customerId: Number($('#orderCustomer').value), locationId: Number($('#orderLocation').value), items: orderLines })
    });
    orderLines = []; renderOrderLines();
    showMessage($('#orderMessage'), result.message);
    renderOrder(result.order);
  } catch (error) { showMessage($('#orderMessage'), error.message, true); }
});
$('#orderLookupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await lookupOrder(event.currentTarget.elements.orderId.value); }
  catch (error) { showMessage($('#orderResults'), error.message, true); }
});
$('#transferForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  for (const key of ['productId', 'quantity', 'sourceLocationId', 'destinationLocationId']) body[key] = Number(body[key]);
  try {
    const result = await api('/api/transfers', { method: 'POST', body: JSON.stringify(body) });
    showMessage($('#transferMessage'), `${result.message} Transfer #${result.transfer.TransferID}: ${result.transfer.ProductName}, ${result.transfer.Quantity} units from ${result.transfer.SourceLocation} to ${result.transfer.DestinationLocation}.`);
    form.reset();
  } catch (error) { showMessage($('#transferMessage'), error.message, true); }
});
$('#analyticsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const params = new URLSearchParams(new FormData(event.currentTarget));
  try {
    const rows = await api(`/api/analytics/sales?${params}`);
    renderTable($('#analyticsResults'), [
      { key: 'ProductID', label: 'Product ID', numeric: true },
      { key: 'ProductName', label: 'Product' },
      { key: 'CategoryName', label: 'Category' },
      { key: 'UnitsSold', label: 'Units sold', numeric: true },
      { key: 'SalesRevenue', label: 'Sales revenue ($)', numeric: true },
      { key: 'CurrentInventory', label: 'Current stock', numeric: true }
    ], rows);
  } catch (error) { showMessage($('#analyticsResults'), error.message, true); }
});

initialize();
