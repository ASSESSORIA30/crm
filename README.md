# Renewal Intelligence Pro · Assessoria 3.0

CRM de renovaciones de luz, gas y telefonía. Kanban con arrastrar y soltar, ficha de cliente, plan diario, calendario, propuestas PDF con comparativa, WhatsApp/email, prioridad inteligente 0–100, estadísticas y permisos por comercial.

Stack: Next.js 15 · React 19 · TypeScript · Tailwind · dnd-kit · Motion · Recharts · Lucide · Supabase (auth, Postgres con RLS, Storage) · Google Drive/Sheets API · Nodemailer (SMTP IONOS) · Anthropic API · Vercel.

## Datos de origen

| Fuente | Uso |
|---|---|
| `Contratos_*.xlsx` (export del CRM, pestaña **Contratos**) | Datos maestros: CIF, nombre, dirección, teléfono, email, CUPS, tarifa, consumo, potencias P1–P6, estado, fechas |
| `CONTRACTES PER DIA.xlsx` (pestañas **2025**, **2026**…) | Se cruza por **CUPS**: comercial (ADMIN GESTIONO), captador (admin), comercializadora anterior, precio contratado, comentarios de llamada, marca RENOVAT 2026 |

Reglas de importación (`src/core/importer.ts`, cubiertas por tests):

- **Un contrato por CUPS**: se queda con el registro más reciente; los anteriores cuentan como «contratos previos». Sin CUPS → clave CIF + tarifa + producto + nombre.
- **Fecha de inicio**: activación → tramitación → DATA del diario → fecha de traspaso. Este último caso es la fecha de importación al CRM, no la real, y se marca como «Fecha a revisar».
- **Vencimiento** = inicio + 12 meses. Si ya pasó hace más de 15 días, se calcula el siguiente aniversario (renovación tácita) y se marca.
- **Estado inicial**: Baja/Anulado → «No quiere renovar»; RENOVAT 2026 = SI/OK → «Renovado»; otra nota en RENOVAT 2026 → «Contactado»; resto → «Pendiente».
- **El IBAN no se importa nunca.**
- Columnas detectadas automáticamente (sinónimos en ES/CA), con correspondencia editable en *Ajustes → Datos*.

La sincronización solo escribe en la tabla `contracts`. Estados, comunicaciones, tareas, documentos y ofertas están en tablas propias y **nunca se sobrescriben**. Un contrato que desaparece de la hoja se marca como `removed_from_source` y no se borra.

## Puesta en marcha

```bash
npm install
cp env.example .env.local      # rellena lo que tengas
npm run dev                     # sin Supabase: modo local vacío; importa los Excel en Ajustes
npm test                        # tests del importador, comparativa y prioridad
```

### 1. Supabase
1. Crea el proyecto y ejecuta `supabase/migrations/001_init.sql` (SQL editor o `supabase db push`).
2. Copia URL, anon key y service role key en las variables de entorno (Vercel → Settings → Environment Variables) y vuelve a desplegar.
3. Crea **tu** usuario en Supabase → *Authentication → Add user* (con contraseña). **El primer usuario es administrador.**
4. El resto de usuarios se crean desde la app: *Ajustes → Usuarios → Nuevo usuario* (con contraseña o invitación por email). Cada comercial necesita su código (`IBETH`, `IRENE`, `OLIVIE`, `WEEKO`, `JENNI`…) para ver solo sus contratos.

**Diagnóstico:** *Ajustes → Integraciones* (o `GET /api/health`) indica en directo qué falta: variables, tablas, primer administrador, acceso a Google, SMTP, validez de la clave de IA y CRON_SECRET.

### 2. Google (sincronización automática)
1. Google Cloud → crea una cuenta de servicio y activa **Drive API** y **Sheets API**. Descarga la clave JSON y pégala en `GOOGLE_SERVICE_ACCOUNT_JSON`.
2. Comparte las dos hojas con el `client_email` de la cuenta de servicio (permiso de lector).
3. `SOURCE_CRM_FILE_ID` y `SOURCE_DIARIO_FILE_ID` ya vienen en `env.example`. Como el CRM genera un archivo nuevo en cada exportación (`Contratos_AAAAMMDD_HHMMSS.xlsx`), lo recomendable es guardar las exportaciones en una carpeta de Drive y poner su ID en `SOURCE_CRM_FOLDER_ID`: se usará siempre la más reciente.
4. El cron de Vercel (`vercel.json`) sincroniza **una vez al día** (05:00 UTC), que es el máximo del plan Hobby; una frecuencia mayor hace fallar el despliegue. En el plan Pro puedes cambiarlo a `*/15 * * * *`. Con Hobby, otra opción es un programador externo que llame a `GET /api/sync/cron` con la cabecera `Authorization: Bearer <CRON_SECRET>`. Define `CRON_SECRET`. El botón «Sincronizar ahora» funciona siempre.
5. **Bidireccional**: los archivos actuales son `.xlsx` guardados en Drive, y la API no permite editar celdas en ellos. Para escribir el estado del CRM de vuelta, convierte la hoja a formato Google Sheets (*Archivo → Guardar como Hojas de cálculo de Google*), compártela como **editor** y pon su ID en `WRITEBACK_SHEET_ID`. En cada sincronización se rellena una columna `ESTADO CRM` por CUPS.

