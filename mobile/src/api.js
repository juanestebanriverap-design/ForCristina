export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? "http://192.168.1.5:4000/api" : "");

async function request(token, path, options = {}) {
  if (!API_URL) {
    throw new Error("Falta configurar EXPO_PUBLIC_API_URL con la dirección pública de la API.");
  }
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(`No se pudo conectar con ${API_URL}. Revisa que el celular y el computador estén en la misma red Wi-Fi.`);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data?.issues)
      ? data.issues.map((issue) => issue.message).join(", ")
      : data?.message;
    throw new Error(detail || "No se pudo completar la solicitud.");
  }
  return data;
}

const json = (data) => ({ method: "POST", body: JSON.stringify(data) });

export const api = {
  login: (data) => request("", "/auth/login", json(data)),
  registerAdmin: (data) => request("", "/auth/register", json(data)),
  getCompany: (token) => request(token, "/company"),
  saveCompany: (token, data) => request(token, "/company", json(data)),
  listProducts: (token) => request(token, "/products"),
  createProduct: (token, data) => request(token, "/products", json(data)),
  updateProduct: (token, id, data) =>
    request(token, `/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (token, id) => request(token, `/products/${id}`, { method: "DELETE" }),
  listClients: (token) => request(token, "/clients"),
  createClient: (token, data) => request(token, "/clients", json(data)),
  updateClient: (token, id, data) =>
    request(token, `/clients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteClient: (token, id) => request(token, `/clients/${id}`, { method: "DELETE" }),
  createSale: (token, data) => request(token, "/sales", json(data)),
  updateSale: (token, id, data) =>
    request(token, `/sales/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  listSales: (token) => request(token, "/sales"),
  getSale: (token, id) => request(token, `/sales/${id}`),
  listSuppliers: (token) => request(token, "/suppliers"),
  createSupplier: (token, data) => request(token, "/suppliers", json(data)),
  updateSupplier: (token, id, data) =>
    request(token, `/suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSupplier: (token, id) => request(token, `/suppliers/${id}`, { method: "DELETE" }),
  listPurchaseOrders: (token) => request(token, "/suppliers/orders"),
  createPurchaseOrder: (token, supplierId, items) =>
    request(token, `/suppliers/${supplierId}/orders`, json({ items })),
  receivePurchaseOrder: (token, orderId) =>
    request(token, `/suppliers/orders/${orderId}/receive`, { method: "POST", body: "{}" }),
  dailyReport: (token, date) =>
    request(token, `/reports/daily?date=${encodeURIComponent(date)}`),
  monthlyReport: (token, year, month) =>
    request(token, `/reports/monthly?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
  byAddressReport: (token, year, month) =>
    request(token, `/reports/by-address?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
};
