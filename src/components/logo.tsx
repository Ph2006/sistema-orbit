import { cn } from "@/lib/utils";
import type { SVGProps } from "react";

export function OrbitLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      aria-hidden="true"
      {...props}
      className={cn("h-10 w-auto", props.className)}
    >
      <defs>
        <linearGradient id="orbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--accent))", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="45"
        stroke="hsl(var(--border))"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M 50,5 A 45,45 0 0 1 95,50"
        stroke="url(#orbitGradient)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="15" fill="hsl(var(--primary))" />
      <circle cx="95" cy="50" r="6" fill="hsl(var(--accent))" />
    </svg>
  );
}
