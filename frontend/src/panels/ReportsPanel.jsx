import React, { useMemo, useState } from "react";
import { api } from "../api.js";

function StatCard({ title, value, subtitle }) {
  return (
    <div className="stat">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
    </div>
  );
}

function money(n) {
  const num = Number(n || 0);
  return num.toLocaleString("es-CO", { style: "currency", currency: "COP" });
}

export default function ReportsPanel() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const now = useMemo(() => new Date(), []);

  const [date, setDate] = useState(today);
  const [daily, setDaily] = useState(null);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthly, setMonthly] = useState(null);

  // NUEVO: reporte extra mensual (por dirección + ganancia por producto)
  const [extraMonthly, setExtraMonthly] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadDaily() {
    setError("");
    setLoading(true);
    try {
      setDaily(await api.dailyReport(date));
    } catch (e) {
      setError(e.message);
      setDaily(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMonthly() {
    setError("");
    setLoading(true);
    try {
      const m = await api.monthlyReport(year, month);
      setMonthly(m);

      // Cargar también el extra
      const extra = await api.byAddressReport(year, month);
      setExtraMonthly(extra);
    } catch (e) {
      setError(e.message);
      setMonthly(null);
      setExtraMonthly(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Reportes</h2>

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-header">
            <h3>Reporte diario</h3>
            <div className="row">
              <input value={date} onChange={(e) => setDate(e.target.value)} />
              <button className="btn secondary" onClick={loadDaily} disabled={loading}>
                {loading ? "Cargando..." : "Cargar"}
              </button>
            </div>
          </div>

          {daily && (
            <>
              <div className="stats">
                <StatCard title="Fecha" value={daily.date} />
                <StatCard title="Facturas" value={daily.invoices} />
                <StatCard title="Total vendido" value={money(daily.total_sold)} />
              </div>

              <h4>Top productos (por cantidad)</h4>
              {daily.topProducts?.length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style={{ width: 160 }}>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.topProducts.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No hay ventas en esta fecha.</p>
              )}
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Reporte mensual</h3>
            <div className="grid grid-2">
              <div>
                <label>Año</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Mes</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                />
              </div>
              <div className="full">
                <button className="btn secondary" onClick={loadMonthly} disabled={loading}>
                  {loading ? "Cargando..." : "Cargar"}
                </button>
              </div>
            </div>
          </div>

          {monthly && (
            <>
              <div className="stats">
                <StatCard
                  title="Mes"
                  value={`${monthly.year}-${String(monthly.month).padStart(2, "0")}`}
                />
                <StatCard title="Facturas" value={monthly.invoices} />
                <StatCard title="Total vendido" value={money(monthly.total_sold)} />
              </div>

              <h4>Ventas por día</h4>
              {monthly.byDay?.length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th style={{ width: 200 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.byDay.map((d) => (
                      <tr key={d.day}>
                        <td>{String(d.day).slice(0, 10)}</td>
                        <td>{money(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No hay ventas en ese mes.</p>
              )}

              {/* NUEVO: Producto top por dirección */}
              {extraMonthly && (
                <>
                  <h4>Producto más vendido por dirección (Top 1)</h4>
                  {extraMonthly.byAddress?.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Dirección</th>
                          <th>Producto</th>
                          <th style={{ width: 110 }}>Cantidad</th>
                          <th style={{ width: 180 }}>Ingresos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extraMonthly.byAddress.map((r, idx) => (
                          <tr key={idx}>
                            <td>{r.address}</td>
                            <td>{r.top_product_name}</td>
                            <td>{r.top_qty}</td>
                            <td>{money(r.top_revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted">No hay datos por dirección para ese mes.</p>
                  )}

                  {/* NUEVO: Ganancia neta por producto */}
                  <h4>Ganancia neta por producto (mes)</h4>
                  {extraMonthly.profitByProduct?.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th style={{ width: 80 }}>Cant</th>
                          <th style={{ width: 170 }}>Ingresos</th>
                          <th style={{ width: 170 }}>Costo</th>
                          <th style={{ width: 170 }}>Ganancia neta</th>
                          <th style={{ width: 110 }}>% neto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extraMonthly.profitByProduct.map((p) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td>{p.qty}</td>
                            <td>{money(p.revenue)}</td>
                            <td>{money(p.cost)}</td>
                            <td>{money(p.net_profit)}</td>
                            <td>{p.net_profit_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted">No hay datos de ganancia para ese mes.</p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}