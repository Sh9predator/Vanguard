export interface Proc {
  n: string; // name
  p: number; // pid
  c: number; // cpu % of whole machine
  m: number; // resident bytes
  s: string; // status
}

export interface Gpu {
  n: string; // name
  u: number; // utilisation %
  mu: number; // VRAM used, bytes
  mt: number; // VRAM total, bytes
  t?: number; // temperature in C, when the driver reports it
}

export interface DiskInfo {
  n: string; // label or device
  m: string; // mount point
  f: string; // filesystem
  k: string; // "SSD", "HDD" or ""
  t: number; // total bytes
  a: number; // available bytes
  r: number; // read B/s
  w: number; // write B/s
  x?: boolean; // removable
}

export interface NetInfo {
  n: string;
  rx: number; // B/s
  tx: number;
  trx: number; // bytes since boot
  ttx: number;
  mac?: string;
  ip?: string[];
}

export interface Snapshot {
  cpu: number;
  cores: number[];
  mu: number;
  mt: number;
  su: number;
  st: number;
  dr: number;
  dw: number;
  rx: number;
  tx: number;
  gpus: Gpu[];
  ct?: number; // CPU temperature in C, where available
  disks: DiskInfo[];
  nets: NetInfo[];
  procs?: Proc[];
}
