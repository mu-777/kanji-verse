import * as THREE from "three";
import type { KanjiNode } from "../shared/types";

/**
 * NebulaEngine インターフェース。
 * 実装を差し替えやすくするための抽象化。
 */
export interface NebulaEngine {
  /** シーンにネビュラを追加する */
  init(scene: THREE.Scene, nodes: KanjiNode[]): void;
  /** リソース解放 */
  dispose(): void;
}
