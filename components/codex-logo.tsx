import Image from 'next/image'
import { cn } from '@/lib/utils'

interface CodexLogoProps {
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function CodexLogo({ className, imageClassName, priority = false }: CodexLogoProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-lg bg-[#0b0f19] shadow-[0_10px_30px_rgba(99,102,241,0.24)]',
        className,
      )}
    >
      <Image
        src="/codex-logo.png"
        alt="Codex"
        width={640}
        height={640}
        priority={priority}
        className={cn('size-full object-contain', imageClassName)}
      />
    </div>
  )
}
