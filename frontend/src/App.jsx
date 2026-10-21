import React, { useEffect, useMemo, useState } from "react";
import { api, setToken, clearToken, getToken } from "./api.js";
import ProductsPanel from "./panels/ProductsPanel.jsx";
import ClientsPanel from "./panels/ClientsPanel.jsx";
import BillingPanel from "./panels/BillingPanel.jsx";
import ReportsPanel from "./panels/ReportsPanel.jsx";
// arriba de frontend/src/App.jsx (junto con los otros imports)
import { API_URL } from "./api";

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [tab, setTab] = useState("products");

  // auth state
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("admin@confites.local");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // company setup state
  // undefined=cargando, null=no existe, object=existe
  const [company, setCompany] = useState(undefined);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [rut, setRut] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  const monthLabel = useMemo(
    () => new Date().toLocaleString("es-CO", { month: "long" }),
    []
  );

  useEffect(() => {
    setTokenState(getToken());
  }, []);

  async function onSubmitAuth(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (authMode === "register") {
        if (!name.trim()) {
          throw new Error("El nombre es requerido para crear la cuenta.");
        }
        await api.registerAdmin({ name: name.trim(), email, password });
      }

      const res = await api.login({ email, password });
      setToken(res.token);
      setTokenState(res.token);
      // company se cargará por el useEffect de token
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    setTokenState("");
    setCompany(undefined);

    setCompanyName("");
    setRut("");
    setCompanyPhone("");
    setCompanyAddress("");

    setTab("products");

    // opcional: limpiar auth inputs
    // setName("");
    // setEmail("");
    // setPassword("");
    setAuthMode("login");
  }

  // load company once logged in
  useEffect(() => {
    async function loadCompany() {
      if (!token) {
        setCompany(undefined);
        setCompanyName("");
        setRut("");
        setCompanyPhone("");
        setCompanyAddress("");
        return;
      }

      setCompanyError("");
      setCompanyLoading(true);
      setCompany(undefined);

      try {
        const c = await api.getCompany(); // null o {name,rut,phone,address}
        setCompany(c);

        if (c) {
          setCompanyName(c.name || "");
          setRut(c.rut || "");
          setCompanyPhone(c.phone || "");
          setCompanyAddress(c.address || "");
        } else {
          setCompanyName("");
          setRut("");
          setCompanyPhone("");
          setCompanyAddress("");
        }
      } catch (e) {
        setCompanyError(e.message);
        setCompany(null);
      } finally {
        setCompanyLoading(false);
      }
    }

    loadCompany();
  }, [token]);

  async function saveCompany(e) {
    e.preventDefault();
    setCompanyError("");
    setCompanyLoading(true);
    try {
      await api.saveCompany({
        name: companyName,
        rut,
        phone: companyPhone,
        address: companyAddress,
      });

      const c = await api.getCompany();
      setCompany(c);
    } catch (e) {
      setCompanyError(e.message);
    } finally {
      setCompanyLoading(false);
    }
  }

  // 1) LOGIN / REGISTER
  if (!token) {
    return (
      <div className="login-page pro">
        <div className="login-shell">
          <div className="login-left">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true" />
              <div>
                <div className="brand-name">Rivera-SaaS</div>
                <div className="brand-sub">Dashboard</div>
              </div>
            </div>

            <div className="tabs" style={{ marginTop: 0 }}>
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
                Crear cuenta
              </button>
            </div>

            <h1 className="login-h1">
              {authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </h1>
            <p className="login-p">
              {authMode === "login"
                ? "Accede para administrar productos, clientes, facturación y reportes."
                : "Crea tu cuenta. Se creará una empresa (tenant) nueva para ti."}
            </p>

            <form onSubmit={onSubmitAuth} className="login-form pro">
              {authMode === "register" && (
                <div className="field">
                  <label>Nombre</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Juan Esteban"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="field">
                <label>Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@confites.local"
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <label>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
              </div>

              {error && <div className="error">{error}</div>}

              <button className="btn pro-login-btn" disabled={loading}>
                {loading
                  ? authMode === "login"
                    ? "Entrando..."
                    : "Creando..."
                  : authMode === "login"
                  ? "Entrar"
                  : "Crear cuenta"}
              </button>

              <div className="login-meta">
                <span className="muted">Mes:</span> {monthLabel} •{" "}
                

...

<span className="muted">API:</span> <code>{API_URL}</code>
              </div>
            </form>
          </div>

          <div className="login-right" aria-hidden="true">
            <div className="orb orb-a" />
            <div className="orb orb-b" />
            <div className="orb orb-c" />
            <div className="gridlines" />
          </div>
        </div>
      </div>
    );
  }

  // 2) SETUP EMPRESA (obligatorio)
  if (company === undefined) {
    return (
      <div className="container">
        <div className="card">
          <div className="row">
            <div>
              <h2 style={{ margin: 0 }}>Cargando...</h2>
              <div className="muted">Verificando datos de la empresa</div>
            </div>
            <button className="btn secondary" onClick={logout} type="button">
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (company === null) {
    return (
      <div className="login-page pro">
        <div className="login-shell">
          <div className="login-left">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true" />
              <div>
                <div className="brand-name">Rivera-SaaS</div>
                <div className="brand-sub">Configuración inicial</div>
              </div>
            </div>

            <h1 className="login-h1">Datos de la empresa</h1>
            <p className="login-p">
              Registra el nombre, RUT, teléfono y dirección para que aparezcan en la factura.
            </p>

            <form onSubmit={saveCompany} className="login-form pro">
              <div className="field">
                <label>Nombre de la empresa</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ej: Distribuidora Confites"
                />
              </div>

              <div className="field">
                <label>RUT</label>
                <input
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  placeholder="Ej: 12.345.678-9"
                />
              </div>

              <div className="field">
                <label>Teléfono</label>
                <input
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  placeholder="Ej: +57 300 000 0000"
                />
              </div>

              <div className="field">
                <label>Dirección</label>
                <input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="Ej: Calle 1 #2-3"
                />
              </div>

              {companyError && <div className="error">{companyError}</div>}

              <button className="btn pro-login-btn" disabled={companyLoading}>
                {companyLoading ? "Guardando..." : "Guardar y continuar"}
              </button>

              <button type="button" className="btn secondary" onClick={logout}>
                Cerrar sesión
              </button>
            </form>
          </div>

          <div className="login-right" aria-hidden="true">
            <div className="orb orb-a" />
            <div className="orb orb-b" />
            <div className="orb orb-c" />
            <div className="gridlines" />
          </div>
        </div>
      </div>
    );
  }

  // 3) DASHBOARD NORMAL
  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 style={{ margin: 0 }}>{company?.name || "Rivera-SaaS"}</h1>
          <div className="muted">Panel de administración</div>
        </div>
        <button className="btn secondary" onClick={logout} type="button">
          Cerrar sesión
        </button>
      </div>

      <div className="tabs">
        <button
          className={tab === "products" ? "active" : ""}
          onClick={() => setTab("products")}
          type="button"
        >
          Productos
        </button>
        <button
          className={tab === "clients" ? "active" : ""}
          onClick={() => setTab("clients")}
          type="button"
        >
          Clientes
        </button>
        <button
          className={tab === "billing" ? "active" : ""}
          onClick={() => setTab("billing")}
          type="button"
        >
          Facturación
        </button>
        <button
          className={tab === "reports" ? "active" : ""}
          onClick={() => setTab("reports")}
          type="button"
        >
          Reportes
        </button>
      </div>

      {tab === "products" && <ProductsPanel />}
      {tab === "clients" && <ClientsPanel />}
      {tab === "billing" && <BillingPanel company={company} />}
      {tab === "reports" && <ReportsPanel />}
    </div>
  );
}