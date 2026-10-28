export interface Proc {
  n: string; // name
  p: number; // pid
  c: number; // cpu % of whole machine
  m: number; // resident bytes
  s: string; // status
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
  procs?: Proc[];
}
