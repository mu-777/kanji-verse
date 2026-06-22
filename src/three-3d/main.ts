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
import { startCinematic }       from "./cinematic";

async function main() {
  // 動画キャプチャ用シネマティックモード（?demo=1, 任意で &loop=1）。通常起動には影響しない。
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo") === "1";
  const loop = params.get("loop") === "1";
  const loading      = document.getElementById("loading")!;
  const loadPercent  = document.getElementById("loading-percent")!;
  const loadText     = document.getElementById("loading-text")!;
  const loadBarTrack = document.getElementById("loading-bar-track")!;
  const loadBarFill  = document.getElementById("loading-bar-fill")!;
  const canvas       = document.getElementById("canvas") as HTMLCanvasElement;

  // バー幅をテキスト幅の0.7倍に設定。
  // Web フォント(Inter)確定後に測らないとフォールバック基準の幅になりズレる。
  // ただしデータ読み込みはブロックしたくないので await せず非同期で設定する。
  document.fonts.ready.then(() => {
    loadBarTrack.style.width = `${loadText.offsetWidth * 0.7}px`;
  });

  // 進捗: テクスチャ生成(nodes.length) + GPU warmup(nodes.length)
  let totalWork = 0;
  let doneWork  = 0;
  function updateProgress(done: number, _total: number) {
    doneWork = done;
    const pct = Math.min(100, Math.round((doneWork / totalWork) * 100));
    loadPercent.textContent = `${pct}%`;
    loadBarFill.style.width = `${pct}%`;
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
  const { camera, controls, update: updateCamera, startIntroZoom, flyTo } = createCamera(renderer);
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
        interaction.searchNodes,
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

  // B: 起動のたびにウェルカムオーバーレイを表示（demo モードでは出さない）
  if (!demo) {
    const welcome = document.getElementById("welcome")!;
    welcome.style.display = "flex";
    const dismiss = () => {
      welcome.classList.add("hidden");
      welcome.addEventListener("transitionend", () => {
        welcome.style.display = "none";
      }, { once: true });
    };
    document.getElementById("welcome-btn")!.addEventListener("click", dismiss);
    document.addEventListener("keydown", dismiss, { once: true });
  }

  // 右下 ⓘ から開閉する info ボード（welcome と同じ kv-overlay スタイルを共有。再表示可能）
  const info = document.getElementById("info")!;
  const closeInfo = () => {
    info.classList.add("hidden");
    info.addEventListener("transitionend", () => {
      if (info.classList.contains("hidden")) info.style.display = "none";
    }, { once: true });
  };
  document.getElementById("info-btn")!.addEventListener("click", () => {
    info.classList.remove("hidden");
    info.style.display = "flex";
  });
  document.getElementById("info-close")!.addEventListener("click", closeInfo);
  info.addEventListener("click", (e) => { if (e.target === info) closeInfo(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && info.style.display === "flex") closeInfo();
  });

  if (!demo) startIntroZoom();

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
    searchByMeaning: (q) => interaction.searchByMeaning(q),
    clearSearch: () => interaction.clearSearch(),
    setFilter:  (f) => {
      interaction.setFilter(f.joyo, f.jinmei);
      kanjiPoints.updateFilter(f.joyo, f.jinmei);
    },
    get onSelect() { return interaction.onSelect; },
    set onSelect(fn) { interaction.onSelect = fn; },
  });

  // C: URLパラメーターで漢字が指定されていれば即座にジャンプ
  const urlKanji = new URLSearchParams(window.location.search).get("k");
  if (urlKanji) {
    const found = interaction.search(urlKanji);
    if (found && interaction.searchNode) {
      flyTo(nodeWorldPos(interaction.searchNode));
      interaction.selectNode(interaction.searchNode);
    }
  }

  // 動画キャプチャ用シネマティックモード: カメラを奪い、演出タイムラインを再生する。
  // setupUI 後に起動する（検索入力の input ハンドラが必要なため）。
  const cinematic = demo
    ? startCinematic(
        {
          camera,
          controls,
          nodes,
          interaction,
          searchInput: document.getElementById("search-input") as HTMLInputElement,
        },
        { loop },
      )
    : null;

  // レンダーループ
  let prev = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt  = (now - prev) / 1000;
    prev = now;
    if (cinematic) cinematic.update(dt);
    else updateCamera(dt);
    proximityLabel.update(dt);
    composer.render();
    proximityLabel.render(renderer);
  }
  animate();
}

main();
