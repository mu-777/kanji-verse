import * as THREE               from "three";
import { createScene }          from "../three-core/scene";
import { createCamera }         from "../three-core/camera";
import { createKanjiPoints }    from "../three-core/points";
import { WORLD_SCALE }          from "../three-core/points";
import { createComposer }       from "../three-core/composer";
import { createInteraction }    from "../three-core/interaction";
import { createProximityLabel } from "../three-core/proximity-label";
import { loadKanji }            from "../shared/loader";
import { setupUI }              from "../shared/ui";

async function main() {
  const loading      = document.getElementById("loading")!;
  const loadPercent  = document.getElementById("loading-percent")!;
  const canvas       = document.getElementById("canvas") as HTMLCanvasElement;

  // 進捗: テクスチャ生成(nodes.length) + GPU warmup(nodes.length)
  let totalWork = 0;
  let doneWork  = 0;
  function updateProgress(done: number, _total: number) {
    doneWork = done;
    const pct = Math.min(100, Math.round((doneWork / totalWork) * 100));
    loadPercent.textContent = `${pct}%`;
  }

  let nodes;
  try {
    nodes = await loadKanji("kanji-3d.json");
  } catch (e) {
    loading.innerHTML = `
      <p style="color:#ff6b6b">Failed to load data</p>
      <p style="font-size:12px;opacity:0.6;margin-top:8px">
        Run scripts/generate_data.py to generate public/data/kanji-3d.json
      </p>`;
    return;
  }

  // 総処理量 = テクスチャ生成 + GPU warmup
  totalWork = nodes.length * 2;

  const { scene, renderer }      = createScene(canvas);
  const { camera, update: updateCamera, startIntroZoom, flyTo } = createCamera(renderer);
  const kanjiPoints              = createKanjiPoints(nodes);
  const { composer }             = createComposer(renderer, scene, camera);
  scene.add(kanjiPoints.points);

  const interaction = createInteraction(
    canvas,
    camera,
    nodes,
    () => {
      kanjiPoints.updateHighlight(
        interaction.hoveredNode,
        interaction.selectedNode,
        interaction.searchNode,
      );
    },
  );

  // テクスチャ生成（前半50%）
  const proximityLabel = await createProximityLabel(camera, nodes, (done, total) => {
    updateProgress(done, total);
  });
  // GPU warmup（後半50%）
  doneWork = nodes.length; // テクスチャ生成完了分をベースに
  await proximityLabel.warmup(renderer, (done, total) => {
    updateProgress(nodes.length + done, total);
  });

  loading.style.display = "none";
  startIntroZoom();

  function nodeWorldPos(n: { x: number; y: number; z?: number }): THREE.Vector3 {
    return new THREE.Vector3(
      (n.x - 0.5) * WORLD_SCALE,
      (n.y - 0.5) * WORLD_SCALE,
      n.z !== undefined ? (n.z - 0.5) * WORLD_SCALE : 0,
    );
  }

  // 再クリック時: searchNode は interaction 側で設定済み、カメラを飛ばす
  interaction.onFlyTo = (node) => flyTo(nodeWorldPos(node));

  // setupUI が期待する UIRenderer インターフェースを満たす adapter
  setupUI({
    search: (k) => {
      const found = interaction.search(k);
      if (found && interaction.searchNode) {
        flyTo(nodeWorldPos(interaction.searchNode));
      }
      return found;
    },
    clearSearch: () => interaction.clearSearch(),
    setFilter:  (f) => {
      interaction.setFilter(f.joyo, f.jinmei);
      kanjiPoints.updateFilter(f.joyo, f.jinmei);
    },
    get onSelect() { return interaction.onSelect; },
    set onSelect(fn) { interaction.onSelect = fn; },
  });

  // レンダーループ
  let prev = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt  = (now - prev) / 1000;
    prev = now;
    updateCamera(dt);
    proximityLabel.update(dt);
    composer.render();
    proximityLabel.render(renderer);
  }
  animate();
}

main();
