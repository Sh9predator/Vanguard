const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

export function bytes(n: number, digits = 1): string {
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(n) : n.toFixed(digits)} ${UNITS[i]}`;
}

export const rate = (n: number) => `${bytes(n)}/s`;
export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
