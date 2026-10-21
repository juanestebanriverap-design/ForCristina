import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { api } from "../api.js";

function moneyCOP(n) {
  const num = Number(n || 0);
  return num.toLocaleString("es-CO", { style: "currency", currency: "COP" });
}

function normalizePhoneCO(phone) {
  // WhatsApp requiere solo dígitos y código de país.
  // Si el número ya viene con 57, lo deja. Si no, lo agrega (asumiendo Colombia).
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("57")) return digits;
  // Si es móvil colombiano típico (10 dígitos), antepone 57
  if (digits.length === 10) return `57${digits}`;
  return digits; // fallback
}

export default function BillingPanel({ company }) {
  const invoiceRef = useRef(null);

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);

  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState([]);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // info de factura generada
  const [invoice, setInvoice] = useState(null); // { saleId, date, client, items, total }

  const today = useMemo(() => new Date(), []);

  async function load() {
    setClients(await api.listClients());
    setProducts(await api.listProducts());
  }

  useEffect(() => {
    load();
  }, []);

  const selectedClient = useMemo(() => {
    const id = Number(clientId);
    return clients.find((c) => c.id === id) || null;
  }, [clientId, clients]);

function addItem() {
  const first = products[0];
  if (!first) return;
  setItems((it) => [...it, { product_id: first.id, quantity: 1, unit_price: 1000 }]);
}

function removeDraftItem(idx) {
  setItems((arr) => arr.filter((_, i) => i !== idx));
}

