import type { KanjiNode } from "./types";

export async function loadKanji(filename: string): Promise<KanjiNode[]> {
  const BASE = import.meta.env.BASE_URL;
  const res = await fetch(`${BASE}data/${filename}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
