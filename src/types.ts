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
  procs?: Proc[];
}
