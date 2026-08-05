# Email Marketing Builder

Plataforma completa de email marketing con constructor visual drag & drop, gestión de contactos, colas de envío con throttling, tracking en tiempo real y reportes con gráficas.

## Características principales

- **Constructor visual** de emails con Unlayer (drag & drop, variables dinámicas, subida de imágenes)
- **Gestión de contactos** con importación masiva de CSV/Excel y mapeo de columnas
- **Campañas con cola Bull + Redis**: throttling configurable, reintentos automáticos, sin duplicados
- **Dashboard en tiempo real** vía Socket.io: progreso, velocidad, ETA
- **Tracking**: pixel de apertura 1×1, clicks con redirect, desuscripción
- **Reportes con gráficas SVG**: tasas de apertura/click/error, quién abrió/quién clickeó, exportar CSV
- **Autenticación JWT** con access token (15 min) + refresh token (7 días)
- **Tema oscuro** con TailwindCSS y componentes Radix UI

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js 18+ · Express · mysql2 · nodemailer |
| Colas | Bull · Redis |
| Real-time | Socket.io |
| Base de datos | MySQL 8.0+ |
| Frontend | React 18 · Vite · TypeScript · TailwindCSS |
| Editor | @unlayer/react |
| Estado | Zustand |

---

## Requisitos previos

- Node.js >= 18
- MySQL 8.0+
- Redis 6+ (en Plesk: activar desde el panel o instalar vía SSH)
- Git

---

## Instalación rápida (desarrollo local)

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/email-builder.git
cd email-builder

# 2. Ejecutar setup automático
bash setup.sh

# 3. Editar variables de entorno
nano backend/.env

# 4. Levantar todo (backend + frontend en paralelo)
npm run dev
```

La aplicación abre en:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

---

## Variables de entorno (`backend/.env`)

Copia `.env.example` → `backend/.env` y edita los valores:

```env
# Aplicación
PORT=3001
NODE_ENV=production
APP_URL=https://tudominio.com

# JWT (genera cadenas aleatorias con: openssl rand -base64 48)
JWT_SECRET=...cadena_aleatoria_larga...
JWT_REFRESH_SECRET=...otra_cadena_diferente...

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=emailbuilder
DB_USER=emailbuilder_user
DB_PASS=password_seguro

# Redis
REDIS_URL=redis://localhost:6379

# Usuario admin inicial (se crea en la primera migración)
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=ContraseñaSegura123!
ADMIN_NAME=Administrador
```

---

## Deploy en Plesk (guía paso a paso)

### Paso 1 — Crear base de datos MySQL

1. En Plesk → **Bases de datos** → **Agregar base de datos**
2. Nombre: `emailbuilder`
3. Crear usuario: `emailbuilder_user` con contraseña segura
4. Guardar credenciales para el `.env`

### Paso 2 — Activar Redis

```bash
# Conectar por SSH al servidor y verificar Redis
redis-cli ping
# Respuesta esperada: PONG

# Si no está instalado (Ubuntu/Debian):
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

> En algunos planes de Plesk, Redis ya está disponible como servicio. Consulta con tu proveedor.

### Paso 3 — Subir el código (GitHub → servidor)

```bash
# En el servidor vía SSH
cd /var/www/vhosts/tudominio.com
git clone https://github.com/tu-usuario/email-builder.git httpdocs
cd httpdocs
```

### Paso 4 — Configurar variables de entorno

```bash
cp .env.example backend/.env
nano backend/.env
```

Edita todas las variables según el Paso 1. Para generar JWT secrets:

```bash
openssl rand -base64 48   # ejecuta dos veces, una para cada secret
```

### Paso 5 — Instalar dependencias y migrar

```bash
bash setup.sh --prod
```

Este comando:
1. Instala todas las dependencias (backend + frontend)
2. Ejecuta las migraciones de MySQL (crea tablas + usuario admin)
3. Compila el frontend para producción (`frontend/dist/`)

### Paso 6 — Configurar Node.js App en Plesk

1. Plesk → **Tu dominio** → **Node.js**
2. Habilitar Node.js
3. Configurar:
   - **Versión de Node.js**: 18.x o 20.x
   - **Modo**: `Production`
   - **Archivo de inicio de la aplicación**: `backend/src/server.js`
   - **Raíz del documento**: `frontend/dist` (para archivos estáticos)
4. Hacer clic en **Reiniciar aplicación**

> Si Plesk no gestiona el proceso directamente, usa PM2:
> ```bash
> npm install -g pm2
> pm2 start backend/src/server.js --name emailbuilder --env production
> pm2 save
> pm2 startup
> ```

