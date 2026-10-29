import { useEffect, useRef, useState } from "react";

const MIN = 150; // minimum cell width
const GAP = 10;
const LABEL = 14;
const PLOT = 40;
const CELL = LABEL + PLOT;

/** All per-core graphs on one canvas: one drawing surface instead of one per core. */
export default function CoreGrid({ data }: { data: number[][] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(600);

  const cols = Math.max(1, Math.floor((w + GAP) / (MIN + GAP)));
  const rows = Math.ceil(data.length / cols);
  const height = rows * CELL + Math.max(0, rows - 1) * GAP;

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c || !w || !height) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);
    const cw = (w - GAP * (cols - 1)) / cols;
    g.font = '10px ui-monospace, "Cascadia Mono", Consolas, monospace';

    data.forEach((series, i) => {
      const x0 = (i % cols) * (cw + GAP);
      const y0 = Math.floor(i / cols) * (CELL + GAP);
      const top = y0 + LABEL;

      g.fillStyle = "#71717A";
      g.fillText(`Core ${i}`, x0, y0 + 10);
      g.fillStyle = "#121216";
      g.fillRect(x0, top, cw, PLOT);
      g.strokeStyle = "#26262C";
      g.lineWidth = 1;
      g.strokeRect(x0 + 0.5, top + 0.5, cw - 1, PLOT - 1);

      const n = series.length;
      if (n < 2) return;
      const step = cw / (n - 1);
      g.beginPath();
      series.forEach((v, k) => {
        const x = x0 + k * step;
        const y = top + PLOT - 1 - Math.min(v / 100, 1) * (PLOT - 2);
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.strokeStyle = "#8B5CF6";
      g.lineWidth = 1.25;
      g.stroke();
      g.lineTo(x0 + cw, top + PLOT);
      g.lineTo(x0, top + PLOT);
      g.closePath();
      g.fillStyle = "#8B5CF61F";
      g.fill();
    });
  });

  return (
    <div ref={wrap} style={{ height, flex: "none" }}>
      <canvas ref={cv} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
