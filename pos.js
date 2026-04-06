const STORAGE_KEYS = {
  inventory: "farmapos_inventory",
  clients: "farmapos_clients",
  sales: "farmapos_sales",
  lastTicket: "farmapos_last_ticket",
};

const TAX_RATE = 0.19;

const viewTitles = {
  home: { label: "Inicio", title: "Panel general" },
  sales: { label: "Ventas", title: "Punto de venta" },
  inventory: { label: "Inventario", title: "Control de existencias" },
  clients: { label: "Clientes", title: "Gestión de clientes" },
  reports: { label: "Reportes", title: "Analítica comercial" },
  settings: { label: "Configuración", title: "Herramientas del sistema" },
};

function loadData(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

const navViewButtons = document.querySelectorAll(".nav-view");
const viewPanels = document.querySelectorAll(".view-panel");
const topbarSectionLabel = document.getElementById("topbarSectionLabel");
const topbarTitle = document.getElementById("topbarTitle");
const searchInput = document.getElementById("searchInput");
const products = document.querySelectorAll(".product-card");
const addButtons = document.querySelectorAll(".add-to-cart");
const filterButtons = document.querySelectorAll(".soft-btn");
const paymentButtons = document.querySelectorAll(".payment-btn");
const saleClientSelect = document.getElementById("saleClient");
const cartClientLabel = document.getElementById("cartClientLabel");
const cartList = document.getElementById("cartList");
const emptyCart = document.getElementById("emptyCart");
const subtotalValue = document.getElementById("subtotalValue");
const taxValue = document.getElementById("taxValue");
const totalValue = document.getElementById("totalValue");
const clearCartButton = document.getElementById("clearCart");
const cashPanel = document.getElementById("cashPanel");
const cashReceivedInput = document.getElementById("cashReceived");
const changeValue = document.getElementById("changeValue");
const checkoutSaleButton = document.getElementById("checkoutSale");
const newSaleButton = document.getElementById("newSaleButton");
const focusSearchButton = document.getElementById("focusSearchButton");
const goToSales = document.getElementById("goToSales");
const goToInventory = document.getElementById("goToInventory");
const clientForm = document.getElementById("clientForm");
const inventoryTableBody = document.getElementById("inventoryTableBody");
const inventoryBoard = document.getElementById("inventoryBoard");
const inventoryAlerts = document.getElementById("inventoryAlerts");
const inventoryCategoryList = document.getElementById("inventoryCategoryList");
const inventoryMetricCount = document.getElementById("inventoryMetricCount");
const inventoryMetricLow = document.getElementById("inventoryMetricLow");
const inventoryMetricOut = document.getElementById("inventoryMetricOut");
const inventoryMetricValue = document.getElementById("inventoryMetricValue");
const clientsTableBody = document.getElementById("clientsTableBody");
const clientCards = document.getElementById("clientCards");
const homeAlerts = document.getElementById("homeAlerts");
const recentSalesList = document.getElementById("recentSalesList");
const reportBars = document.getElementById("reportBars");
const reportInsights = document.getElementById("reportInsights");
const ticketModal = document.getElementById("ticketModal");
const ticketContent = document.getElementById("ticketContent");
const closeTicket = document.getElementById("closeTicket");
const ticketOverlay = document.getElementById("ticketOverlay");
const printTicketButton = document.getElementById("printTicket");
const downloadTicketButton = document.getElementById("downloadTicket");
const printLastTicketButton = document.getElementById("printLastTicket");
const exportDataButton = document.getElementById("exportData");
const resetDataButton = document.getElementById("resetData");
const dailySalesValue = document.getElementById("dailySalesValue");
const dailySalesCount = document.getElementById("dailySalesCount");
const inventoryCountValue = document.getElementById("inventoryCountValue");
const lowStockValue = document.getElementById("lowStockValue");
const clientCountValue = document.getElementById("clientCountValue");
const frequentClientValue = document.getElementById("frequentClientValue");
const cashValue = document.getElementById("cashValue");
const reportRevenue = document.getElementById("reportRevenue");
const reportUnits = document.getElementById("reportUnits");
const reportAverage = document.getElementById("reportAverage");
const reportTopClient = document.getElementById("reportTopClient");
const homeAverageTicket = document.getElementById("homeAverageTicket");
const homeUnitsSold = document.getElementById("homeUnitsSold");
const settingsPaymentMethod = document.getElementById("settingsPaymentMethod");
const settingsLastTicket = document.getElementById("settingsLastTicket");

const initialInventory = Array.from(products).map((card, index) => ({
  id: card.dataset.name,
  name: card.dataset.name,
  category: card.dataset.category,
  price: Number(card.dataset.price),
  stock: Number(card.querySelector(".product-meta span").textContent.replace(/\D/g, "")),
  sku: `FP-00${index + 1}`,
}));

const initialClients = [
  { id: crypto.randomUUID(), name: "Cliente general", document: "222222222", phone: "", purchases: 0 },
  { id: crypto.randomUUID(), name: "María Gómez", document: "10203040", phone: "3001234567", purchases: 2 },
];

let inventory = loadData(STORAGE_KEYS.inventory, initialInventory);
let clients = loadData(STORAGE_KEYS.clients, initialClients);
let sales = loadData(STORAGE_KEYS.sales, []);
let lastTicketHtml = localStorage.getItem(STORAGE_KEYS.lastTicket) || "";
let selectedClientId = clients[0]?.id || "";

const cart = new Map();

function saveData() {
  localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(inventory));
  localStorage.setItem(STORAGE_KEYS.clients, JSON.stringify(clients));
  localStorage.setItem(STORAGE_KEYS.sales, JSON.stringify(sales));
  localStorage.setItem(STORAGE_KEYS.lastTicket, lastTicketHtml);
}