### Paso 7 — Configurar proxy inverso Nginx

En Plesk → **Tu dominio** → **Configuración de Apache y Nginx**, añade en directivas adicionales de Nginx:

```nginx
location /api {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location /socket.io {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

location /uploads {
    alias /var/www/vhosts/tudominio.com/httpdocs/uploads;
    expires 7d;
    add_header Cache-Control "public, immutable";
}

location / {
    try_files $uri $uri/ /index.html;
}
```

### Paso 8 — SSL con Let's Encrypt

1. Plesk → **Tu dominio** → **Certificados SSL/TLS**
2. **Let's Encrypt** → Instalar
3. Marcar "Redirigir de HTTP a HTTPS"
4. Instalar certificado

Actualiza `backend/.env`:
```env
APP_URL=https://tudominio.com
NODE_ENV=production
```

Reinicia la aplicación.

### Paso 9 — Configurar SMTP en la aplicación

1. Abre `https://tudominio.com` e inicia sesión con las credenciales admin
2. Ve a **Configuración SMTP** en el menú lateral
3. Añade tu cuenta de Gmail Workspace:
   - **Host**: `smtp.gmail.com`
   - **Puerto**: `465` (SSL) o `587` (TLS)
   - **Usuario**: `tu@empresa.com`
   - **Contraseña**: App Password de Google (no la contraseña normal)
4. Haz clic en **Probar conexión**

#### Generar App Password de Google

1. Google Account → Seguridad → Verificación en dos pasos → Contraseñas de aplicación
2. Aplicación: Correo | Dispositivo: Otro → Nombre: "Email Builder"
3. Copia la contraseña de 16 caracteres generada

### Paso 10 — Configurar SPF, DKIM y DMARC (recomendado)

Para mejorar la entregabilidad, configura estos registros DNS:

**SPF** (registro TXT en `tudominio.com`):
```
v=spf1 include:_spf.google.com ~all
```

**DMARC** (registro TXT en `_dmarc.tudominio.com`):
```
v=DMARC1; p=quarantine; rua=mailto:admin@tudominio.com; pct=100
```

**DKIM**: Genera las claves desde Google Workspace Admin → Aplicaciones → Gmail → Autenticar correo.

---

## Límites de envío recomendados

| Servicio | Límite diario | Emails/min recomendado |
|---|---|---|
| Gmail Workspace (Básico) | 2.000 | 20-40 |
| Gmail Workspace (Business) | 2.000 | 30-60 |
| SendGrid (plan gratuito) | 100/día | 10 |
| SMTP propio (VPS) | Sin límite | 60-120 |

> Configura siempre `emails_por_min` conservadoramente para evitar que Gmail marque como spam.

### Cómo se aplican los límites

`emails_por_min` y `emails_por_hora` son **barreras reales**, no orientativas:

1. **Al encolar**, el espaciado entre correos es el mayor de los dos intervalos
   (`60s / por_min` y `3600s / por_hora`), de modo que el plan respeta ambos topes por
   construcción.
2. **Antes de cada envío**, una compuerta cuenta los correos de los últimos 60 minutos
   (ventana móvil) y difiere el envío si se alcanzó el tope, ya sea **por campaña** o
   **por cuenta SMTP**. El límite por cuenta agrega todas las campañas que la usan, que
   es lo que de verdad protege de los límites de Gmail y no puede preverse al encolar.

Cuando un envío se difiere, el registro sigue en estado `pendiente` (no se pierde ningún
correo) y se reencola exactamente para cuando el envío más antiguo de la ventana cumpla
una hora, momento en que hay un hueco garantizado.

---

## Roles y acceso a cuentas SMTP

| Recurso | Admin | Editor |
|---|---|---|
| Listas, contactos y plantillas | Ve y edita **todo**, de todos | Solo **lo que él creó**, más lo compartido |
| Eliminar una lista | Sí | No (ni las propias) |
| Campañas | Las suyas | Las suyas (no puede eliminar) |
| Cuentas SMTP | Ve y gestiona **todas** | Solo usa las que tenga **asignadas** |
| Usuarios, Auditoría, Ajustes | Sí | No (salvo "Mi cuenta") |

Las cuentas SMTP se asignan desde **Ajustes → Usuarios**, al editar un usuario. Se puede
marcar una como **principal** para que venga preseleccionada al crear campañas.

`smtp_configs.user_id` indica **quién creó** la cuenta, no quién puede usarla: el acceso
lo determina la tabla `user_smtp_configs`. La restricción se valida en el backend al crear
**y al editar** campañas, de modo que una petición manipulada no puede usar una cuenta no
asignada.

