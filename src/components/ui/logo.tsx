"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [strokeWidth, setStrokeWidth] = useState(10);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      // Keep visual stroke weight consistent: target ~1.5px at any size.
      // strokeWidth is in viewBox units (420×420), so: 1.5 * (420 / renderedPx)
      setStrokeWidth(Math.round((1.5 * 420) / Math.max(width, 1)));
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 420 420"
      className={cn("h-5 w-5", className)}
      style={{ minWidth: "20px", minHeight: "20px" }}
    >
      <path
        d="M 357.72 183.95 Q 294.58 258.83 261.3 350.95 Q 272.78 221.07 306.42 95.09 Q 210 112.33 113.58 95.09 Q 224.23 193.04 339.9 285 Q 202.43 230.8 62.28 183.95 Q 147.22 135.18 210 60"
        fill="none"
        stroke="#DEA549"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="210" cy="60" r="14" fill="#8CBDB9" />
      <circle cx="357.72" cy="183.95" r="16" fill="#244952" />
    </svg>
  );
}
