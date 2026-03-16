export interface KanjiNode {
  k: string;
  m: string[];
  on: string[];
  kun: string[];
  x: number;
  y: number;
  z?: number;      // 3D のみ
  t: 0 | 1;        // 0=常用, 1=人名用
  c?: number;      // cluster_id (0〜19)
}

export type FilterState = { joyo: boolean; jinmei: boolean };
