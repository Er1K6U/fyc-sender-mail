interface Segmento {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segmentos: Segmento[]
  titulo?: string
  subtitulo?: string
  size?: number
  grosor?: number
}

export function DonutChart({
  segmentos,
  titulo,
  subtitulo,
  size = 180,
  grosor = 36,
}: DonutChartProps) {
  const total = segmentos.reduce((s, seg) => s + seg.value, 0)
  const r = (size - grosor) / 2
  const cx = size / 2
  const cy = size / 2
  const circunferencia = 2 * Math.PI * r

  // Calcular arcos SVG
  let offset = 0
  const arcos = segmentos.map(seg => {
    const fraccion = total > 0 ? seg.value / total : 0
    const longitud = fraccion * circunferencia
    const arco = { offset, longitud, ...seg, fraccion }
    offset += longitud
    return arco
  })

  // Transformar offset a "inicio desde las 12" (rotación -90°)
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="rotate-[-90deg]"
        >
          {/* Fondo */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={grosor}
          />
          {/* Segmentos */}
          {total === 0 ? (
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={grosor}
            />
          ) : arcos.map((arco, i) => (
            arco.value === 0 ? null : (
              <circle
                key={i}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={arco.color}
                strokeWidth={grosor}
                strokeDasharray={`${arco.longitud} ${circunferencia - arco.longitud}`}
                strokeDashoffset={-arco.offset}
                strokeLinecap="butt"
              >
                <title>{arco.label}: {arco.value.toLocaleString('es-ES')} ({(arco.fraccion * 100).toFixed(1)}%)</title>
              </circle>
            )
          ))}
        </svg>

        {/* Texto central */}
        {(titulo !== undefined || subtitulo !== undefined) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            {titulo !== undefined && (
              <span className="text-2xl font-bold leading-none">{titulo}</span>
            )}
            {subtitulo !== undefined && (
              <span className="text-xs text-muted-foreground mt-1">{subtitulo}</span>
            )}
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {segmentos.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium">{seg.value.toLocaleString('es-ES')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
