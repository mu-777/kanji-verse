import { createScene }          from "../three-core/scene";
import { createCamera }         from "../three-core/camera";
import { createKanjiPoints }    from "../three-core/points";
import { createComposer }       from "../three-core/composer";
import { createInteraction }    from "../three-core/interaction";
import { createProximityLabel } from "../three-core/proximity-label";
import { VolumetricNebula }     from "./volumetric-nebula";
import { loadKanji }            from "../shared/loader";
import { setupUI }              from "../shared/ui";

async function main() {
  const loading = document.getElementById("loading")!;
  const canvas  = document.getElementById("canvas") as HTMLCanvasElement;

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

  const { scene, renderer }              = createScene(canvas);
  const { camera, update: updateCamera } = createCamera(renderer);
  const kanjiPoints                      = createKanjiPoints(nodes);
  const { composer }                     = createComposer(renderer, scene, camera);

  // ネビュラを追加（NebulaEngine インターフェース経由で差し替え可能）
  const nebula = new VolumetricNebula();
  nebula.init(scene, nodes);

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

  const proximityLabel = createProximityLabel(camera, nodes);

  loading.style.display = "none";

  setupUI({
    search:      (k) => interaction.search(k),
    clearSearch: () => interaction.clearSearch(),
    setFilter:   (f) => {
      interaction.setFilter(f.joyo, f.jinmei);
      kanjiPoints.updateFilter(f.joyo, f.jinmei);
    },
    get onSelect() { return interaction.onSelect; },
    set onSelect(fn) { interaction.onSelect = fn; },
  });

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
