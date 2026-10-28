import { useEffect, useRef } from "react";
import { HISTORY } from "../store";

export interface Series {
  data: number[];
  color: string; // #RRGGBB
  fill?: boolean;
}

interface Props {
  series: Series[];
  /** Fixed ceiling (e.g. 100 for percentages). Omit to auto-scale. */
  max?: number;
  /** Smallest auto-scaled ceiling, so an idle graph doesn't magnify noise. */
  floor?: number;
  fmt?: (v: number) => string;
  /** Pixel height. Omit to fill the parent flex container. */
  height?: number;
  label?: boolean;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

export default function Graph({ series, max, floor = 1, fmt = (v) => String(Math.round(v)), height, label = true }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  const draw = () => {
    const c = cv.current;
    const w = wrap.current;
    if (!c || !w) return;
    const W = w.clientWidth;
    const H = w.clientHeight;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const peak = Math.max(0, ...series.map((s) => Math.max(0, ...s.data)));
    const top = max ?? niceMax(Math.max(peak, floor));

    g.strokeStyle = "#1E1E24";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      const y = Math.round((H * i) / 4) + 0.5;
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();

    const step = W / (HISTORY - 1);
    for (const s of series) {
      const n = s.data.length;
      if (n < 2) continue;
      g.beginPath();
      s.data.forEach((v, i) => {
        const x = W - (n - 1 - i) * step;
        const y = H - 1 - Math.min(v / top, 1) * (H - 2);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.strokeStyle = s.color;
      g.lineWidth = 1.25;
      g.stroke();
      if (s.fill) {
        g.lineTo(W, H);
        g.lineTo(W - (n - 1) * step, H);
        g.closePath();
        g.fillStyle = s.color + "1F";
        g.fill();
      }
    }

    if (label) {
      g.fillStyle = "#71717A";
      g.font = '10px ui-monospace, "Cascadia Mono", Consolas, monospace';
      g.fillText(fmt(top), 4, 11);
    }
  };

  const latest = useRef(draw);
  latest.current = draw;

  useEffect(() => {
    const ro = new ResizeObserver(() => latest.current());
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(draw); // redraw after every render; renders only happen per sample

  return (
    <div ref={wrap} className="graph" style={height ? { height } : { flex: 1, minHeight: 48 }}>
      <canvas ref={cv} />
    </div>
  );
}
