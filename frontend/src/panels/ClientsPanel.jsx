import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

export default function ClientsPanel() {
  const empty = useMemo(() => ({ name: "", phone: "", address: "", notes: "" }), []);
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(empty);

  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(empty);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setError(""); setOk("");
    try { setItems(await api.listClients()); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setError(""); setOk("");
    try {
      await api.createClient({
        ...creating,
        phone: creating.phone || null,
        address: creating.address || null,
        notes: creating.notes || null
      });
      setCreating(empty);
      setOk("Cliente agregado.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditing({
      name: c.name ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      notes: c.notes ?? ""
    });
    setError(""); setOk("");
  }

  async function saveEdit() {
    setError(""); setOk("");
    try {
      await api.updateClient(editingId, {
        ...editing,
        phone: editing.phone || null,
        address: editing.address || null,
        notes: editing.notes || null
      });
      setEditingId(null);
      setOk("Cliente actualizado.");
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
    if (!confirm("¿Eliminar cliente?")) return;
    setError(""); setOk("");
    try {
      await api.deleteClient(id);
      setOk("Cliente eliminado.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card">
      <div className="panel-header">
        <h2>Clientes</h2>
        <p className="muted">Gestiona tu lista de clientes para facturación y reportes.</p>
      </div>

      <section className="panel">
        <h3>Agregar cliente ejemplo: (Trixie la zorra)</h3>
        <form onSubmit={create} className="grid grid-2">
          <div>
            <label>Nombre</label>
            <input value={creating.name} onChange={(e) => setCreating(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label>Teléfono</label>
            <input value={creating.phone} onChange={(e) => setCreating(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="full">
            <label>Ruta</label>
            <input value={creating.address} onChange={(e) => setCreating(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="full">
            <label>Notas (opcional)</label>
            <input value={creating.notes} onChange={(e) => setCreating(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="full">
            <button className="btn">Agregar</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h3>Lista de clientes</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>ID</th>
              <th>Nombre</th>
              <th style={{ width: 170 }}>Teléfono</th>
              <th>Ruta</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const isEditing = editingId === c.id;
              return (
                <tr key={c.id}>
                  <td>{c.id}</td>

                  <td>
                    {isEditing ? (
                      <input value={editing.name} onChange={(e) => setEditing(s => ({ ...s, name: e.target.value }))} />
                    ) : (
                      c.name
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input value={editing.phone} onChange={(e) => setEditing(s => ({ ...s, phone: e.target.value }))} />
                    ) : (
                      c.phone || "-"
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input value={editing.address} onChange={(e) => setEditing(s => ({ ...s, address: e.target.value }))} />
                    ) : (
                      c.address || "-"
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
                        <button className="btn secondary" type="button" onClick={() => startEdit(c)}>Editar</button>
                        <button className="btn danger" type="button" onClick={() => del(c.id)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">"Notas" es para una actualizacion futura del sistema, todavia no esta disponible la visualizacion de estas.</p>
      </section>

      {error && <div className="error">{error}</div>}
      {ok && <div className="ok">{ok}</div>}
    </div>
  );
}