function getSelectedPaymentMethod() {
  return document.querySelector(".payment-btn.active")?.textContent?.trim() || "Efectivo";
}

function getSelectedClient() {
  return clients.find((client) => client.id === selectedClientId) || clients[0] || null;
}

function switchView(view) {
  navViewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  viewPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  if (topbarSectionLabel) topbarSectionLabel.textContent = viewTitles[view].label;
  if (topbarTitle) topbarTitle.textContent = viewTitles[view].title;
}

function renderClientOptions() {
  if (!saleClientSelect) return;
  saleClientSelect.innerHTML = clients
    .map(
      (client) => `
        <option value="${client.id}" ${client.id === selectedClientId ? "selected" : ""}>
          ${client.name} - ${client.document}
        </option>
      `
    )
    .join("");
  const currentClient = getSelectedClient();
  if (cartClientLabel) {
    cartClientLabel.textContent = currentClient ? currentClient.name : "Cliente general";
  }
}

function updateCashPanel() {
  const paymentMethod = getSelectedPaymentMethod();
  if (cashPanel) {
    cashPanel.style.display = paymentMethod === "Efectivo" ? "block" : "none";
  }
  updateChange();
}

function updateChange() {
  const totalNumber = Number((totalValue.textContent || "").replace(/[^\d]/g, ""));
  const received = Number(cashReceivedInput?.value || 0);
  const change = Math.max(0, received - totalNumber);
  if (changeValue) {
    changeValue.textContent = formatCurrency(change);
  }
}

