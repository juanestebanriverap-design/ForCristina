import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api, API_URL } from "./src/api";

const tabs = [
  ["billing", "Facturar"],
  ["products", "Productos"],
  ["clients", "Clientes"],
  ["suppliers", "Proveedores"],
  ["reports", "Reportes"],
];

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={String(value ?? "")}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8b98ab"
        keyboardType={keyboardType || "default"}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function Action({ title, onPress, secondary, danger, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Message({ children, success }) {
  if (!children) return null;
  return (
    <View style={[styles.message, success ? styles.successMessage : styles.errorMessage]}>
      <Text style={styles.messageText}>{children}</Text>
    </View>
  );
}

function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

function Heading({ children }) {
  return <Text style={styles.heading}>{children}</Text>;
}

function money(value) {
  return Number(value || 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function createInvoiceHtml(sale, company, client) {
  const issuedAt = sale.sale_date
    ? new Date(sale.sale_date.includes("T") ? sale.sale_date : `${sale.sale_date.replace(" ", "T")}Z`)
    : new Date();
  const invoiceDate = issuedAt.toLocaleDateString("es-CO");
  const rows = (sale.items || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.product_name)}</td>
      <td class="number">${Number(item.quantity)}</td>
      <td class="number">${money(item.unit_price)}</td>
      <td class="number">${money(item.subtotal)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 18mm 16mm; }
        * { box-sizing: border-box; }
        body { color: #172033; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
        .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
        .company-name { font-size: 18px; font-weight: 750; margin: 0 0 5px; }
        .company-details, .muted { color: #667085; line-height: 1.55; }
        .invoice-title { text-align: right; }
        h1 { font-size: 28px; margin: 0 0 8px; }
        .invoice-meta { color: #667085; line-height: 1.5; }
        .client { margin: 8px 0 30px; line-height: 1.55; }
        .client strong { font-size: 14px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; border-bottom: 1px solid #cfd5df; padding: 10px 5px; font-size: 12px; }
        td { border-bottom: 1px solid #edf0f4; padding: 11px 5px; }
        .number { text-align: right; white-space: nowrap; }
        .totals { width: 45%; margin: 22px 0 0 auto; }
        .totals td { border: 0; padding: 5px; }
        .grand-total { font-size: 18px; font-weight: 750; border-top: 1px solid #cfd5df !important; padding-top: 10px !important; }
        .footer { border-top: 1px dashed #cfd5df; color: #667085; margin-top: 34px; padding-top: 14px; }
        .thanks { color: #172033; text-align: right; margin-top: 22px; }
        tr { page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <div class="top">
        <div>
          <p class="company-name">${escapeHtml(company?.name || "Factura")}</p>
          <div class="company-details">
            ${company?.rut ? `RUT: ${escapeHtml(company.rut)}<br />` : ""}
            ${company?.phone ? `Teléfono: ${escapeHtml(company.phone)}<br />` : ""}
            ${company?.address ? escapeHtml(company.address) : ""}
          </div>
        </div>
        <div class="invoice-title">
          <h1>Factura</h1>
          <div class="invoice-meta">No: ${escapeHtml(sale.id)}<br />${escapeHtml(invoiceDate)}</div>
        </div>
      </div>
      <div class="client">
        <strong>Cliente: ${escapeHtml(client?.name || "Venta de mostrador")}</strong>
        ${client?.address ? `<br /><span class="muted">Dirección: ${escapeHtml(client.address)}</span>` : ""}
        ${client?.phone ? `<br /><span class="muted">Teléfono: ${escapeHtml(client.phone)}</span>` : ""}
      </div>
      <table>
        <thead>
          <tr><th>Productos</th><th class="number">Cant</th><th class="number">Precio</th><th class="number">Total</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <table class="totals">
        <tbody>
          <tr><td class="muted">Subtotal</td><td class="number">${money(sale.total)}</td></tr>
          <tr><td class="grand-total">Total</td><td class="number grand-total">${money(sale.total)}</td></tr>
        </tbody>
      </table>
      <div class="footer">Estado: Registrada</div>
      <div class="thanks">Gracias por tu compra.</div>
    </body>
  </html>`;
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("admin@confites.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        if (!name.trim()) throw new Error("Escribe tu nombre para crear la cuenta.");
        await api.registerAdmin({ name: name.trim(), email: email.trim(), password });
      }
      const result = await api.login({ email: email.trim(), password });
      if (!result?.token) throw new Error("El servidor no devolvió un token de acceso.");
      onLogin(result.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.brand}>AUB</Text>
          <Text style={styles.subtitle}>Admin Your Business</Text>
          <View style={styles.tabRow}>
            <Action title="Iniciar sesión" secondary={mode !== "login"} onPress={() => setMode("login")} />
            <Action title="Crear cuenta" secondary={mode !== "register"} onPress={() => setMode("register")} />
          </View>
          <Heading>{mode === "login" ? "Bienvenido" : "Crear cuenta"}</Heading>
          {mode === "register" && (
            <Field label="Nombre" value={name} onChangeText={setName} placeholder="Tu nombre" />
          )}
          <Field
            label="Correo"
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            keyboardType="email-address"
          />
          <Field
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña"
          />
          <Message>{error}</Message>
          <Action
            title={busy ? "Conectando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
            onPress={submit}
            disabled={busy}
          />
          <Text style={styles.apiHint}>Servidor: {API_URL}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function CompanySetup({ token, onSaved, onLogout }) {
  const [form, setForm] = useState({ name: "", rut: "", phone: "", address: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.saveCompany(token, form);
      onSaved(await api.getCompany(token));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Datos de la empresa</Heading>
        <Text style={styles.subtitle}>Estos datos aparecerán en la información de tu negocio.</Text>
        <Field label="Nombre de la empresa" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <Field label="RUT" value={form.rut} onChangeText={(v) => setForm({ ...form, rut: v })} />
        <Field label="Teléfono" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        <Field label="Dirección" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} />
        <Message>{error}</Message>
        <Action title={busy ? "Guardando..." : "Guardar y continuar"} onPress={save} disabled={busy} />
        <Action title="Cerrar sesión" secondary onPress={onLogout} />
      </Card>
    </ScrollView>
  );
}

function ProductsScreen({ token }) {
  const empty = { name: "", purchase_price: "", stock: "0", category: "", description: "" };
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setItems(await api.listProducts(token));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [token]);

  async function create() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.createProduct(token, {
        ...form,
        name: form.name.trim(),
        purchase_price: Number(form.purchase_price),
        stock: Number(form.stock || 0),
      });
      setForm(empty);
      setNotice("Producto agregado.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(product) {
    setEditing({
      id: product.id,
      name: product.name || "",
      purchase_price: String(product.purchase_price ?? ""),
      stock: String(product.stock ?? 0),
      category: product.category || "",
      description: product.description || "",
    });
  }

  async function saveEdit() {
    try {
      await api.updateProduct(token, editing.id, {
        name: editing.name,
        purchase_price: Number(editing.purchase_price),
        stock: Number(editing.stock),
        category: editing.category || null,
        description: editing.description || null,
      });
      setEditing(null);
      setNotice("Producto actualizado.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function remove(product) {
    Alert.alert("Eliminar producto", `¿Quieres eliminar ${product.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteProduct(token, product.id);
            setNotice("Producto eliminado.");
            await load();
          } catch (err) {
            setError(err.message);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Agregar producto</Heading>
        <Field label="Nombre" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <Field label="Categoría" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} />
        <View style={styles.row}>
          <View style={styles.half}><Field label="Costo de compra" value={form.purchase_price} onChangeText={(v) => setForm({ ...form, purchase_price: v })} keyboardType="decimal-pad" /></View>
          <View style={styles.half}><Field label="Stock" value={form.stock} onChangeText={(v) => setForm({ ...form, stock: v })} keyboardType="number-pad" /></View>
        </View>
        <Field label="Descripción" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
        <Action title={busy ? "Guardando..." : "Agregar producto"} onPress={create} disabled={busy} />
      </Card>
      <Card>
        <Heading>Productos ({items.length})</Heading>
        <Message>{error}</Message>
        <Message success>{notice}</Message>
        {!items.length && !error ? <Text style={styles.muted}>Todavía no hay productos.</Text> : null}
        {items.map((product) => (
          <View key={product.id} style={styles.listItem}>
            {editing?.id === product.id ? (
              <>
                <Field label="Nombre" value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} />
                <View style={styles.row}>
                  <View style={styles.half}><Field label="Costo" value={editing.purchase_price} onChangeText={(v) => setEditing({ ...editing, purchase_price: v })} keyboardType="decimal-pad" /></View>
                  <View style={styles.half}><Field label="Stock" value={editing.stock} onChangeText={(v) => setEditing({ ...editing, stock: v })} keyboardType="number-pad" /></View>
                </View>
                <Field label="Categoría" value={editing.category} onChangeText={(v) => setEditing({ ...editing, category: v })} />
                <View style={styles.row}><Action title="Guardar" onPress={saveEdit} /><Action title="Cancelar" secondary onPress={() => setEditing(null)} /></View>
              </>
            ) : (
              <>
                <Text style={styles.itemTitle}>{product.name}</Text>
                <Text style={styles.muted}>Stock: {product.stock} · Costo: {money(product.purchase_price)}{product.category ? ` · ${product.category}` : ""}</Text>
                <View style={styles.row}>
                  <Action title="Editar" secondary onPress={() => startEdit(product)} />
                  <Action title="Eliminar" danger onPress={() => remove(product)} />
                </View>
              </>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function ClientsScreen({ token }) {
  const empty = { name: "", phone: "", address: "", notes: "" };
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      setItems(await api.listClients(token));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [token]);

  async function create() {
    try {
      await api.createClient(token, {
        ...form,
        name: form.name.trim(),
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
      });
      setForm(empty);
      setNotice("Cliente agregado.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEdit() {
    try {
      await api.updateClient(token, editing.id, {
        name: editing.name,
        phone: editing.phone || null,
        address: editing.address || null,
        notes: editing.notes || null,
      });
      setEditing(null);
      setNotice("Cliente actualizado.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function remove(client) {
    Alert.alert("Eliminar cliente", `¿Quieres eliminar ${client.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteClient(token, client.id);
            setNotice("Cliente eliminado.");
            await load();
          } catch (err) {
            setError(err.message);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Agregar cliente</Heading>
        <Field label="Nombre" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <Field label="Teléfono" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        <Field label="Dirección o ruta" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} />
        <Field label="Notas" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} />
        <Action title="Agregar cliente" onPress={create} />
      </Card>
      <Card>
        <Heading>Clientes ({items.length})</Heading>
        <Message>{error}</Message>
        <Message success>{notice}</Message>
        {items.map((client) => (
          <View key={client.id} style={styles.listItem}>
            {editing?.id === client.id ? (
              <>
                <Field label="Nombre" value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} />
                <Field label="Teléfono" value={editing.phone} onChangeText={(v) => setEditing({ ...editing, phone: v })} keyboardType="phone-pad" />
                <Field label="Dirección" value={editing.address} onChangeText={(v) => setEditing({ ...editing, address: v })} />
                <View style={styles.row}><Action title="Guardar" onPress={saveEdit} /><Action title="Cancelar" secondary onPress={() => setEditing(null)} /></View>
              </>
            ) : (
              <>
                <Text style={styles.itemTitle}>{client.name}</Text>
                <Text style={styles.muted}>{client.phone || "Sin teléfono"} · {client.address || "Sin dirección"}</Text>
                <View style={styles.row}>
                  <Action title="Editar" secondary onPress={() => setEditing({ ...client, phone: client.phone || "", address: client.address || "" })} />
                  <Action title="Eliminar" danger onPress={() => remove(client)} />
                </View>
              </>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function BillingScreen({ token }) {
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [company, setCompany] = useState(null);
  const [sales, setSales] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [draft, setDraft] = useState([]);
  const [error, setError] = useState("");
  const [sale, setSale] = useState(null);
  const [saleWasEdited, setSaleWasEdited] = useState(false);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [saleDetails, setSaleDetails] = useState(null);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [section, setSection] = useState("new");
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState("");

  async function load() {
    try {
      const [clientRows, productRows, companyData] = await Promise.all([
        api.listClients(token),
        api.listProducts(token),
        api.getCompany(token),
      ]);
      setClients(clientRows);
      setProducts(productRows);
      setCompany(companyData);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [token]);

  async function loadSales() {
    setBusy(true);
    setError("");
    try {
      setSales(await api.listSales(token));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function shareInvoice(uri, invoiceNumber) {
    setShareError("");
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Compartir archivos no está disponible en este dispositivo.");
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: `Factura ${invoiceNumber}`,
      });
    } catch (err) {
      setShareError(err.message || "No se pudo abrir el menú para compartir la factura.");
    }
  }

  async function createAndShareInvoice(invoice) {
    setShareError("");
    try {
      let uri = invoice.uri;
      if (!uri) {
        const file = await Print.printToFileAsync({
          html: createInvoiceHtml(invoice.sale, company, invoice.client),
        });
        uri = file.uri;
        setLastInvoice({ ...invoice, uri });
      }
      await shareInvoice(uri, invoice.sale.id);
    } catch (err) {
      setShareError(err.message || "No se pudo generar el PDF de la factura.");
    }
  }

  function addProduct(product) {
    setDraft((current) => {
      const existing = current.find((row) => row.product_id === product.id);
      if (existing) {
        return current.map((row) =>
          row.product_id === product.id ? { ...row, quantity: row.quantity + 1 } : row
        );
      }
      return [...current, { product_id: product.id, quantity: 1, unit_price: product.purchase_price }];
    });
  }

  function startEditingSale(invoice) {
    setEditingSaleId(invoice.id);
    setClientId(invoice.client_id ?? null);
    setClientSearch("");
    setProductSearch("");
    setDraft((invoice.items || []).map((item) => ({
      product_id: item.product_id,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
    })));
    setSale(null);
    setSaleWasEdited(false);
    setError("");
    setSection("new");
  }

  function cancelEditingSale() {
    setEditingSaleId(null);
    setClientId(null);
    setDraft([]);
    setSale(null);
    setSaleWasEdited(false);
    setError("");
    setSection("history");
  }

  async function submit() {
    setError("");
    if (!draft.length) {
      setError("Agrega al menos un producto a la factura.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        client_id: clientId,
        items: draft.map((row) => ({
          product_id: row.product_id,
          quantity: Number(row.quantity),
          unit_price: Number(row.unit_price),
        })),
      };
      const wasEditing = editingSaleId !== null;
      const result = wasEditing
        ? await api.updateSale(token, editingSaleId, payload)
        : await api.createSale(token, payload);
      const fresh = await api.getSale(token, wasEditing ? editingSaleId : result.id);
      const invoiceClient = clients.find((client) => client.id === clientId) || null;
      setSale(fresh);
      setSaleWasEdited(wasEditing);
      setLastInvoice({ sale: fresh, client: invoiceClient, uri: null });
      setSaleDetails(fresh);
      setDraft([]);
      setEditingSaleId(null);
      setSection("history");
      if (!wasEditing) {
        await createAndShareInvoice({ sale: fresh, client: invoiceClient, uri: null });
      }
      try {
        setSales(await api.listSales(token));
      } catch (err) {
        setError(err.message);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function showSaleDetails(id) {
    if (saleDetails?.id === id) {
      setSaleDetails(null);
      return;
    }
    try {
      setSaleDetails(await api.getSale(token, id));
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredClients = clients.filter((client) =>
    client.name.toLocaleLowerCase().includes(clientSearch.trim().toLocaleLowerCase())
  );
  const filteredProducts = products.filter((product) =>
    product.name.toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase())
  );
  const total = draft.reduce((sum, row) => sum + Number(row.quantity) * Number(row.unit_price), 0);
  const salesByDate = sales.reduce((groups, item) => {
    const day = item.sale_date?.slice(0, 10) || "Sin fecha";
    groups[day] = [...(groups[day] || []), item];
    return groups;
  }, {});

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.sectionTabs}>
        <Action
          title="Nueva factura"
          onPress={() => setSection("new")}
          secondary={section !== "new"}
        />
        <Action
          title="Historial de ventas"
          onPress={() => {
            setSection("history");
            loadSales();
          }}
          secondary={section !== "history"}
        />
      </View>
      {section === "history" ? (
        <Card>
          <View style={styles.historyHeader}>
            <View>
              <Heading>Historial de ventas</Heading>
              <Text style={styles.muted}>Facturas de los últimos 10 días</Text>
            </View>
            <Pressable onPress={loadSales} accessibilityRole="button" style={styles.refreshButton}>
              <Text style={styles.refreshText}>Actualizar</Text>
            </Pressable>
          </View>
          {lastInvoice && (
            <View style={styles.invoiceReady}>
              <Text style={styles.itemTitle}>Factura #{lastInvoice.sale.id} lista</Text>
              <Text style={styles.muted}>
                {lastInvoice.client?.phone
                  ? `Comparte el PDF por WhatsApp y selecciona ${lastInvoice.client.phone}.`
                  : "Comparte el PDF con WhatsApp y elige el chat del cliente."}
              </Text>
              <Action
                title={lastInvoice.uri ? "Compartir factura PDF" : "Generar y compartir PDF"}
                onPress={() => createAndShareInvoice(lastInvoice)}
                secondary
              />
              <Message>{shareError}</Message>
            </View>
          )}
          <Message>{error}</Message>
          {busy && <ActivityIndicator color={colors.primary} />}
          {!busy && sales.length === 0 && (
            <Text style={styles.muted}>No hay facturas recientes.</Text>
          )}
          {Object.entries(salesByDate).map(([day, daySales]) => (
            <View key={day} style={styles.historyDay}>
              <Text style={styles.historyDate}>{formatHistoryDate(day)}</Text>
              {daySales.map((item) => (
                <View key={item.id}>
                  <Pressable
                    onPress={() => showSaleDetails(item.id)}
                    style={styles.saleRow}
                    accessibilityRole="button"
                  >
                    <View style={styles.saleRowTop}>
                      <Text style={styles.itemTitle}>Factura #{item.id}</Text>
                      <Text style={styles.saleTotal}>{money(item.total)}</Text>
                    </View>
                    <Text style={styles.muted}>
                      {formatHistoryTime(item.sale_date)} · {item.client_name || "Venta sin cliente"}
                    </Text>
                  </Pressable>
                  {saleDetails?.id === item.id && (
                    <View style={styles.saleDetails}>
                      {(saleDetails.items || []).map((line) => (
                        <Text key={line.id} style={styles.muted}>
                          {line.quantity} × {line.product_name} · {money(line.subtotal)}
                        </Text>
                      ))}
                      <Text style={styles.saleTotal}>Total: {money(saleDetails.total)}</Text>
                      <Action
                        title="Editar factura"
                        secondary
                        onPress={() => startEditingSale(saleDetails)}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.retentionNote}>
            Se ocultan después de 10 días y se eliminan permanentemente después de 45 días.
          </Text>
        </Card>
      ) : (
      <>
      <Card>
        <Heading>{editingSaleId ? `Editar factura #${editingSaleId}` : "Nueva factura"}</Heading>
        <Message>{error}</Message>
        {sale ? (
          <View style={styles.successMessage}>
            <Text style={styles.messageText}>
              Factura #{sale.id} {saleWasEdited ? "actualizada" : "guardada"} · Total {money(sale.total)}
            </Text>
          </View>
        ) : null}
        <Text style={styles.label}>Cliente (opcional)</Text>
        <TextInput
          value={clientSearch}
          onChangeText={setClientSearch}
          placeholder="Buscar cliente por nombre"
          placeholderTextColor="#8b98ab"
          style={styles.searchInput}
        />
        {clientId !== null && (
          <View style={styles.selectedClient}>
            <Text style={styles.selectedClientText}>
              Cliente: {clients.find((client) => client.id === clientId)?.name || "Seleccionado"}
            </Text>
            <Pressable onPress={() => setClientId(null)}>
              <Text style={styles.removeSelection}>Cambiar</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.choiceWrap}>
          {clientId === null && (
            <Pressable
              onPress={() => { setClientId(null); setClientSearch(""); }}
              style={[styles.choice, !clientSearch && styles.choiceActive]}
            >
              <Text style={styles.choiceText}>Sin cliente</Text>
            </Pressable>
          )}
          {clientId === null && filteredClients.map((client) => (
            <Pressable
              key={client.id}
              onPress={() => { setClientId(client.id); setClientSearch(""); }}
              style={styles.choice}
            >
              <Text style={styles.choiceText}>{client.name}</Text>
            </Pressable>
          ))}
        </View>
        {clientId === null && clientSearch.trim() && filteredClients.length === 0 && (
          <Text style={styles.muted}>No encontramos clientes con ese nombre.</Text>
        )}
      </Card>
      <Card>
        <Text style={styles.label}>Productos disponibles</Text>
        <TextInput
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Buscar producto por nombre"
          placeholderTextColor="#8b98ab"
          style={styles.searchInput}
        />
        {filteredProducts.map((product) => (
          <Pressable key={product.id} onPress={() => addProduct(product)} style={styles.selectProduct}>
            <Text style={styles.itemTitle}>{product.name}</Text>
            <Text style={styles.muted}>Stock {product.stock} · {money(product.purchase_price)} · Toca para agregar</Text>
          </Pressable>
        ))}
        {filteredProducts.length === 0 && (
          <Text style={styles.muted}>No encontramos productos con ese nombre.</Text>
        )}
      </Card>
      <Card>
        <Heading>Detalle</Heading>
        {!draft.length ? <Text style={styles.muted}>Todavía no agregas productos.</Text> : null}
        {draft.map((row) => {
          const product = products.find((item) => item.id === row.product_id);
          return (
            <View key={row.product_id} style={styles.listItem}>
              <Text style={styles.itemTitle}>{product?.name || `Producto #${row.product_id}`}</Text>
              <View style={styles.row}>
                <View style={styles.half}><Field label="Cantidad" value={row.quantity} keyboardType="number-pad" onChangeText={(v) => setDraft(draft.map((item) => item.product_id === row.product_id ? { ...item, quantity: v } : item))} /></View>
                <View style={styles.half}><Field label="Precio unitario" value={row.unit_price} keyboardType="decimal-pad" onChangeText={(v) => setDraft(draft.map((item) => item.product_id === row.product_id ? { ...item, unit_price: v } : item))} /></View>
              </View>
              <Text style={styles.muted}>Subtotal: {money(Number(row.quantity) * Number(row.unit_price))}</Text>
              <Action title="Quitar" secondary onPress={() => setDraft(draft.filter((item) => item.product_id !== row.product_id))} />
            </View>
          );
        })}
        <Text style={styles.total}>Total: {money(total)}</Text>
        <Action
          title={busy ? "Guardando..." : editingSaleId ? "Guardar cambios" : "Crear factura"}
          onPress={submit}
          disabled={!draft.length || busy}
        />
        {editingSaleId !== null && (
          <Action
            title="Cancelar edición"
            secondary
            onPress={cancelEditingSale}
            disabled={busy}
          />
        )}
      </Card>
      </>
      )}
    </ScrollView>
  );
}

function formatHistoryDate(value) {
  if (!value || value === "Sin fecha") return value;
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatHistoryTime(value) {
  if (!value) return "";
  const time = value.split(/[ T]/)[1];
  return time ? time.slice(0, 5) : "";
}

function SuppliersScreen({ token }) {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [activeSupplier, setActiveSupplier] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [productRows, supplierRows, orderRows] = await Promise.all([
        api.listProducts(token),
        api.listSuppliers(token),
        api.listPurchaseOrders(token),
      ]);
      setProducts(productRows);
      setSuppliers(supplierRows);
      setOrders(orderRows);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [token]);

  function startCreate() {
    setEditingId(null);
    setForm({ name: "", phone: "", notes: "", products: [] });
    setProductSearch("");
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
    setNotice("");
  }

  function toggleProduct(product) {
    setForm((current) => {
      const exists = current.products.some((item) => item.product_id === product.id);
      return {
        ...current,
        products: exists
          ? current.products.filter((item) => item.product_id !== product.id)
          : [...current.products, { product_id: product.id, purchase_price: String(product.purchase_price) }],
      };
    });
  }

  async function saveSupplier() {
    if (!form?.name.trim() || !form?.phone.trim()) {
      setError("Escribe el nombre y el teléfono del proveedor.");
      return;
    }
    const invalidPrice = form.products.some((item) =>
      !Number.isFinite(Number(item.purchase_price)) || Number(item.purchase_price) <= 0
    );
    if (invalidPrice) {
      setError("Escribe un precio de compra válido para cada producto seleccionado.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = {
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim() || null,
        products: form.products.map((item) => ({
          product_id: item.product_id,
          purchase_price: Number(item.purchase_price),
        })),
      };
      if (editingId === null) await api.createSupplier(token, data);
      else await api.updateSupplier(token, editingId, data);
      setForm(null);
      setEditingId(null);
      setNotice(editingId === null ? "Proveedor agregado." : "Proveedor actualizado.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function removeSupplier(supplier) {
    Alert.alert("Eliminar proveedor", `¿Quieres eliminar ${supplier.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteSupplier(token, supplier.id);
            if (activeSupplier?.id === supplier.id) setActiveSupplier(null);
            setNotice("Proveedor eliminado.");
            await load();
          } catch (err) {
            setError(err.message);
          }
        },
      },
    ]);
  }

  async function placeOrder() {
    const items = (activeSupplier?.products || [])
      .map((item) => ({ product_id: item.product_id, quantity: Number(quantities[item.product_id] || 0) }))
      .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
    if (!items.length) {
      setError("Indica la cantidad de al menos un producto para hacer el pedido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const order = await api.createPurchaseOrder(token, activeSupplier.id, items);
      const message = [
        `Hola ${order.supplier.name}, quiero hacer este pedido:`,
        ...order.items.map((item) =>
          `• ${item.quantity} × ${item.product_name} — ${money(item.purchase_price)} c/u`
        ),
        `Pedido #${order.id}`,
      ].join("\n");
      const phone = order.supplier.phone.replace(/\D/g, "");
      if (!phone) throw new Error("Pedido guardado, pero el teléfono del proveedor no es válido para WhatsApp.");
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      setNotice(`Pedido #${order.id} guardado como pendiente. El stock subirá cuando marques la recepción.`);
      setActiveSupplier(null);
      setQuantities({});
      await load();
      await Linking.openURL(whatsappUrl);
    } catch (err) {
      setError(err.message || "No se pudo abrir WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  function receiveOrder(order) {
    Alert.alert(
      "Confirmar recepción",
      `Al confirmar se sumarán ${order.items.reduce((sum, item) => sum + item.quantity, 0)} unidades al inventario y se actualizará el costo de compra.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Marcar recibido",
          onPress: async () => {
            setBusy(true);
            setError("");
            try {
              await api.receivePurchaseOrder(token, order.id);
              setNotice(`Pedido #${order.id} recibido. El inventario fue actualizado.`);
              await load();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  const filteredProducts = products.filter((product) =>
    product.name.toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase())
  );

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={styles.historyHeader}>
          <Heading>Proveedores</Heading>
          {!form && !activeSupplier && (
            <Pressable onPress={startCreate} accessibilityRole="button" style={styles.refreshButton}>
              <Text style={styles.refreshText}>Agregar</Text>
            </Pressable>
          )}
        </View>
        <Message>{error}</Message>
        <Message success>{notice}</Message>
        {form && (
          <View>
            <Heading>{editingId === null ? "Nuevo proveedor" : "Editar proveedor"}</Heading>
            <Field label="Nombre del proveedor" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <Field label="Teléfono / WhatsApp" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
            <Field label="Notas" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />
            <Text style={styles.label}>Productos que vende y precio de compra</Text>
            <TextInput
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Buscar producto del inventario"
              placeholderTextColor="#8b98ab"
              style={styles.searchInput}
            />
            {filteredProducts.map((product) => {
              const selected = form.products.find((item) => item.product_id === product.id);
              return (
                <View key={product.id} style={styles.supplierProductRow}>
                  <Pressable onPress={() => toggleProduct(product)} style={styles.supplierProductSelect}>
                    <Text style={styles.choiceText}>{selected ? "✓ " : "＋ "}{product.name}</Text>
                  </Pressable>
                  {selected && (
                    <View style={styles.supplierPrice}>
                      <Field
                        label="Precio"
                        value={selected.purchase_price}
                        onChangeText={(value) => setForm({
                          ...form,
                          products: form.products.map((item) =>
                            item.product_id === product.id ? { ...item, purchase_price: value } : item
                          ),
                        })}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={styles.muted}>Seleccionados: {form.products.length}</Text>
            <View style={styles.row}>
              <Action title={busy ? "Guardando..." : "Guardar proveedor"} onPress={saveSupplier} disabled={busy} />
              <Action title="Cancelar" secondary onPress={() => setForm(null)} disabled={busy} />
            </View>
          </View>
        )}
        {activeSupplier && (
          <View>
            <Heading>Pedido para {activeSupplier.name}</Heading>
            <Text style={styles.muted}>Solo aparecen los productos guardados para este proveedor.</Text>
            {activeSupplier.products.map((item) => (
              <View key={item.product_id} style={styles.supplierOrderRow}>
                <View style={styles.supplierOrderProduct}>
                  <Text style={styles.itemTitle}>{item.product_name}</Text>
                  <Text style={styles.muted}>{money(item.purchase_price)} c/u</Text>
                </View>
                <View style={styles.orderQuantity}>
                  <Field
                    label="Cantidad"
                    value={quantities[item.product_id] || ""}
                    onChangeText={(value) => setQuantities({ ...quantities, [item.product_id]: value })}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
              </View>
            ))}
            <Text style={styles.muted}>El inventario no cambia hasta que marques el pedido como recibido.</Text>
            <View style={styles.row}>
              <Action title={busy ? "Preparando..." : "Hacer pedido por WhatsApp"} onPress={placeOrder} disabled={busy} />
              <Action title="Cancelar" secondary onPress={() => setActiveSupplier(null)} disabled={busy} />
            </View>
          </View>
        )}
        {!form && !activeSupplier && suppliers.map((supplier) => (
          <View key={supplier.id} style={styles.listItem}>
            <Text style={styles.itemTitle}>{supplier.name}</Text>
            <Text style={styles.muted}>{supplier.phone} · {supplier.products.length} productos</Text>
            {supplier.products.length > 0 ? (
              <Text style={styles.muted}>
                {supplier.products.map((item) => `${item.product_name} (${money(item.purchase_price)})`).join(" · ")}
              </Text>
            ) : <Text style={styles.muted}>Aún no tiene productos asociados.</Text>}
            <View style={styles.row}>
              <Action title="Hacer pedido" onPress={() => { setActiveSupplier(supplier); setQuantities({}); }} disabled={!supplier.products.length} />
              <Action title="Editar" secondary onPress={() => startEdit(supplier)} />
              <Action title="Eliminar" danger onPress={() => removeSupplier(supplier)} />
            </View>
          </View>
        ))}
        {!form && !activeSupplier && !suppliers.length && (
          <Text style={styles.muted}>Todavía no hay proveedores registrados.</Text>
        )}
      </Card>
      <Card>
        <View style={styles.historyHeader}>
          <Heading>Pedidos</Heading>
          <Pressable onPress={load} accessibilityRole="button" style={styles.refreshButton}>
            <Text style={styles.refreshText}>Actualizar</Text>
          </Pressable>
        </View>
        {!orders.length && <Text style={styles.muted}>Todavía no hay pedidos.</Text>}
        {orders.map((order) => (
          <View key={order.id} style={styles.listItem}>
            <Text style={styles.itemTitle}>
              Pedido #{order.id} · {order.supplier_name}
            </Text>
            <Text style={styles.muted}>
              {order.status === "received" ? "Recibido" : "Pendiente"} · {formatHistoryDate(order.created_at.slice(0, 10))}
            </Text>
            {order.items.map((item) => (
              <Text key={item.id} style={styles.muted}>
                {item.quantity} × {item.product_name} · {money(item.unit_price)} c/u
              </Text>
            ))}
            {order.status === "pending" && (
              <Action title="Marcar como recibido" onPress={() => receiveOrder(order)} disabled={busy} />
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function ReportsScreen({ token }) {
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [extra, setExtra] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadDaily() {
    setError("");
    setBusy(true);
    try {
      setDaily(await api.dailyReport(token, date));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadMonthly() {
    setError("");
    setBusy(true);
    try {
      const [monthResult, extraResult] = await Promise.all([
        api.monthlyReport(token, year, month),
        api.byAddressReport(token, year, month),
      ]);
      setMonthly(monthResult);
      setExtra(extraResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Reporte diario</Heading>
        <Field label="Fecha (AAAA-MM-DD)" value={date} onChangeText={setDate} />
        <Action title={busy ? "Cargando..." : "Consultar día"} onPress={loadDaily} disabled={busy} />
        {daily ? (
          <View style={styles.report}>
            <Text style={styles.itemTitle}>{daily.date}</Text>
            <Text style={styles.muted}>Facturas: {daily.invoices}</Text>
            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Total vendido</Text>
                <Text style={styles.metricValue}>{money(daily.total_sold)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Ganancia neta</Text>
                <Text style={styles.metricValue}>{money(daily.net_profit)}</Text>
              </View>
            </View>
            <Text style={styles.label}>Productos más vendidos</Text>
            {daily.topProducts.map((product) => <Text key={product.id} style={styles.muted}>{product.name} · {product.qty}</Text>)}
          </View>
        ) : null}
      </Card>
      <Card>
        <Heading>Reporte mensual</Heading>
        <View style={styles.row}>
          <View style={styles.half}><Field label="Año" value={year} onChangeText={setYear} keyboardType="number-pad" /></View>
          <View style={styles.half}><Field label="Mes" value={month} onChangeText={setMonth} keyboardType="number-pad" /></View>
        </View>
        <Action title={busy ? "Cargando..." : "Consultar mes"} onPress={loadMonthly} disabled={busy} />
        {monthly ? (
          <View style={styles.report}>
            <Text style={styles.itemTitle}>{monthly.year}-{String(monthly.month).padStart(2, "0")}</Text>
            <Text style={styles.muted}>Facturas: {monthly.invoices}</Text>
            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Total vendido</Text>
                <Text style={styles.metricValue}>{money(monthly.total_sold)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Ganancia neta</Text>
                <Text style={styles.metricValue}>{money(monthly.net_profit)}</Text>
              </View>
            </View>
            <Text style={styles.label}>Ventas por día</Text>
            {monthly.byDay.map((entry) => <Text key={entry.day} style={styles.muted}>{String(entry.day).slice(0, 10)} · {money(entry.total)}</Text>)}
            <Text style={styles.label}>Producto principal por dirección</Text>
            {extra?.byAddress?.map((entry, index) => <Text key={`${entry.address}-${index}`} style={styles.muted}>{entry.address}: {entry.top_product_name} ({entry.top_qty})</Text>)}
            <Text style={styles.label}>Ganancia neta por producto</Text>
            {extra?.profitByProduct?.length ? extra.profitByProduct.map((entry) => (
              <View key={entry.id} style={styles.profitRow}>
                <View style={styles.profitProduct}>
                  <Text style={styles.itemTitle}>{entry.name}</Text>
                  <Text style={styles.muted}>
                    {entry.qty} vendidos · Ingresos {money(entry.revenue)}
                  </Text>
                </View>
                <View style={styles.profitAmounts}>
                  <Text style={styles.saleTotal}>{money(entry.net_profit)}</Text>
                  <Text style={styles.profitPercent}>{entry.net_profit_pct}% neto</Text>
                </View>
              </View>
            )) : <Text style={styles.muted}>No hay ventas de productos en este mes.</Text>}
          </View>
        ) : null}
        <Message>{error}</Message>
      </Card>
    </ScrollView>
  );
}

export default function App() {
  const [token, setToken] = useState("");
  const [company, setCompany] = useState(undefined);
  const [companyError, setCompanyError] = useState("");
  const [tab, setTab] = useState("products");

  useEffect(() => {
    if (!token) {
      setCompany(undefined);
      return;
    }
    let active = true;
    api.getCompany(token).then((result) => {
      if (active) {
        setCompany(result);
        setCompanyError("");
      }
    }).catch((err) => {
      if (active) setCompanyError(err.message);
    });
    return () => { active = false; };
  }, [token]);

  function logout() {
    setToken("");
    setCompany(undefined);
    setTab("products");
  }

  if (!token) return <AuthScreen onLogin={setToken} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>{company?.name || "AUB"}</Text>
          <Text style={styles.subtitle}>
            {company
              ? "Panel de administración"
              : company === null
              ? "Configuración inicial"
              : "Verificando empresa"}
          </Text>
        </View>
        <Pressable onPress={logout} accessibilityRole="button">
          <Text style={styles.logout}>Salir</Text>
        </Pressable>
      </View>
      {company && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.navScroll}
          contentContainerStyle={styles.nav}
        >
          {tabs.map(([id, label]) => (
            <Pressable key={id} onPress={() => setTab(id)} style={[styles.navTab, tab === id && styles.navTabActive]}>
              <Text style={[styles.navText, tab === id && styles.navTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {companyError ? (
        <View style={styles.loading}><Message>{companyError}</Message><Action title="Volver al acceso" secondary onPress={logout} /></View>
      ) : company === undefined ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Cargando...</Text></View>
      ) : company === null ? (
        <CompanySetup token={token} onSaved={setCompany} onLogout={logout} />
      ) : (
        <View style={styles.content}>
          {tab === "products" && <ProductsScreen token={token} />}
          {tab === "clients" && <ClientsScreen token={token} />}
          {tab === "suppliers" && <SuppliersScreen token={token} />}
          {tab === "billing" && <BillingScreen token={token} />}
          {tab === "reports" && <ReportsScreen token={token} />}
        </View>
      )}
    </SafeAreaView>
  );
}

const colors = {
  background: "#101827",
  surface: "#182438",
  border: "#2b3a52",
  text: "#f4f7fb",
  muted: "#a7b4c8",
  primary: "#64a5ff",
  danger: "#e66a74",
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  authWrap: { flexGrow: 1, justifyContent: "center", padding: 18 },
  page: { padding: 14, paddingBottom: 36, gap: 14 },
  header: { minHeight: 76, paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerText: { flexShrink: 1 },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  brand: { color: colors.text, fontSize: 23, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  logout: { color: colors.primary, fontWeight: "700", padding: 10 },
  navScroll: { flexGrow: 0, flexShrink: 0 },
  nav: { paddingHorizontal: 12, paddingBottom: 10, gap: 8, alignItems: "center" },
  navTab: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingVertical: 9, paddingHorizontal: 15 },
  navTabActive: { borderColor: colors.primary, backgroundColor: "#213c5e" },
  navText: { color: colors.muted, fontWeight: "600" },
  navTextActive: { color: colors.text },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 14 },
  heading: { color: colors.text, fontSize: 19, fontWeight: "700", marginBottom: 12 },
  field: { marginBottom: 12, flex: 1 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.text, backgroundColor: "#111c2c" },
  multiline: { minHeight: 70, textAlignVertical: "top", paddingTop: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  half: { flex: 1 },
  button: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, marginTop: 6, marginBottom: 4 },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: "#532b37" },
  buttonText: { color: "#10213a", fontWeight: "700", textAlign: "center" },
  buttonSecondaryText: { color: colors.text },
  disabled: { opacity: 0.5 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  apiHint: { color: colors.muted, fontSize: 11, marginTop: 16 },
  message: { padding: 10, borderRadius: 8, marginVertical: 5 },
  errorMessage: { backgroundColor: "#532b37" },
  successMessage: { backgroundColor: "#1f493d" },
  messageText: { color: colors.text, fontSize: 13 },
  muted: { color: colors.muted, lineHeight: 21, marginVertical: 2 },
  listItem: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 12 },
  supplierProductRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  supplierProductSelect: { flex: 1, minHeight: 44, justifyContent: "center" },
  supplierPrice: { width: 115 },
  supplierOrderRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  supplierOrderProduct: { flex: 1 },
  orderQuantity: { width: 105 },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 3 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  choiceActive: { backgroundColor: "#213c5e", borderColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 13 },
  sectionTabs: { flexDirection: "row", gap: 10, marginBottom: 2 },
  invoiceReady: { backgroundColor: "#111c2c", borderRadius: 12, padding: 12, marginBottom: 12 },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, color: colors.text, backgroundColor: "#111c2c", marginTop: 2, marginBottom: 10 },
  selectedClient: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 10, backgroundColor: "#213c5e", marginBottom: 8 },
  selectedClientText: { color: colors.text, fontWeight: "600" },
  removeSelection: { color: colors.primary, fontWeight: "700" },
  selectProduct: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12 },
  total: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "right", marginTop: 10 },
  report: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 12 },
  metricGrid: { flexDirection: "row", gap: 10, marginVertical: 10 },
  metricCard: { flex: 1, backgroundColor: "#111c2c", borderRadius: 12, padding: 12 },
  metricLabel: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
  profitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12, gap: 8 },
  profitProduct: { flex: 1 },
  profitAmounts: { alignItems: "flex-end" },
  profitPercent: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 4 },
  historyHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  refreshButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  refreshText: { color: colors.primary, fontWeight: "700" },
  historyDay: { marginTop: 14 },
  historyDate: { color: colors.primary, fontWeight: "800", fontSize: 15, marginBottom: 4 },
  saleRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  saleRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  saleTotal: { color: colors.text, fontWeight: "800" },
  saleDetails: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: "#111c2c" },
  retentionNote: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 16 },
});
