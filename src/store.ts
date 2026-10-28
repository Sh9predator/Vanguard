import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Proc, Snapshot } from "./types";

/** Samples kept per series. Ring buffers are mutated in place; only `state` changes identity. */
export const HISTORY = 120;

export interface History {
  cpu: number[];
  mem: number[];
  dr: number[];
  dw: number[];
  rx: number[];
  tx: number[];
  cores: number[][];
}

export interface State {
  snap: Snapshot | null;
  procs: Proc[];
  hist: History;
  intervalMs: number;
}

const KEY = "vanguard.interval";

function loadInterval(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= 250 ? v : 1000;
  } catch {
    return 1000;
  }
}

let state: State = {
  snap: null,
  procs: [],
  hist: { cpu: [], mem: [], dr: [], dw: [], rx: [], tx: [], cores: [] },
  intervalMs: loadInterval(),
};

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function push(a: number[], v: number) {
  a.push(v);
  if (a.length > HISTORY) a.shift();
}

function ingest(s: Snapshot) {
  const h = state.hist;
  push(h.cpu, s.cpu);
  push(h.mem, s.mt ? (s.mu / s.mt) * 100 : 0);
  push(h.dr, s.dr);
  push(h.dw, s.dw);
  push(h.rx, s.rx);
  push(h.tx, s.tx);
  s.cores.forEach((v, i) => push((h.cores[i] ??= []), v));
  state = { ...state, snap: s, procs: s.procs ?? state.procs };
  emit();
}

export function useStore(): State {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
}

export async function start() {
  await listen<Snapshot>("metrics", (e) => ingest(e.payload));
  document.addEventListener("visibilitychange", () =>
    invoke("set_visible", { visible: !document.hidden }),
  );
  await invoke("set_interval", { ms: state.intervalMs });
}

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`vanguard.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`vanguard.${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: setting just won't persist */
  }
}

export function changeInterval(ms: number) {
  try {
    localStorage.setItem(KEY, String(ms));
  } catch {
    /* storage unavailable: keep in memory only */
  }
  state = { ...state, intervalMs: ms };
  emit();
  void invoke("set_interval", { ms });
}

export function wantProcesses(want: boolean) {
  void invoke("set_want_procs", { want });
}
