# Despliegue de ForCristina en Supabase y Render

La API Express usa PostgreSQL y es compartida por Electron y la app Android.
Supabase guarda los datos; Render publica la API. Nunca pongas `DATABASE_URL`,
la contraseña de PostgreSQL ni `JWT_SECRET` en el frontend o en la app móvil.

## Crear Supabase

1. Crea un proyecto PostgreSQL en [Supabase](https://supabase.com/).
2. En **Connect**, selecciona la cadena de conexión **Session pooler** para
   IPv4 y copia el URI PostgreSQL. Mantén esa cadena privada.
3. El plan Free incluye hasta 500 MB y puede pausar proyectos sin actividad
   durante una semana; no incluye los respaldos diarios del plan Pro. Consulta
   [precios y límites actuales](https://supabase.com/pricing).

La migración activa Row Level Security en las tablas de la aplicación y no
crea políticas para acceso público. Render usa el URI privado de PostgreSQL;
no pongas ese URI ni una clave `service_role` en Electron o Android.

## Desplegar la API en Render

1. Sube el repositorio a GitHub y crea un **Blueprint** en
   [Render](https://render.com/) apuntando a `render.yaml` en la raíz. El
   servicio queda configurado con `backend/` como raíz, `npm ci --omit=dev`
   para instalar y `npm start` para iniciar.
2. En el servicio de Render, configura `DATABASE_URL` con el URI de Supabase
   (variable secreta). Configura `JWT_SECRET` con un valor aleatorio privado.
   No uses la contraseña de ejemplo de `.env.example`.
3. En Supabase, descarga el certificado CA desde **Database → Settings →
   SSL Configuration**. En un Mac, codifícalo en una sola línea con
   `base64 -i prod-ca-2021.crt | tr -d '\n'` y guarda el resultado como la
   variable `DATABASE_CA_CERT_BASE64` en Render. Esto permite validar el
   certificado TLS sin desactivar la verificación. Mantén `PGSSLMODE` sin
   definir; no configures `disable`.
4. Espera el despliegue. El backend crea las tablas PostgreSQL al arrancar y
   verifica la base de datos en `/api/health`. La URL será similar a
   `https://forcristina-api.onrender.com/api`.

El plan Free de Render puede dormir el servicio tras 15 minutos sin tráfico; la
primera solicitud posterior puede tardar cerca de un minuto. El disco de Render
es temporal: la base de datos vive en Supabase, no en archivos del servicio.

## Importar los datos de SQLite

Haz la importación una sola vez, antes de registrar una cuenta nueva en la API.
Necesitas la base SQLite original y una versión compatible de Node.js (Node 22
recomendado para la utilidad nativa de SQLite).

1. Detén el backend local para evitar escrituras durante la copia.
2. En `backend/`, instala dependencias de desarrollo y crea un `.env` local
   ignorado por Git con `DATABASE_URL` apuntando al URI de Supabase.
3. Ejecuta `npm run import:sqlite -- /ruta/a/forcristina.sqlite`. Si omites la
   ruta, usa `backend/data/forcristina.sqlite`.
4. El importador se detiene si Supabase ya contiene tenants; esto evita mezclar
   registros. Revisa los conteos que imprime y conserva tu archivo SQLite como
   respaldo. No lo subas al repositorio ni lo envíes por el chat.

Si no necesitas conservar la información local, puedes omitir la importación y
crear la primera cuenta desde la aplicación una vez que Render responda.

## Conectar Electron y Android

- **Android/EAS:** define `EXPO_PUBLIC_API_URL=https://<servicio>.onrender.com/api`
  en el entorno `preview` de Expo/EAS. Después genera un APK desde `mobile/`
  con `npx eas-cli build --platform android --profile preview`.
- **Electron:** compila el frontend con
  `VITE_API_BASE_URL=https://<servicio>.onrender.com/api` y luego empaqueta
  Electron. El escritorio ya no inicia un backend local; ambos clientes llaman
  a la misma API pública.
- La dirección de la API es pública; las credenciales de base de datos no.
  Render Free y Supabase Free son para comenzar y probar, no ofrecen una
  garantía de disponibilidad continua ni reemplazan un plan de respaldos.
