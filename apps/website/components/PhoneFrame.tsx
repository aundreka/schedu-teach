import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * Real app screenshot inside a phone bezel. Used for full-screen captures
 * (824×1800). Includes a subtle hover lift for interactivity.
 */
export function PhoneFrame({
  src,
  alt,
  width = 824,
  height = 1800,
  priority = false,
  className,
}: {
  src: string
  alt: string
  width?: number
  height?: number
  priority?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'group/phone rounded-[2.2rem] border border-ink/10 bg-ink p-2 shadow-2xl shadow-ink/25 transition-transform duration-300 hover:-translate-y-1.5',
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.7rem] bg-white">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          className="h-auto w-full select-none"
          sizes="(max-width: 768px) 70vw, 320px"
        />
      </div>
    </div>
  )
}

/**
 * A cropped screenshot (e.g. the Create sheet) shown as a floating card,
 * no phone bezel. Good for partial UI captures.
 */
export function CardShot({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string
  alt: string
  width: number
  height: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-line bg-white shadow-xl shadow-ink/10 transition-transform duration-300 hover:-translate-y-1.5',
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full select-none"
        sizes="(max-width: 768px) 90vw, 460px"
      />
    </div>
  )
}
