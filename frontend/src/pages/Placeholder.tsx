import { Construction } from 'lucide-react'

interface Props {
  titulo: string
  descripcion?: string
}

export default function Placeholder({ titulo, descripcion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
        <Construction className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <p className="text-muted-foreground text-sm mt-2 max-w-sm">
        {descripcion || 'Este módulo se construirá en el próximo slice de desarrollo.'}
      </p>
    </div>
  )
}
