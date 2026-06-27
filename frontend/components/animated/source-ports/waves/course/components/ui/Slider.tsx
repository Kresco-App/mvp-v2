/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex min-h-10 w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
      <SliderPrimitive.Range className="absolute h-full bg-yellow-500" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="relative block h-5 w-5 rounded-full border-2 border-yellow-500 bg-white shadow-sm ring-offset-white transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out after:absolute after:-inset-2.5 after:content-[''] hover:scale-[1.04] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-200/80 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