### 3. Email (IONOS)
`SMTP_HOST=smtp.ionos.es`, `SMTP_PORT=587`, usuario y contraseña del buzón y `SMTP_FROM`. Sin SMTP, el botón pasa a ser «Abrir en mi correo» (mailto) y queda registrado como *Preparado*. Con SMTP, como *Enviado* cuando el servidor acepta el mensaje. *Entregado* requiere confirmación del proveedor y no se marca sin ella.

### 4. IA
`ANTHROPIC_API_KEY` (y opcionalmente `ANTHROPIC_MODEL`). El servidor reconstruye el contexto desde la base de datos con los permisos del usuario. El prompt prohíbe inventar precios, ahorros u ofertas. Sin clave, el análisis de la ficha se calcula con reglas a partir de los datos reales, y así se indica.

### 5. WhatsApp
Ahora funciona con enlaces `wa.me` y el mensaje preparado. `/api/whatsapp/send` ya está listo para WhatsApp Business Platform (plantillas aprobadas). Falta el webhook de estados de entrega para marcar *Entregado*.

### 6. Vercel
Importa el repositorio, añade las variables de entorno y despliega. Las rutas `/api/*` corren en Node.

## Roles
| Rol | Ve | Además |
|---|---|---|
| Administrador | Todos los contratos | Gestiona usuarios e integraciones; asigna tareas |
| Cap administrativa | Todos los contratos | Asigna tareas a cualquiera desde «El teu pla d'avui» |
| Administrativa | Todos los contratos | Ofertas, plantillas, configuración e importación |
| Comercial | Contratos con su código en ADMIN GESTIONO | — |
| Col·laborador | Contratos con su código en la columna admin (prefijo «COL.» opcional) o cuyo «Usuario propietario» del CRM es su email | — |

Migraciones a ejecutar en orden: `001_init.sql`, `002_offer_ids_text.sql`, `003_roles.sql`.

## Ofertas
- *Ofertas → Importar plantilla Excel* lee la plantilla de comercializadoras (ZocoProductos, hoja «Productos»). Se importan las filas de Electricidad, Gas y Dual (la dual genera una oferta de luz y otra de gas); telefonía, alarmas y autoconsumo se omiten indicando el motivo.
- Clave «comercializadora + tarifa + producto»: al reimportar se actualizan los precios sin duplicar.
- La plantilla no tiene vigencia: se indica al importar. Solo las ofertas marcadas como verificadas se pueden usar en propuestas.
- Rangos de consumo/potencia, ámbito y residencial/pyme se muestran como avisos en el asistente de propuestas. Los fees se guardan como información (no se suman a los precios).

## Propuestas PDF
- Solo usan **ofertas verificadas y vigentes** registradas en *Ofertas* (admin). No hay precios precargados.
- La comparativa exige consumo y potencia por periodo y los precios actuales de la factura del cliente. Si falta algo, lo dice y no calcula.
- IEE, IVA y alquiler de contador son hipótesis configurables (*Ajustes → Empresa y PDF*). El PDF las muestra siempre, separando importes con y sin impuestos.
- Cada PDF queda versionado en *Documentos* (Supabase Storage privado; enlace firmado de 7 días para compartir).

## Prioridad 0–100
Suma ponderada (pesos editables en *Ajustes → Prioridad*) de: proximidad del vencimiento, consumo, valor por tarifa, días sin contacto, estado, seguimientos pendientes y riesgo (vence pronto sin contacto, seguimiento atrasado, objeciones en notas, renovación tácita). Cada ficha muestra el desglose. Crítica ≥ 75 · Alta ≥ 55 · Media ≥ 35 · Baja.

## Seguridad y RGPD
- RLS en todas las tablas; los comerciales solo ven sus contratos. La service role se usa solo en la sincronización del servidor.
- Auditoría (`audit_log`) de cambios de estado y ofertas, con usuario y fecha.
- Un contrato cerrado (renovado/perdido) solo lo puede reabrir un administrador.
- Bucket de documentos privado; cabeceras de seguridad; `noindex`.
- `demo/seed.json` contiene datos reales y está en `.gitignore`.

## Demo de un solo archivo
`npm run demo:seed -- <crm.xlsx> <diario.xlsx>` y después `npm run demo:build`. Genera `demo/dist/index.html` con la misma app y almacenamiento local en el navegador. Es **privado**: lleva datos personales de clientes.

## Estructura
```
src/core     lógica pura (importador, prioridad, comparativa, PDF, plantillas)
src/data     repositorios (local / Supabase) y store (zustand)
src/ui       interfaz (vistas y componentes)
src/server   código de servidor (Google, SMTP, IA, Supabase admin)
app/         Next.js (página, login, API routes)
supabase/    migración SQL con RLS
tests/       vitest
```
