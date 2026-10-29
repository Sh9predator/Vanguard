import type { History, Sel } from "./store";
import type { DiskInfo, NetInfo, Snapshot } from "./types";

/** The volume the user picked (undefined = all of them) with matching rates and history. */
export function pickDisk(snap: Snapshot, disks: DiskInfo[], hist: History, sel: Sel) {
  const vol = disks.find((d) => d.m === sel.disk);
  const h = vol ? hist.vol[vol.m] : undefined;
  return {
    vol,
    r: vol ? vol.r : snap.dr,
    w: vol ? vol.w : snap.dw,
    rh: vol ? (h?.a ?? []) : hist.dr,
    wh: vol ? (h?.b ?? []) : hist.dw,
  };
}

/** Same for network interfaces. */
export function pickNet(snap: Snapshot, nets: NetInfo[], hist: History, sel: Sel) {
  const nic = nets.find((n) => n.n === sel.net);
  const h = nic ? hist.net[nic.n] : undefined;
  return {
    nic,
    rx: nic ? nic.rx : snap.rx,
    tx: nic ? nic.tx : snap.tx,
    rxh: nic ? (h?.a ?? []) : hist.rx,
    txh: nic ? (h?.b ?? []) : hist.tx,
  };
}
