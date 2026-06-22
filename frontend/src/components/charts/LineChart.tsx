interface Serie {
  label: string
  color: string
  datos: number[]
}

interface LineChartProps {
  etiquetas: string[]   // eje X
  series: Serie[]
  altura?: number
  formatearY?: (v: number) => string
}

const PAD = { top: 16, right: 12, bottom: 36, left: 44 }

export function LineChart({
  etiquetas,
  series,
  altura = 220,
  formatearY = (v) => v.toLocaleString('es-ES'),
}: LineChartProps) {
  const ancho = 560
  const plotW  = ancho - PAD.left - PAD.right
  const plotH  = altura - PAD.top  - PAD.bottom

  const todosLosValores = series.flatMap(s => s.datos)
  const maxVal = Math.max(...todosLosValores, 1)
  const minVal = 0

  // Normalizar valor a Y
  const toY  = (v: number) => PAD.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH
  const toX  = (i: number) => PAD.left + (etiquetas.length > 1 ? (i / (etiquetas.length - 1)) * plotW : plotW / 2)

  // Líneas de cuadrícula
  const GRID_LINES = 4
  const gridVals = Array.from({ length: GRID_LINES + 1 }, (_, i) =>
    Math.round((maxVal / GRID_LINES) * i)
  )

  // Etiquetas reducidas del eje X (mostrar máx. 7)
  const step = Math.max(1, Math.ceil(etiquetas.length / 7))
  const etiquetasX = etiquetas.map((e, i) => ({ e, i, visible: i % step === 0 || i === etiquetas.length - 1 }))

  return (
    <svg
      viewBox={`0 0 ${ancho} ${altura}`}
      width="100%"
      className="overflow-visible"
      role="img"
      aria-label="Gráfica de líneas"
    >
      {/* Grid horizontal */}
      {gridVals.map((val, i) => {
        const y = toY(val)
        return (
          <g key={i}>
            <line
              x1={PAD.left} y1={y} x2={ancho - PAD.right} y2={y}
              stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 4"
            />
            <text
              x={PAD.left - 6} y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="hsl(var(--muted-foreground))"
            >
              {formatearY(val)}
            </text>
          </g>
        )
      })}

      {/* Eje X — etiquetas */}
      {etiquetasX.filter(e => e.visible).map(({ e, i }) => (
        <text
          key={i}
          x={toX(i)} y={altura - 6}
          textAnchor="middle"
          fontSize="10"
          fill="hsl(var(--muted-foreground))"
        >
          {e.length > 6 ? e.slice(5) : e}  {/* mostrar MM-DD si formato YYYY-MM-DD */}
        </text>
      ))}

      {/* Series */}
      {series.map((serie, si) => {
        if (serie.datos.length === 0) return null
        const puntos = serie.datos.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
        const puntosArea = [
          `${toX(0)},${toY(0)}`,
          ...serie.datos.map((v, i) => `${toX(i)},${toY(v)}`),
          `${toX(serie.datos.length - 1)},${toY(0)}`,
        ].join(' ')

        return (
          <g key={si}>
            {/* Área bajo la línea */}
            <polygon
              points={puntosArea}
              fill={serie.color}
              opacity="0.08"
            />
            {/* Línea */}
            <polyline
              points={puntos}
              fill="none"
              stroke={serie.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Puntos */}
            {serie.datos.map((v, i) => (
              <circle key={i} cx={toX(i)} cy={toY(v)} r="3.5" fill={serie.color}>
                <title>{etiquetas[i]}: {formatearY(v)}</title>
              </circle>
            ))}
          </g>
        )
      })}

      {/* Marco del área del gráfico */}
      <line
        x1={PAD.left} y1={PAD.top}
        x2={PAD.left} y2={PAD.top + plotH}
        stroke="hsl(var(--border))" strokeWidth="1"
      />
    </svg>
  )
}

// ── Leyenda separada ──────────────────────────────────────────────────────────
export function LineChartLeyenda({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-2">
      {series.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-4 h-0.5 rounded" style={{ backgroundColor: s.color }} />
          {s.label}
        </div>
      ))}
    </div>
  )
}
