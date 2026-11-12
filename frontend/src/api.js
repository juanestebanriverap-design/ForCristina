// En desarrollo local usa el backend local; las compilaciones de producción requieren la URL de Render.
export const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:4000/api" : "");
export function setToken(token) {
  localStorage.setItem("token", token);
}


export function getToken() {
  return localStorage.getItem("token");
}

export function clearToken() {
  localStorage.removeItem("token");
}

async function request(path, options = {}) {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_BASE_URL con la dirección pública de la API.");
  }
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

export const api = {
  // auth
  login: ({ email, password }) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  registerAdmin: (data) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  // products
  listProducts: () => request("/products"),
  createProduct: (p) => request("/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id, p) => request(`/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),

  // clients
  listClients: () => request("/clients"),
  createClient: (c) => request("/clients", { method: "POST", body: JSON.stringify(c) }),
  updateClient: (id, c) => request(`/clients/${id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: "DELETE" }),

  // sales
  createSale: (sale) => request("/sales", { method: "POST", body: JSON.stringify(sale) }),
  updateSale: (saleId, sale) =>
    request(`/sales/${saleId}`, { method: "PUT", body: JSON.stringify(sale) }),
  listSales: () => request("/sales"),
  getSale: (saleId) => request(`/sales/${saleId}`),

  deleteSaleItem: (saleId, itemId) =>
    request(`/sales/${saleId}/items/${itemId}`, { method: "DELETE" }),

  updateSaleItemQuantity: (saleId, itemId, quantity) =>
    request(`/sales/${saleId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }),

  // reports
  dailyReport: (date) => request(`/reports/daily?date=${encodeURIComponent(date)}`),
  monthlyReport: (year, month) => request(`/reports/monthly?year=${year}&month=${month}`),
  byAddressReport: (year, month) =>
    request(`/reports/by-address?year=${year}&month=${month}`),

  // suppliers and purchase orders
  listSuppliers: () => request("/suppliers"),
  createSupplier: (supplier) =>
    request("/suppliers", { method: "POST", body: JSON.stringify(supplier) }),
  updateSupplier: (id, supplier) =>
    request(`/suppliers/${id}`, { method: "PUT", body: JSON.stringify(supplier) }),
  deleteSupplier: (id) => request(`/suppliers/${id}`, { method: "DELETE" }),
  listPurchaseOrders: () => request("/suppliers/orders"),
  createPurchaseOrder: (supplierId, items) =>
    request(`/suppliers/${supplierId}/orders`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  receivePurchaseOrder: (orderId) =>
    request(`/suppliers/orders/${orderId}/receive`, {
      method: "POST",
      body: "{}",
    }),

  // company
  getCompany: () => request("/company"),
  saveCompany: (data) => request("/company", { method: "POST", body: JSON.stringify(data) }),
};