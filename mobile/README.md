# ForCristina en Expo Go

La app móvil usa React Native y se conecta al backend que ya existe en `backend/`.
El computador y el teléfono deben estar conectados a la misma red Wi-Fi.

## Iniciar en desarrollo local

Configura `DATABASE_URL` en `backend/.env` para conectarte a Supabase, o usa una
instancia de API ya desplegada. El backend ya no inicia una base SQLite local.
En una terminal, inicia la API:

```sh
cd backend
npm run dev
```

En otra terminal, inicia Expo:

```sh
cd mobile
npm start
```

Abre Expo Go en el teléfono y escanea el código QR que muestra Expo. Si no puedes
escanearlo, escribe `exp://192.168.1.5:8081` en Expo Go.

## Ventas e informes

Facturación permite buscar productos y clientes por nombre y consultar las
facturas recientes agrupadas por fecha. Las facturas dejan de aparecer en el
historial visible después de 10 días y el backend elimina de forma permanente
las ventas de más de 45 días al iniciar y, mientras está activo, cada hora.
Desde el historial puedes editar una factura reciente; al guardar, se actualizan
sus productos, el total y el inventario.
Los informes calculan la ganancia usando el costo del producto guardado al
momento de la venta.

El módulo de proveedores permite guardar el teléfono y asociar productos del
inventario con el precio de compra que ofrece cada proveedor. Al crear un pedido,
solo se muestran los productos asociados y se prepara un mensaje para WhatsApp.
El pedido queda pendiente y no modifica el inventario hasta marcarlo como
recibido; esa confirmación suma las cantidades y actualiza el costo de compra.

Al crear una factura, la app genera un PDF con los datos de la empresa, cliente,
fecha, productos, cantidades y total, y abre la hoja para compartir del teléfono.
Elige WhatsApp y luego el chat del cliente para adjuntar y enviar el archivo.
Por restricciones de iOS, la app no puede seleccionar automáticamente el chat
ni enviar el archivo sin confirmación; la factura también queda en el historial
si cancelas el envío.

## Dirección del backend

Durante el desarrollo local, la app usa `http://192.168.1.5:4000/api` por
defecto. Para compilar la APK, configura `EXPO_PUBLIC_API_URL` con la URL HTTPS
de Render más `/api`; nunca incluyas la contraseña de Supabase en la app.

## Compilar la APK

1. Crea una cuenta gratuita de Expo y configura `EXPO_PUBLIC_API_URL` en el
   entorno `preview` de EAS con la URL pública de Render.
2. Desde esta carpeta, inicia sesión con `npx eas-cli login`.
3. Genera la APK instalable con `npx eas-cli build --platform android --profile preview`.
4. Cuando termine la compilación, descarga el APK desde el enlace que entrega EAS.
