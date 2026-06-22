#!/usr/bin/env bash
# ============================================================
# setup.sh — Instalación y arranque del Email Marketing Builder
# Uso: bash setup.sh [--prod]
# ============================================================
set -e

VERDE='\033[0;32m'
AMARILLO='\033[1;33m'
ROJO='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

log()    { echo -e "${CYAN}[setup]${RESET} $1"; }
ok()     { echo -e "${VERDE}[✓]${RESET} $1"; }
warn()   { echo -e "${AMARILLO}[!]${RESET} $1"; }
error()  { echo -e "${ROJO}[✗]${RESET} $1"; exit 1; }

MODO="${1:-}"
ES_PROD=false
[[ "$MODO" == "--prod" ]] && ES_PROD=true

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║     Email Marketing Builder — Setup          ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Verificar Node.js ──────────────────────────────────────────────────────
log "Verificando Node.js..."
if ! command -v node &>/dev/null; then
  error "Node.js no encontrado. Instala Node.js >= 18 desde https://nodejs.org"
fi
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VER" -lt 18 ]]; then
  error "Se requiere Node.js >= 18. Versión actual: $(node -v)"
fi
ok "Node.js $(node -v)"

# ── 2. Verificar npm ──────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  error "npm no encontrado"
fi
ok "npm $(npm -v)"

# ── 3. Archivo .env ──────────────────────────────────────────────────────────
log "Verificando archivo de entorno..."
if [[ ! -f "backend/.env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example backend/.env
    warn "Se creó backend/.env desde .env.example"
    warn "⚠️  EDITA backend/.env con tus credenciales antes de continuar"
    echo ""
    echo -e "${AMARILLO}Variables críticas que debes configurar:${RESET}"
    echo "  DB_HOST, DB_NAME, DB_USER, DB_PASS"
    echo "  JWT_SECRET  (mínimo 32 chars aleatorios)"
    echo "  JWT_REFRESH_SECRET"
    echo "  REDIS_URL"
    echo "  APP_URL     (tu dominio en producción)"
    echo ""
    read -r -p "¿Continuar con los valores por defecto? [s/N] " resp
    [[ "$resp" =~ ^[sS]$ ]] || exit 0
  else
    error "No se encontró .env.example. Clona el repositorio completo."
  fi
else
  ok "backend/.env ya existe"
fi

# ── 4. Crear directorio uploads ───────────────────────────────────────────────
log "Creando directorio de uploads..."
mkdir -p uploads
ok "uploads/ listo"

# ── 5. Instalar dependencias ──────────────────────────────────────────────────
log "Instalando dependencias (puede tardar 1-2 min)..."
npm install
ok "Dependencias del workspace instaladas"

# ── 6. Migraciones de base de datos ──────────────────────────────────────────
log "Ejecutando migraciones de base de datos..."
if npm run migrate 2>&1; then
  ok "Migraciones aplicadas"
else
  warn "Las migraciones fallaron (¿ya existen las tablas?). Continuando..."
fi

# ── 7. Build del frontend (solo producción) ───────────────────────────────────
if $ES_PROD; then
  log "Construyendo frontend para producción..."
  npm run build
  ok "Frontend compilado en frontend/dist/"
fi

# ── 8. Mensaje final ──────────────────────────────────────────────────────────
echo ""
echo -e "${VERDE}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${VERDE}║     ¡Setup completado!                       ║${RESET}"
echo -e "${VERDE}╚══════════════════════════════════════════════╝${RESET}"
echo ""

if $ES_PROD; then
  echo -e "  Iniciar en producción:  ${CYAN}npm start${RESET}"
else
  echo -e "  Iniciar en desarrollo:  ${CYAN}npm run dev${RESET}"
  echo -e "  Backend:                ${CYAN}http://localhost:3001${RESET}"
  echo -e "  Frontend:               ${CYAN}http://localhost:5173${RESET}"
fi
echo ""
echo -e "  Usuario inicial:  ${CYAN}el que configuraste en ADMIN_EMAIL${RESET}"
echo -e "  Docs completas:   ${CYAN}README.md${RESET}"
echo ""