### Visibilidad de listas, contactos y plantillas

Cada recurso pertenece a quien lo creó (`user_id`):

- **Editor** → ve y edita únicamente lo suyo. No ve nada de otros editores ni del admin.
- **Admin** → ve y edita todo, con indicación del creador de cada recurso.

**Excepción — recursos compartidos.** El admin puede marcar una lista o una plantilla como
`compartida`. En ese caso la ven todos los usuarios y pueden **usarla** (enviarle campañas,
duplicar la plantilla), pero **no editarla, eliminarla ni añadirle contactos**. Solo el
admin marca y desmarca ese flag.

Los **contactos no tienen visibilidad propia: heredan la de su lista**. Un flag
independiente permitiría estados incoherentes, como un contacto visible dentro de una lista
que no lo es.

La regla se aplica **en las consultas SQL**, no solo en la interfaz: el acceso por ID a una
lista, contacto o plantilla ajena devuelve 404 aunque se manipule la petición. Al crear o
editar una campaña se valida igualmente que la lista y la plantilla sean accesibles.

> **Al desplegar la migración 007** todo nace privado. Los editores dejan de ver de
> inmediato las listas y plantillas creadas por administradores; comparte a mano las que el
> equipo necesite. Las campañas ya existentes siguen enviando —la validación solo actúa al
> crear o editar—, pero editarlas fallará hasta compartir el recurso.

---

## Errores de envío y reenvío selectivo

Cada fallo se clasifica en una categoría, se traduce al español y se marca como
**permanente** o **temporal**. El texto técnico original se conserva intacto en
`ultimo_error`: la traducción no destruye la evidencia.

| Categoría | ¿Reintentable? | ¿Desactiva el contacto? |
|---|---|---|
| Dirección inexistente | No | **Sí** |
| Rechazado como spam | No | No |
| Buzón lleno | Sí | No |
| Límite del proveedor | Sí | No |
| Error de autenticación | Sí | No |
| Error temporal | Sí | No |

Son dos conceptos distintos: **permanente** decide si se reintenta; la **desactivación
del contacto** solo ocurre cuando el servidor confirma que la dirección no existe. Un
rechazo por spam es permanente, pero el buzón existe y no se toca al contacto.

Un error permanente **corta los reintentos de inmediato**, sin gastar los intentos de la
cola ni volver a molestar al servidor de destino.

### Reenvío selectivo

Desde el detalle de campaña, `Reenviar no entregados` muestra cuántos destinatarios se
reenviarían, desglosados por motivo, y **cuántos se excluyen y por qué** antes de confirmar.

Los correos ya entregados **nunca se repiten**, garantizado por dos barreras
independientes: el reenvío solo toca filas cuyo estado no es `enviado`, y el procesador de
la cola descarta cualquier envío ya marcado como `enviado`. Se excluyen también los fallos
permanentes, los desuscritos y las direcciones inválidas.

El reenvío reutiliza el encolado normal, así que hereda el throttling, el límite horario,
el jitter y la compuerta de ventana móvil. Queda registrado en `audit_log`.

### Limpieza automática de direcciones muertas

Al primer fallo por dirección inexistente, el contacto se marca como inválido **en todas
las listas donde aparezca ese email** — si se desactivara solo la fila que falló, se le
seguiría enviando desde las demás. `encolarCampaña` ya excluye los contactos con
`email_valido = 0`, así que quedan fuera de futuras campañas.

Se revisan en **Contactos → filtro "Inválidos"**, que muestra el motivo y la fecha. Un
admin puede reactivarlos desde ahí.

---

## Auditoría y trazabilidad

El módulo de auditoría (`/auditoria`, solo administradores) conserva el historial de
envíos aunque se eliminen campañas:

- **Soft delete de campañas.** Eliminar una campaña la marca con `deleted_at` y
  `deleted_by`, y la oculta del listado. Nunca se borra físicamente, y sus registros de
  `campaign_sends` y `email_events` se conservan íntegros. Las FK están en
  `ON DELETE RESTRICT`, así que un `DELETE` manual por SQL falla en vez de arrasar el
  histórico. Un admin puede restaurarla desde la vista de auditoría.
- **Tabla `audit_log` inmutable.** No tiene foreign keys a propósito: ninguna eliminación
  en cascada puede alcanzarla. Guarda snapshots del nombre de campaña, usuario y cuenta
  SMTP, de modo que el registro sigue siendo legible aunque esas filas desaparezcan.
