"use client";

import { useCallback, useRef, type ReactNode } from "react";

/**
 * Wraps a chart and adds a PNG export button: serializes the rendered SVG
 * onto a 2× canvas over the site background and downloads it.
 */
export function ChartExport({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const exportPng = useCallback(() => {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0b0e13";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${name}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [name]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={exportPng}
        aria-label="Export chart as PNG"
        className="absolute -top-1 right-0 z-10 rounded border border-edge bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-accent-dim hover:text-fg"
      >
        PNG ↓
      </button>
      {children}
    </div>
  );
}