function lineSubtotal(i) {
    return Number(i.quantity) * Number(i.unit_price);
  }

  function total() {
    return items.reduce((a, i) => a + lineSubtotal(i), 0);
  }

  function productName(product_id) {
    const p = products.find((x) => x.id === Number(product_id));
    return p ? p.name : `Producto #${product_id}`;
  }

  async function refreshInvoice(saleId = invoice?.saleId) {
    if (!saleId) return;
    const fresh = await api.getSale(saleId);
    setInvoice((prev) => ({
      ...(prev || {}),
      saleId: fresh.id,
      items: fresh.items || [],
      total: fresh.total,
      date: fresh.sale_date || fresh.created_at,
      client: fresh.client_id ?? null,
    }));
  }

  async function onDeleteInvoiceItem(itemId) {
    if (!invoice?.saleId) return;
    try {
      await api.deleteSaleItem(invoice.saleId, itemId);
      await refreshInvoice(invoice.saleId);
      setProducts(await api.listProducts()); // refresca stock
    } catch (e) {
      alert(e.message);
    }
  }

  async function onChangeInvoiceItemQty(itemId, qty) {
    if (!invoice?.saleId) return;
    const q = Number(qty);
    if (!Number.isFinite(q) || q < 1) return;

    try {
      await api.updateSaleItemQuantity(invoice.saleId, itemId, q);
      await refreshInvoice(invoice.saleId);
      setProducts(await api.listProducts()); // refresca stock
    } catch (e) {
      alert(e.message);
    }
  }

  async function submit() {
    setError("");
    setOk("");
    try {
      const payload = {
        client_id: clientId ? Number(clientId) : null,
        items: items.map((i) => ({
          product_id: Number(i.product_id),
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        })),
      };

      const res = await api.createSale(payload);

      // Traer la venta real (con IDs reales de sale_items)
      const fresh = await api.getSale(res.id);

      setInvoice({
        saleId: fresh.id,
        date: fresh.sale_date || fresh.created_at,
        client: fresh.client_id ?? null,
        items: fresh.items || [],
        total: fresh.total,
      });

      setOk(`Factura creada. ID: ${fresh.id} Total: ${moneyCOP(fresh.total)}`);

      setItems([]);
      setProducts(await api.listProducts()); // refresca stock
    } catch (e) {
      setError(e.message);
    }
  }

  async function captureTicketCanvas() {
    if (!invoiceRef.current) return null;

    // Crear contenedor temporal blanco (fuera del tema oscuro)
    const stage = document.createElement("div");
    stage.style.position = "fixed";
    stage.style.left = "-10000px";
    stage.style.top = "0";
    stage.style.background = "#ffffff";
    stage.style.padding = "20px";
    stage.style.zIndex = "999999";

    // Clonar ticket
    const clone = invoiceRef.current.cloneNode(true);
    // Asegurar colores
    clone.style.background = "#ffffff";
    clone.style.color = "#000000";

    stage.appendChild(clone);
    document.body.appendChild(stage);

    try {
      const canvas = await html2canvas(clone, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      return canvas;
    } finally {
      document.body.removeChild(stage);
    }
  }

  async function downloadPNG() {
    const canvas = await captureTicketCanvas();
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `factura-ticket-${invoice?.saleId || "sin-id"}.png`;
    a.click();
  }

  async function downloadPDF() {
    const canvas = await captureTicketCanvas();
    if (!canvas) return;

    const imgData = canvas.toDataURL("image/png");

    // Tamaño PDF tipo ticket (80mm de ancho es común). Aquí usamos 80mm x altura automática.
    const pdfWidth = 80; // mm
    const pxToMm = (px) => px * 0.264583; // aprox 96dpi
    const imgWidthMm = pdfWidth;
    const imgHeightMm = pxToMm(canvas.height) * (imgWidthMm / pxToMm(canvas.width));

    const pdf = new jsPDF({
      orientation: "p",
      unit: "mm",
      format: [pdfWidth, Math.max(120, imgHeightMm + 10)],
    });

    pdf.addImage(imgData, "PNG", 0, 0, imgWidthMm, imgHeightMm);
    pdf.save(`factura-ticket-${invoice?.saleId || "sin-id"}.pdf`);
  }

  function openWhatsApp() {
    const phone = normalizePhoneCO(selectedClient?.phone);
    if (!phone) {
      alert("Este cliente no tiene teléfono. Agrega el teléfono en Clientes.");
      return;
    }
    const msg =
      `Hola ${selectedClient?.name || ""}. ` +
      `Aquí está tu factura #${invoice?.saleId}. ` +
      `Total: ${moneyCOP(invoice?.total)}. ` +
      `Gracias por tu compra.`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="card">
      <h2>Facturación</h2>

      <section className="panel">
        <div className="grid grid-2">
          <div className="full">
            <label>Cliente</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">(Sin cliente)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="muted" style={{ marginTop: 6 }}>
              Consejo: Si quieres mandar factura por whatsapp al cliente, asegúrate de agregar su teléfono en Clientes.
            </div>
          </div>
        </div>

        <button className="btn secondary" onClick={addItem} disabled={products.length === 0}>
          + Agregar producto
        </button>

        <div style={{ height: 12 }} />

{items.map((it, idx) => (
  <div key={idx} className="billing-line">
    <div>
      <label>Producto</label>
      <select
        value={it.product_id}
        onChange={(e) =>
          setItems((arr) =>
            arr.map((x, i) => (i === idx ? { ...x, product_id: e.target.value } : x))
          )
        }
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} (stock {p.stock})
          </option>
        ))}
      </select>
    </div>

    <div>
      <label>Cantidad</label>
      <input
        type="number"
        min="1"
        value={it.quantity}
        onChange={(e) =>
          setItems((arr) =>
            arr.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x))
          )
        }
      />
    </div>

    <div>
      <label>Precio venta (COP)</label>
      <input
        type="number"
        step="1"
        min="0"
        value={it.unit_price}
        onChange={(e) =>
          setItems((arr) =>
            arr.map((x, i) => (i === idx ? { ...x, unit_price: e.target.value } : x))
          )
        }
      />
      <div className="muted" style={{ marginTop: 6 }}>
        Subtotal: {moneyCOP(lineSubtotal(it))}
      </div>
    </div>

    <div>
      <label>Acciones</label>
      <button className="btn secondary" onClick={() => removeDraftItem(idx)}>
        Eliminar
      </button>
    </div>
  </div>
))}

        <div className="row">
          <strong>Total: {moneyCOP(total())}</strong>
          <button className="btn" onClick={submit} disabled={items.length === 0}>
            Guardar factura
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {ok && <div className="ok">{ok}</div>}
      </section>

      {invoice && (
        <section className="panel">
          <div className="row">
            <h3 style={{ margin: 0 }}>Vista de factura</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn secondary" onClick={downloadPDF}>
                Descargar PDF
              </button>
              <button className="btn secondary" onClick={downloadPNG}>
                Descargar imagen
              </button>
              <button className="btn" onClick={openWhatsApp}>
                Enviar por WhatsApp
              </button>
            </div>
          </div>

          {/* Área imprimible/exportable */}
          <div className="ticket-wrap">
            <div className="ticket" ref={invoiceRef}>
              {/* ENCABEZADO */}
              <div className="t-center">
                <div className="t-title">{company?.name || "Empresa"}</div>
                <div className="t-muted">
                  RUT: {company?.rut || "-"} • Tel: {company?.phone || "-"}
                </div>
                <div className="t-muted">Dirección: {company?.address || "-"}</div>
              </div>

              <div className="t-line" />

              {/* DATOS FACTURA */}
              <div className="t-row">
                <div>
                  <strong>Factura</strong>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong># {invoice.saleId}</strong>
                </div>
              </div>
              <div className="t-row">
                <div>
                  <strong>Fecha</strong>
                </div>
                <div style={{ textAlign: "right" }}>{invoice.date}</div>
              </div>

              <div className="t-line" />

              {/* CLIENTE (usa selectedClient porque invoice.client es client_id) */}
              <div className="t-row">
                <div>
                  <strong>Cliente</strong>
                </div>
                <div style={{ textAlign: "right" }}>{selectedClient?.name || "Mostrador"}</div>
              </div>
              <div className="t-row">
                <div>
                  <strong>Tel</strong>
                </div>
                <div style={{ textAlign: "right" }}>{selectedClient?.phone || "-"}</div>
              </div>

              <div className="t-line" />

              {/* ITEMS (campo: valor) */}
              <div className="t-items">
                {invoice.items.map((i, idx) => (
                  <div className="t-item-card" key={i.id ?? idx}>
                    <div className="t-field">
                      <div className="t-label">Producto:</div>
                      <div className="t-value">
                        {i.product_name || i.name || `Producto #${i.product_id}`}
                      </div>
                    </div>

                    <div className="t-field">
                      <div className="t-label">Cantidad:</div>
                      <div
                        className="t-value"
                        style={{ display: "flex", gap: 8, alignItems: "center" }}
                      >
                        <input
                          type="number"
                          min={1}
                          value={i.quantity}
                          onChange={(e) => onChangeInvoiceItemQty(i.id, e.target.value)}
                          style={{ width: 80 }}
                        />
                        <button
                          className="btn secondary"
                          onClick={() => onDeleteInvoiceItem(i.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="t-field">
                      <div className="t-label">Precio:</div>
                      <div className="t-value">{moneyCOP(i.unit_price)}</div>
                    </div>

                    <div className="t-field">
                      <div className="t-label">Subtotal:</div>
                      <div className="t-value">{moneyCOP(i.subtotal)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="t-line" />

              {/* TOTALES */}
              <div className="t-total-row">
                <div className="t-strong">TOTAL</div>
                <div className="t-strong">{moneyCOP(invoice.total)}</div>
              </div>

              <div className="t-line" />

              <div className="t-center t-foot">
                Gracias por tu compra.
                <div className="t-muted">Conserve este comprobante.</div>
              </div>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 10 }}>
            WhatsApp: se abre con el mensaje listo. Luego adjunta el PDF o la imagen descargada.
          </p>
        </section>
      )}
    </div>
  );
}