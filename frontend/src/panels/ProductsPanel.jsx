import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function ProductsPanel() {
  const empty = useMemo(
    () => ({ name: "", purchase_price: 0.1, stock: 0, category: "", description: "" }),
    []
  );

  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(empty);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setError(""); setOk("");
    try {
      setItems(await api.listProducts());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setError(""); setOk("");
    try {
      await api.createProduct({
        ...creating,
        purchase_price: toNum(creating.purchase_price, 0),
        stock: toNum(creating.stock, 0)
      });
      setCreating(empty);
      setOk("Producto agregado.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditing({
      name: p.name ?? "",
      purchase_price: p.purchase_price ?? 0,
      stock: p.stock ?? 0,
      category: p.category ?? "",
      description: p.description ?? ""
    });
    setOk(""); setError("");
  }

  async function saveEdit() {
    setError(""); setOk("");
    try {
      await api.updateProduct(editingId, {
        ...editing,
        purchase_price: toNum(editing.purchase_price, 0),
        stock: toNum(editing.stock, 0),
        category: editing.category || null,
        description: editing.description || null
      });
      setEditingId(null);
      setOk("Producto actualizado.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditing(empty);
  }

  async function del(id) {
    if (!confirm("¿Eliminar producto?")) return;
    setError(""); setOk("");
    try {
      await api.deleteProduct(id);
      setOk("Producto eliminado.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card">
      <div className="panel-header">
        <h2>Productos</h2>
        <p className="muted">Agrega, edita o elimina productos de tu bodega.</p>
      </div>

      <section className="panel">
        <h3>Agregar producto</h3>
        <form onSubmit={create} className="grid grid-3">
          <div>
            <label>Nombre</label>
            <input value={creating.name} onChange={(e) => setCreating(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label>Categoría</label>
            <input value={creating.category} onChange={(e) => setCreating(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div>
            <label>Stock</label>
            <input type="number" value={creating.stock} onChange={(e) => setCreating(f => ({ ...f, stock: e.target.value }))} />
          </div>
          <div>
            <label>Costo compra</label>
            <input type="number" step="0.01" value={creating.purchase_price} onChange={(e) => setCreating(f => ({ ...f, purchase_price: e.target.value }))} />
          </div>
          <div className="full">
            <label>Descripción (opcional)</label>
            <input value={creating.description} onChange={(e) => setCreating(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="full">
            <button className="btn">Agregar</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h3>Lista de productos</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>ID</th>
              <th>Nombre</th>
              <th style={{ width: 120 }}>Costo</th>
              <th style={{ width: 90 }}>Stock</th>
              <th style={{ width: 160 }}>Categoría</th>
              <th style={{ width: 210 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <tr key={p.id}>
                  <td>{p.id}</td>

                  <td>
                    {isEditing ? (
                      <input value={editing.name} onChange={(e) => setEditing(s => ({ ...s, name: e.target.value }))} />
                    ) : (
                      p.name
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input type="number" step="0.01" value={editing.purchase_price}
                        onChange={(e) => setEditing(s => ({ ...s, purchase_price: e.target.value }))} />
                    ) : (
                      p.purchase_price
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input type="number" value={editing.stock}
                        onChange={(e) => setEditing(s => ({ ...s, stock: e.target.value }))} />
                    ) : (
                      p.stock
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input value={editing.category} onChange={(e) => setEditing(s => ({ ...s, category: e.target.value }))} />
                    ) : (
                      p.category || "-"
                    )}
                  </td>

                  <td style={{ display: "flex", gap: 8 }}>
                    {isEditing ? (
                      <>
                        <button className="btn" type="button" onClick={saveEdit}>Guardar</button>
                        <button className="btn secondary" type="button" onClick={cancelEdit}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className="btn secondary" type="button" onClick={() => startEdit(p)}>Editar</button>
                        <button className="btn danger" type="button" onClick={() => del(p.id)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok">{ok}</div>}
    </div>
  );
}