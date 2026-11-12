import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

function money(value) {
  return Number(value || 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
  });
}

const emptySupplier = { name: "", phone: "", notes: "", products: [] };

export default function SuppliersPanel() {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [activeSupplier, setActiveSupplier] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [whatsAppUrl, setWhatsAppUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [productRows, supplierRows, orderRows] = await Promise.all([
        api.listProducts(),
        api.listSuppliers(),
        api.listPurchaseOrders(),
      ]);
      setProducts(productRows);
      setSuppliers(supplierRows);
      setOrders(orderRows);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLocaleLowerCase();
    return products.filter((product) =>
      product.name.toLocaleLowerCase().includes(search)
    );
  }, [products, productSearch]);

  function startCreate() {
    setEditingId(null);
    setForm({ ...emptySupplier, products: [] });
    setProductSearch("");
    setWhatsAppUrl("");
    setError("");
    setNotice("");
  }

  function startEdit(supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      phone: supplier.phone,
      notes: supplier.notes || "",
      products: supplier.products.map((item) => ({
        product_id: item.product_id,
        purchase_price: String(item.purchase_price),
      })),
    });
    setProductSearch("");
    setWhatsAppUrl("");
    setError("");
    setNotice("");
  }

  function toggleProduct(product) {
    setForm((current) => {
      const exists = current.products.some((item) => item.product_id === product.id);
      return {
        ...current,
        products: exists
          ? current.products.filter((item) => item.product_id !== product.id)
          : [...current.products, {
            product_id: product.id,
            purchase_price: String(product.purchase_price),
          }],
      };
    });
  }

  async function saveSupplier(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Escribe el nombre y el teléfono del proveedor.");
      return;
    }
    if (form.products.some((item) =>
      !Number.isFinite(Number(item.purchase_price)) || Number(item.purchase_price) <= 0
    )) {
      setError("Escribe un precio de compra válido para cada producto seleccionado.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim() || null,
        products: form.products.map((item) => ({
          product_id: item.product_id,
          purchase_price: Number(item.purchase_price),
        })),
      };
      if (editingId === null) await api.createSupplier(data);
      else await api.updateSupplier(editingId, data);
      setForm(null);
      setEditingId(null);
      setNotice(editingId === null ? "Proveedor agregado." : "Proveedor actualizado.");
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSupplier(supplier) {
    if (!window.confirm(`¿Eliminar al proveedor ${supplier.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteSupplier(supplier.id);
      setNotice("Proveedor eliminado.");
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event) {
    event.preventDefault();
    const items = activeSupplier.products
      .map((item) => ({
        product_id: item.product_id,
        quantity: Number(quantities[item.product_id] || 0),
      }))
      .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
    if (!items.length) {
      setError("Indica la cantidad de al menos un producto para hacer el pedido.");
      return;
    }

    setBusy(true);
    setError("");
    setWhatsAppUrl("");
    try {
      const order = await api.createPurchaseOrder(activeSupplier.id, items);
      const message = [
        `Hola ${order.supplier.name}, quiero hacer este pedido:`,
        ...order.items.map((item) =>
          `• ${item.quantity} × ${item.product_name} — ${money(item.purchase_price)} c/u`
        ),
        `Pedido #${order.id}`,
      ].join("\n");
      const phone = order.supplier.phone.replace(/\D/g, "");
      setWhatsAppUrl(
        phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : ""
      );
      setNotice(
        `Pedido #${order.id} guardado como pendiente. El stock subirá cuando marques la recepción.`
      );
      setActiveSupplier(null);
      setQuantities({});
      await load();
    } catch (orderError) {
      setError(orderError.message);
    } finally {
      setBusy(false);
    }
  }

  async function receiveOrder(order) {
    if (!window.confirm(
      `¿Confirmar recepción del pedido #${order.id}? Se sumarán ${order.items.reduce((sum, item) => sum + item.quantity, 0)} unidades al inventario.`
    )) return;
    setBusy(true);
    setError("");
    try {
      await api.receivePurchaseOrder(order.id);
      setNotice(`Pedido #${order.id} recibido. El inventario fue actualizado.`);
      await load();
    } catch (receiveError) {
      setError(receiveError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="panel-header">
        <h2>Proveedores</h2>
        <p className="muted">Administra proveedores, pedidos y recepciones de inventario.</p>
        {!form && !activeSupplier && (
          <div><button className="btn" type="button" onClick={startCreate}>Agregar proveedor</button></div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="ok">{notice}</div>}
      {whatsAppUrl && (
        <p><a className="btn" href={whatsAppUrl} target="_blank" rel="noreferrer">Abrir pedido en WhatsApp</a></p>
      )}

      {form && (
        <section className="panel">
          <h3>{editingId === null ? "Nuevo proveedor" : "Editar proveedor"}</h3>
          <form onSubmit={saveSupplier} className="grid grid-2">
            <div>
              <label>Nombre del proveedor</label>
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div>
              <label>Teléfono / WhatsApp</label>
              <input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </div>
            <div className="full">
              <label>Notas</label>
              <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="full">
              <h4>Productos que vende y precio de compra</h4>
              <label>Buscar producto</label>
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar producto del inventario" />
              {filteredProducts.map((product) => {
                const selected = form.products.find((item) => item.product_id === product.id);
                return (
                  <div className="supplier-product-row" key={product.id}>
                    <label className="supplier-product-check">
                      <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleProduct(product)} />
                      {product.name}
                    </label>
                    {selected && (
                      <label>
                        Precio de compra
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={selected.purchase_price}
                          onChange={(event) => setForm({
                            ...form,
                            products: form.products.map((item) =>
                              item.product_id === product.id
                                ? { ...item, purchase_price: event.target.value }
                                : item
                            ),
                          })}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
              {!filteredProducts.length && <p className="muted">No hay productos que coincidan.</p>}
              <p className="muted">Seleccionados: {form.products.length}</p>
            </div>
            <div className="row full">
              <button className="btn" disabled={busy}>{busy ? "Guardando..." : "Guardar proveedor"}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)} disabled={busy}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {activeSupplier && (
        <section className="panel">
          <h3>Pedido para {activeSupplier.name}</h3>
          <p className="muted">El inventario no cambia hasta que marques el pedido como recibido.</p>
          <form onSubmit={createOrder}>
            <table className="table">
              <thead><tr><th>Producto</th><th>Precio</th><th>Cantidad</th></tr></thead>
              <tbody>
                {activeSupplier.products.map((item) => (
                  <tr key={item.product_id}>
                    <td>{item.product_name}</td>
                    <td>{money(item.purchase_price)}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={quantities[item.product_id] || ""}
                        onChange={(event) => setQuantities({
                          ...quantities,
                          [item.product_id]: event.target.value,
                        })}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button className="btn" disabled={busy}>{busy ? "Creando pedido..." : "Crear pedido"}</button>
              <button className="btn secondary" type="button" onClick={() => setActiveSupplier(null)} disabled={busy}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {!form && !activeSupplier && (
        <section className="panel">
          <h3>Lista de proveedores</h3>
          {!suppliers.length && <p className="muted">Todavía no hay proveedores registrados.</p>}
          {suppliers.map((supplier) => (
            <div className="supplier-card" key={supplier.id}>
              <div>
                <strong>{supplier.name}</strong>
                <div className="muted">{supplier.phone}</div>
                {supplier.notes && <div className="muted">{supplier.notes}</div>}
                <div className="muted">
                  {supplier.products.length
                    ? supplier.products.map((item) => `${item.product_name} (${money(item.purchase_price)})`).join(" · ")
                    : "Aún no tiene productos asociados."}
                </div>
              </div>
              <div className="row">
                <button className="btn" type="button" onClick={() => {
                  setActiveSupplier(supplier);
                  setQuantities({});
                  setError("");
                }} disabled={!supplier.products.length}>Hacer pedido</button>
                <button className="btn secondary" type="button" onClick={() => startEdit(supplier)} disabled={busy}>Editar</button>
                <button className="btn danger" type="button" onClick={() => deleteSupplier(supplier)} disabled={busy}>Eliminar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h3>Pedidos</h3>
          <button className="btn secondary" type="button" onClick={load} disabled={busy}>Actualizar</button>
        </div>
        {!orders.length && <p className="muted">Todavía no hay pedidos.</p>}
        {orders.map((order) => (
          <div className="supplier-card" key={order.id}>
            <div>
              <strong>Pedido #{order.id} · {order.supplier_name}</strong>
              <div className="muted">
                {order.status === "received" ? "Recibido" : "Pendiente"} · {String(order.created_at).slice(0, 10)}
              </div>
              {order.items.map((item) => (
                <div className="muted" key={item.id}>
                  {item.quantity} × {item.product_name} · {money(item.unit_price)} c/u
                </div>
              ))}
            </div>
            {order.status === "pending" && (
              <button className="btn" type="button" onClick={() => receiveOrder(order)} disabled={busy}>
                Marcar como recibido
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
