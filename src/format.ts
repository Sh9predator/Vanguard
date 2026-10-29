const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

export function bytes(n: number, digits = 1): string {
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(n) : n.toFixed(digits)} ${UNITS[i]}`;
}

/** Short display name for a mount point: "C:\\" -> "C:", "/" stays, long paths -> last segment. */
export const volName = (m: string) => {
  const t = m.replace(/[\\/]+$/, "") || m;
  return t.length > 14 ? t.split(/[\\/]/).pop() || t : t;
};

/** "C: - Windows", "/ - /dev/nvme0n1p2": enough to tell volumes apart in a picker. */
export const volLabel = (d: { m: string; n: string }) =>
  d.n && d.n !== d.m ? `${volName(d.m)} - ${d.n}` : volName(d.m);

export const rate = (n: number) => `${bytes(n)}/s`;
export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