function renderCart() {
  const items = Array.from(cart.values());
  cartList.innerHTML = "";

  if (!items.length) {
    cartList.appendChild(emptyCart);
    subtotalValue.textContent = formatCurrency(0);
    taxValue.textContent = formatCurrency(0);
    totalValue.textContent = formatCurrency(0);
    updateChange();
    return;
  }

  let subtotal = 0;

  items.forEach((item) => {
    subtotal += item.price * item.quantity;
    const article = document.createElement("article");
    article.className = "cart-item";
    article.innerHTML = `
      <div class="cart-item-top">
        <div>
          <strong>${item.name}</strong>
          <small>${formatCurrency(item.price)} c/u</small>
        </div>
        <button class="soft-icon-btn remove-item" type="button" data-id="${item.id}">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="cart-item-bottom mt-3">
        <div class="qty-controls">
          <button class="qty-btn decrease-item" type="button" data-id="${item.id}">-</button>
          <strong>${item.quantity}</strong>
          <button class="qty-btn increase-item" type="button" data-id="${item.id}">+</button>
        </div>
        <strong>${formatCurrency(item.price * item.quantity)}</strong>
      </div>
    `;
    cartList.appendChild(article);
  });

  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;
  subtotalValue.textContent = formatCurrency(subtotal);
  taxValue.textContent = formatCurrency(tax);
  totalValue.textContent = formatCurrency(total);
  updateChange();
  bindCartActions();
}

function bindCartActions() {
  document.querySelectorAll(".increase-item").forEach((button) => {
    button.onclick = () => {
      const item = cart.get(button.dataset.id);
      const inventoryItem = inventory.find((entry) => entry.id === button.dataset.id);
      if (!item || !inventoryItem || item.quantity >= inventoryItem.stock) return;
      item.quantity += 1;
      renderCart();
    };
  });

  document.querySelectorAll(".decrease-item").forEach((button) => {
    button.onclick = () => {
      const item = cart.get(button.dataset.id);
      if (!item) return;
      item.quantity -= 1;
      if (item.quantity <= 0) {
        cart.delete(button.dataset.id);
      }
      renderCart();
    };
  });

  document.querySelectorAll(".remove-item").forEach((button) => {
    button.onclick = () => {
      cart.delete(button.dataset.id);
      renderCart();
    };
  });
}

function addToCart(card) {
  const id = card.dataset.name;
  const stockItem = inventory.find((item) => item.id === id);
  if (!stockItem || stockItem.stock <= 0) {
    alert("Este producto no tiene stock disponible.");
    return;
  }

  const currentQty = cart.get(id)?.quantity || 0;
  if (currentQty >= stockItem.stock) {
    alert("No puedes agregar más unidades que el stock disponible.");
    return;
  }

  if (cart.has(id)) {
    cart.get(id).quantity += 1;
  } else {
    cart.set(id, {
      id,
      name: card.dataset.name,
      price: Number(card.dataset.price),
      quantity: 1,
    });
  }
  renderCart();
}

function applyFilters() {
  const activeFilter = document.querySelector(".soft-btn.active")?.dataset.filter || "all";
  const searchValue = (searchInput?.value || "").trim().toLowerCase();
  products.forEach((product) => {
    const productName = product.dataset.name.toLowerCase();
    const productCategory = product.dataset.category;
    const matchesFilter = activeFilter === "all" || activeFilter === productCategory;
    const matchesSearch = productName.includes(searchValue);
    product.style.display = matchesFilter && matchesSearch ? "" : "none";
  });
}