- **Los enlaces de tracking siguen activos** para campañas eliminadas. Es deliberado:
  cortar el `List-Unsubscribe` de correos ya entregados sería un problema de cumplimiento.

### Inmutabilidad fuerte de `audit_log`

La migración 004 crea triggers `BEFORE UPDATE` / `BEFORE DELETE` que abortan cualquier
modificación. Pero **un trigger lo puede eliminar cualquiera con privilegios DDL**. Para
inmutabilidad real, revoca los permisos al usuario MySQL de la aplicación:

```sql
REVOKE UPDATE, DELETE ON emailbuilder.audit_log FROM 'usuario_app'@'localhost';
FLUSH PRIVILEGES;
```

La aplicación solo hace `INSERT` y `SELECT` sobre esa tabla, así que revocar `UPDATE` y
`DELETE` no afecta a su funcionamiento.

### Cuadre de cuota por cuenta SMTP

`campaign_sends.smtp_config_id` guarda la cuenta usada en cada envío como snapshot, así
que la atribución no cambia aunque después se edite la cuenta de la campaña. La vista de
auditoría contrasta el contador `enviados_hoy` con el conteo real de registros del día y
muestra la desviación. El conteo refleja **correos aceptados por el servidor SMTP**, que
es la métrica que consume cuota del proveedor; un rebote posterior al ACK ya la consumió.

---

## Scripts disponibles

```bash
npm run dev           # Backend + frontend en paralelo (desarrollo)
npm run dev:backend   # Solo backend con nodemon
npm run dev:frontend  # Solo frontend con Vite HMR
npm run build         # Compilar frontend para producción
npm start             # Iniciar backend en producción
npm run migrate       # Ejecutar migraciones de base de datos
bash setup.sh         # Setup completo (desarrollo)
bash setup.sh --prod  # Setup + build (producción)
```

---

## Estructura del proyecto

```
email-builder/
├── backend/
│   ├── src/
│   │   ├── config/          # DB, Redis, Multer, Logger
│   │   ├── middleware/       # Auth JWT, Error handler
│   │   ├── migrations/       # Schema SQL + runner
│   │   ├── routes/           # auth, smtp, listas, contactos,
│   │   │                     # plantillas, uploads, campanas,
│   │   │                     # tracking, reportes
│   │   ├── services/         # smtp, import, socket, queue
│   │   ├── app.js
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── charts/       # DonutChart, LineChart (SVG puro)
│   │   │   ├── contactos/    # ImportarWizard, modales
│   │   │   ├── constructor/  # Panels, VistaPrevia
│   │   │   ├── layout/       # Sidebar, AppLayout
│   │   │   └── ui/           # Button, Card, Badge, Label, etc.
│   │   ├── hooks/            # useSocket
│   │   ├── lib/              # api.ts, utils.ts
│   │   ├── pages/            # Login, Dashboard, Contactos,
│   │   │                     # Plantillas, Constructor,
│   │   │                     # Campanas, NuevaCampana,
│   │   │                     # DetalleCampana, Reportes,
│   │   │                     # ReporteCampana
│   │   ├── store/            # authStore, constructorStore
│   │   └── App.tsx
│   └── package.json
├── uploads/                  # Imágenes subidas (ignorado en git)
├── .env.example
├── .gitignore
├── package.json              # npm workspaces raíz
├── setup.sh                  # Script de instalación automática
└── README.md
```

---

## Solución de problemas frecuentes

### Redis no conecta
```bash
redis-cli ping          # debe responder PONG
sudo systemctl status redis-server
sudo systemctl start redis-server
```

### Error de MySQL al migrar
```bash
# Verifica credenciales en backend/.env
mysql -u emailbuilder_user -p emailbuilder
# Si la base de datos no existe:
mysql -u root -p -e "CREATE DATABASE emailbuilder CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### El frontend no carga en producción
```bash
# Verificar que frontend/dist/ existe
ls frontend/dist/
# Si no existe, compilar:
npm run build
```

### Socket.io no conecta (progreso en tiempo real no funciona)
- Verifica que el proxy de Nginx incluye la sección `/socket.io` con `Upgrade` y `Connection`
- Comprueba que el puerto 3001 no está bloqueado por el firewall del servidor

### Los emails van a spam
- Configura SPF, DKIM y DMARC (ver Paso 10)
- Usa siempre App Password de Google, nunca la contraseña normal
- Reduce `emails_por_min` a 10-20 para empezar y sube gradualmente
- Verifica que `APP_URL` en `.env` apunta al dominio correcto (necesario para links de tracking)

---

## Licencia

MIT — Libre para uso comercial y personal.
