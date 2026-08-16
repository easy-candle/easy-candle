type DrawingToolIconProps = {
  svg: string
  className?: string
}

/** Inlines a drawing SVG so stroke="currentColor" follows IconButton. */
export default function DrawingToolIcon({
  svg,
  className = 'h-4 w-4'
}: DrawingToolIconProps) {
  return (
    <span
      aria-hidden
      className={`inline-flex ${className} shrink-0 [&_svg]:h-full [&_svg]:w-full`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