function renderInventoryTable() {
  inventoryTableBody.innerHTML = inventory
    .map((item) => {
      const statusClass = item.stock <= 10 ? "status-low" : "status-ok";
      const statusText = item.stock <= 10 ? "Stock bajo" : "Disponible";
      return `
        <tr>
          <td>${item.name}</td>
          <td>${item.category}</td>
          <td>${formatCurrency(item.price)}</td>
          <td>${item.stock}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderInventoryBoard() {
  inventoryBoard.innerHTML = inventory
    .map((item) => {
      const icon =
        item.category === "analgesico"
          ? "bi-capsule-pill"
          : item.category === "vitamina"
            ? "bi-heart-pulse"
            : "bi-bandaid";
      const status = item.stock === 0 ? "Agotado" : item.stock <= 10 ? "Stock bajo" : "Disponible";
      return `
        <article class="inventory-tile">
          <i class="bi ${icon}"></i>
          <strong>${item.name}</strong>
          <span>${item.category}</span>
          <span>${formatCurrency(item.price)}</span>
          <span>Existencias: ${item.stock}</span>
          <span>${status}</span>
        </article>
      `;
    })
    .join("");
}

function renderInventoryInsights() {
  const lowStockItems = inventory.filter((item) => item.stock > 0 && item.stock <= 10);
  const outOfStockItems = inventory.filter((item) => item.stock === 0);
  const categories = ["analgesico", "vitamina", "cuidado"].map((category) => {
    const items = inventory.filter((item) => item.category === category);
    const units = items.reduce((sum, item) => sum + item.stock, 0);
    return { category, count: items.length, units };
  });

  inventoryAlerts.innerHTML = [
    ...lowStockItems.slice(0, 4).map(
      (item) => `
        <div class="inventory-alert-item">
          <strong>${item.name}</strong>
          <span>Stock bajo: ${item.stock} unidades disponibles.</span>
        </div>
      `
    ),
    ...outOfStockItems.slice(0, 2).map(
      (item) => `
        <div class="inventory-alert-item">
          <strong>${item.name}</strong>
          <span>Producto agotado. Ya no está disponible para venta.</span>
        </div>
      `
    ),
  ].join("") || `<div class="inventory-alert-item"><strong>Inventario estable</strong><span>No hay alertas críticas por ahora.</span></div>`;

  inventoryCategoryList.innerHTML = categories
    .map(
      (item) => `
        <div class="inventory-category-item">
          <strong><span>${item.category}</span><span>${item.count} productos</span></strong>
          <span>${item.units} unidades disponibles en total.</span>
        </div>
      `
    )
    .join("");

  const totalValue = inventory.reduce((sum, item) => sum + item.price * item.stock, 0);
  inventoryMetricCount.textContent = String(inventory.length);
  inventoryMetricLow.textContent = String(lowStockItems.length);
  inventoryMetricOut.textContent = String(outOfStockItems.length);
  inventoryMetricValue.textContent = formatCurrency(totalValue);
}

function renderClientsTable() {
  clientsTableBody.innerHTML = clients
    .map(
      (client) => `
        <tr>
          <td>${client.name}</td>
          <td>${client.document}</td>
          <td>${client.phone || "-"}</td>
          <td>${client.purchases || 0}</td>
        </tr>
      `
    )
    .join("");
}

function renderClientCards() {
  clientCards.innerHTML = clients
    .map(
      (client) => `
        <article class="client-profile-card">
          <i class="bi bi-person-badge"></i>
          <strong>${client.name}</strong>
          <span>${client.document}</span>
          <div class="client-profile-meta">
            <span>${client.phone || "Sin teléfono"}</span>
            <span>${client.purchases || 0} compras</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderRecentSales() {
  const recent = sales.slice().reverse().slice(0, 5);
  recentSalesList.innerHTML = recent.length
    ? recent
        .map(
          (sale) => `
            <div class="activity-item">
              <strong>${sale.ticketNumber} · ${formatCurrency(sale.total)}</strong>
              <span>${sale.clientName} · ${sale.paymentMethod} · ${sale.date}</span>
            </div>
          `
        )
        .join("")
    : `<div class="activity-item"><strong>Sin ventas recientes</strong><span>Las próximas ventas aparecerán aquí.</span></div>`;
}

function renderHomeAlerts() {
  const outOfStock = inventory.filter((item) => item.stock === 0).length;
  const lowStock = inventory.filter((item) => item.stock > 0 && item.stock <= 10).length;
  const alerts = [
    { title: `${lowStock} productos con stock bajo`, text: "Revisa reposición antes de frenar ventas." },
    { title: `${outOfStock} productos agotados`, text: "Estos productos ya no se pueden vender." },
    { title: `${clients.length} clientes registrados`, text: "La base comercial está lista para usarse." },
  ];
  homeAlerts.innerHTML = alerts
    .map(
      (item) => `
        <div class="alert-item">
          <strong>${item.title}</strong>
          <span>${item.text}</span>
        </div>
      `
    )
    .join("");
}

function renderReportsWidgets() {
  const categories = ["analgesico", "vitamina", "cuidado"].map((category) => ({
    category,
    sold: sales.reduce((sum, sale) => {
      return (
        sum +
        sale.items
          .filter((item) => inventory.find((entry) => entry.id === item.id)?.category === category)
          .reduce((sub, item) => sub + item.quantity, 0)
      );
    }, 0),
  }));
  const max = Math.max(...categories.map((item) => item.sold), 1);
  reportBars.innerHTML = categories
    .map(
      (item) => `
        <div class="report-bar-item">
          <strong><span>${item.category}</span><span>${item.sold} und</span></strong>
          <div class="report-bar-track">
            <div class="report-bar-fill" style="width:${(item.sold / max) * 100}%"></div>
          </div>
        </div>
      `
    )
    .join("");

  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const biggestSale = sales.slice().sort((a, b) => b.total - a.total)[0];
  const lowestStock = inventory.slice().sort((a, b) => a.stock - b.stock)[0];

  reportInsights.innerHTML = [
    {
      title: `Ingreso acumulado ${formatCurrency(revenue)}`,
      text: "Total generado por todas las ventas registradas localmente.",
    },
    {
      title: biggestSale ? `Venta mayor ${biggestSale.ticketNumber}` : "Sin ventas destacadas",
      text: biggestSale ? `${formatCurrency(biggestSale.total)} a ${biggestSale.clientName}.` : "No hay suficiente actividad aún.",
    },
    {
      title: lowestStock ? `${lowestStock.name} requiere atención` : "Inventario estable",
      text: lowestStock ? `Es el producto con menor stock actual: ${lowestStock.stock}.` : "No hay alertas de inventario.",
    },
  ]
    .map(
      (item) => `
        <div class="insight-item">
          <strong>${item.title}</strong>
          <span>${item.text}</span>
        </div>
      `
    )
    .join("");
}

function updateProductCards() {
  products.forEach((card) => {
    const item = inventory.find((entry) => entry.id === card.dataset.name);
    const stockLabel = card.querySelector(".product-meta span");
    const addButton = card.querySelector(".add-to-cart");
    if (!item || !stockLabel || !addButton) return;
    stockLabel.textContent = `Stock ${item.stock}`;
    card.classList.toggle("out-of-stock", item.stock === 0);
    card.classList.toggle("low-stock", item.stock > 0 && item.stock <= 10);
    addButton.disabled = item.stock === 0;
    addButton.textContent = item.stock === 0 ? "Agotado" : "Agregar";
  });
}

function updateSummary() {
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalUnits = sales.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const today = new Date().toLocaleDateString("es-CO");
  const todaySales = sales.filter((sale) => sale.date === today);
  const lowStockItems = inventory.filter((item) => item.stock <= 10).length;
  const clientCounts = clients.slice().sort((a, b) => (b.purchases || 0) - (a.purchases || 0));
  const averageTicket = sales.length ? Math.round(totalRevenue / sales.length) : 0;

  dailySalesValue.textContent = formatCurrency(todaySales.reduce((sum, sale) => sum + sale.total, 0));
  dailySalesCount.textContent = `${todaySales.length} transacciones registradas`;
  inventoryCountValue.textContent = String(inventory.length);
  lowStockValue.textContent = `${lowStockItems} con stock bajo`;
  clientCountValue.textContent = String(clients.length);
  frequentClientValue.textContent = `${clientCounts[0]?.purchases || 0} compras frecuentes`;
  cashValue.textContent = formatCurrency(
    sales.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + sale.total, 0)
  );
  reportRevenue.textContent = formatCurrency(totalRevenue);
  reportUnits.textContent = String(totalUnits);
  reportAverage.textContent = formatCurrency(averageTicket);
  reportTopClient.textContent = clientCounts[0]?.name || "General";
  homeAverageTicket.textContent = formatCurrency(averageTicket);
  homeUnitsSold.textContent = String(totalUnits);
  settingsPaymentMethod.textContent = getSelectedPaymentMethod();
  settingsLastTicket.textContent = sales.length ? sales[sales.length - 1].ticketNumber : "Sin ventas";
}

function buildTicketHtml(sale) {
  const itemsHtml = sale.items
    .map(
      (item) => `
        <div class="ticket-line">
          <span>${item.name} x${item.quantity}</span>
          <strong>${formatCurrency(item.price * item.quantity)}</strong>
        </div>
      `
    )
    .join("");

  return `
    <div>
      <div class="ticket-center">
        <h3>Farma POS</h3>
        <p class="ticket-muted">NIT 900.000.000-1</p>
        <p class="ticket-muted">Ticket ${sale.ticketNumber}</p>
        <p>${sale.date} ${sale.time}</p>
      </div>
      <hr>
      <p>Cliente: ${sale.clientName}</p>
      <p>Documento: ${sale.clientDocument || "Consumidor final"}</p>
      <p>Método: ${sale.paymentMethod}</p>
      ${sale.cashReceived ? `<p>Recibido: ${formatCurrency(sale.cashReceived)}</p>` : ""}
      ${sale.change ? `<p>Cambio: ${formatCurrency(sale.change)}</p>` : ""}
      <hr>
      ${itemsHtml}
      <hr>
      <div class="ticket-total-line"><span>Subtotal</span><strong>${formatCurrency(sale.subtotal)}</strong></div>
      <div class="ticket-total-line"><span>IVA</span><strong>${formatCurrency(sale.tax)}</strong></div>
      <div class="ticket-total-line"><strong>Total</strong><strong>${formatCurrency(sale.total)}</strong></div>
      <div class="ticket-qr">QR</div>
      <p class="ticket-center ticket-muted">Gracias por tu compra</p>
    </div>
  `;
}

function openTicket(html) {
  ticketContent.innerHTML = html;
  ticketModal.hidden = false;
}

function closeTicketModal() {
  ticketModal.hidden = true;
}

function printTicket(html) {
  const printWindow = window.open("", "_blank", "width=420,height=700");
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>Ticket Farma POS</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
          .ticket-line, .ticket-total-line { display:flex; justify-content:space-between; gap:12px; margin:8px 0; }
          hr { border:0; border-top:1px dashed #999; margin:12px 0; }
          h3, p { margin:0 0 6px; }
          .ticket-center { text-align:center; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function finishSale() {
  const items = Array.from(cart.values());
  if (!items.length) {
    alert("Agrega productos antes de cobrar.");
    return;
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;
  const paymentMethod = getSelectedPaymentMethod();
  const cashReceived = paymentMethod === "Efectivo" ? Number(cashReceivedInput?.value || 0) : 0;
  const change = paymentMethod === "Efectivo" ? Math.max(0, cashReceived - total) : 0;

  if (paymentMethod === "Efectivo" && cashReceived < total) {
    alert("El valor recibido no cubre el total de la venta.");
    return;
  }

  const currentClient = getSelectedClient();
  const now = new Date();
  const sale = {
    id: crypto.randomUUID(),
    ticketNumber: `T-${String(sales.length + 1).padStart(4, "0")}`,
    clientName: currentClient?.name || "Cliente general",
    clientDocument: currentClient?.document || "",
    date: now.toLocaleDateString("es-CO"),
    time: now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    paymentMethod,
    cashReceived,
    change,
    subtotal,
    tax,
    total,
    items,
  };

  items.forEach((item) => {
    const inventoryItem = inventory.find((entry) => entry.id === item.id);
    if (inventoryItem) {
      inventoryItem.stock = Math.max(0, inventoryItem.stock - item.quantity);
    }
  });

  const matchedClient = clients.find((client) => client.id === currentClient?.id);
  if (matchedClient) {
    matchedClient.purchases = (matchedClient.purchases || 0) + 1;
  }

  sales.push(sale);
  lastTicketHtml = buildTicketHtml(sale);
  saveData();
  cart.clear();
  if (cashReceivedInput) {
    cashReceivedInput.value = "";
  }
  refreshAll();
  openTicket(lastTicketHtml);
}

function refreshAll() {
  renderCart();
  renderInventoryTable();
  renderInventoryBoard();
  renderInventoryInsights();
  renderClientsTable();
  renderClientCards();
  renderRecentSales();
  renderHomeAlerts();
  renderReportsWidgets();
  renderClientOptions();
  updateProductCards();
  updateCashPanel();
  updateSummary();
}

addButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const card = button.closest(".product-card");
    if (card) addToCart(card);
  });
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    applyFilters();
  });
});

paymentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    paymentButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    updateCashPanel();
    updateSummary();
  });
});

navViewButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    switchView(button.dataset.view);
  });
});

searchInput?.addEventListener("input", applyFilters);

saleClientSelect?.addEventListener("change", () => {
  selectedClientId = saleClientSelect.value;
  renderClientOptions();
});

cashReceivedInput?.addEventListener("input", updateChange);

clearCartButton?.addEventListener("click", () => {
  cart.clear();
  if (cashReceivedInput) {
    cashReceivedInput.value = "";
  }
  renderCart();
});

checkoutSaleButton?.addEventListener("click", finishSale);

newSaleButton?.addEventListener("click", () => {
  cart.clear();
  if (cashReceivedInput) {
    cashReceivedInput.value = "";
  }
  renderCart();
  switchView("sales");
});

focusSearchButton?.addEventListener("click", () => searchInput?.focus());
goToSales?.addEventListener("click", () => switchView("sales"));
goToInventory?.addEventListener("click", () => switchView("inventory"));

clientForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("clientName").value.trim();
  const documentId = document.getElementById("clientDoc").value.trim();
  const phone = document.getElementById("clientPhone").value.trim();
  if (!name || !documentId) return;

  const newClient = {
    id: crypto.randomUUID(),
    name,
    document: documentId,
    phone,
    purchases: 0,
  };

  clients.push(newClient);
  selectedClientId = newClient.id;
  saveData();
  clientForm.reset();
  refreshAll();
  switchView("clients");
});

closeTicket?.addEventListener("click", closeTicketModal);
ticketOverlay?.addEventListener("click", closeTicketModal);

printTicketButton?.addEventListener("click", () => {
  if (ticketContent.innerHTML) {
    printTicket(ticketContent.innerHTML);
  }
});

downloadTicketButton?.addEventListener("click", () => {
  if (!ticketContent.innerHTML) return;
  const blob = new Blob([ticketContent.innerHTML], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ticket-farmapos.html";
  link.click();
  URL.revokeObjectURL(url);
});

printLastTicketButton?.addEventListener("click", () => {
  if (!lastTicketHtml) {
    alert("Aún no hay tickets generados.");
    return;
  }
  openTicket(lastTicketHtml);
});

exportDataButton?.addEventListener("click", () => {
  const data = { inventory, clients, sales };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "farmapos-data.json";
  link.click();
  URL.revokeObjectURL(url);
});

resetDataButton?.addEventListener("click", () => {
  const confirmed = window.confirm("Esto borrará ventas, clientes e inventario guardados en este navegador. ¿Deseas continuar?");
  if (!confirmed) return;
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  window.location.reload();
});

refreshAll();
switchView("home");
