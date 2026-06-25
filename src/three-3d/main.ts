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
import { createAudio }          from "../three-core/audio";
import { startCinematic }       from "./cinematic";
import { startShareClip, type ShareClipHandle } from "./share-clip";
import { createClipRecorder, type ClipRecorder } from "../three-core/recorder";
import type { KanjiNode }       from "../shared/types";

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

  // インタラクティブBGM（既定ミュート。ユーザーが ON にしたら遅延ロードして再生する）
  const audio = createAudio();

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
  const { camera, controls, update: updateCamera, startIntroZoom, flyTo, getSpeed } = createCamera(renderer);
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

  // ── BGM トグル UI：右下の常時ボタンと welcome の誘導トグルを同じ状態で同期する ──
  const soundBtn = document.getElementById("sound-btn")!;
  function syncSoundUI(on: boolean) {
    soundBtn.classList.toggle("off", !on);
    soundBtn.setAttribute("aria-label", on ? "Mute background music" : "Play background music");
    const ws = document.getElementById("welcome-sound");
    if (ws) {
      ws.textContent = on ? "♪ Sound on" : "♪ Sound off";
      ws.classList.toggle("off", !on);
    }
  }
  audio.onChange(syncSoundUI);
  syncSoundUI(audio.isEnabled());
  soundBtn.addEventListener("click", () => audio.setEnabled(!audio.isEnabled()));

  // B: 起動のたびにウェルカムオーバーレイを表示（demo モードでは出さない）
  if (!demo) {
    const welcome = document.getElementById("welcome")!;
    welcome.style.display = "flex";
    const dismiss = () => {
      // welcome の dismiss はユーザージェスチャ。ON 設定済みなら、ここで再生を開始する
      // （オートプレイ規制対策。再訪で pref=on のときもこのクリックで鳴り始める）。
      if (audio.isEnabled()) audio.setEnabled(true);
      welcome.classList.add("hidden");
      welcome.addEventListener("transitionend", () => {
        welcome.style.display = "none";
      }, { once: true });
    };
    document.getElementById("welcome-btn")!.addEventListener("click", dismiss);
    document.getElementById("welcome-sound")!.addEventListener("click", () => audio.setEnabled(!audio.isEnabled()));
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
  interaction.onFlyTo = (node) => { audio.bump(); flyTo(nodeWorldPos(node)); };

  // setupUI が期待する UIRenderer インターフェースを満たす adapter
  setupUI({
    search: (k) => {
      audio.bump();
      const found = interaction.search(k);
      if (found && interaction.searchNode) {
        flyTo(nodeWorldPos(interaction.searchNode));
      }
      return found;
    },
    searchByMeaning: (q) => { audio.bump(); return interaction.searchByMeaning(q); },
    clearSearch: () => interaction.clearSearch(),
    setFilter:  (f) => {
      interaction.setFilter(f.joyo, f.jinmei);
      kanjiPoints.updateFilter(f.joyo, f.jinmei);
    },
    get onSelect() { return interaction.onSelect; },
    set onSelect(fn) { interaction.onSelect = fn; },
    onShare: (node) => runShare(node),
  });

  // クリック（漢字選択）でワンショットを鳴らす。setupUI が設定した onSelect をラップする。
  // 視点(カメラ)から漢字までの距離でピッチを変える（近い=高い／遠い=低い）。
  // クリック時に1回だけ距離計算するので、毎フレームの処理（反応）には影響しない。
  const baseOnSelect = interaction.onSelect;
  interaction.onSelect = (node) => {
    if (node) {
      const dist = camera.position.distanceTo(nodeWorldPos(node)); // カメラ距離 ~0.3〜8
      audio.ping(Math.max(0, Math.min(1, (6 - dist) / (6 - 0.3))));
    }
    baseOnSelect(node);
  };

  // C: URLパラメーターで漢字が指定されていれば即座にジャンプ
  const urlKanji = new URLSearchParams(window.location.search).get("k");
  if (urlKanji) {
    const found = interaction.search(urlKanji);
    if (found && interaction.searchNode) {
      flyTo(nodeWorldPos(interaction.searchNode));
      interaction.selectNode(interaction.searchNode);
    }
  }

  // ── ソーシャル動画シェア ──
  // 2タップ方式: ①詳細パネルの Share → クリップ生成（約7秒録画）→ ②プレビューの Share ボタン
  // （新しいタップ）で navigator.share。録画はディレクターがカメラを駆動し、レンダーループ末尾で
  // 2D 合成キャンバスへ取り込む（recorder.ts）。navigator.share はモバイルで動画ファイルを共有
  // シートに直接渡す（ダウンロード不要）。
  const shareModal    = document.getElementById("share-modal");
  const shareGenEl    = document.getElementById("share-generating");
  const shareReadyEl  = document.getElementById("share-ready");
  const shareVideo    = document.getElementById("share-video") as HTMLVideoElement | null;
  const shareDoBtn    = document.getElementById("share-do") as HTMLButtonElement | null;
  const shareDownload = document.getElementById("share-download") as HTMLButtonElement | null;
  const shareCloseBtn = document.getElementById("share-close");

  const shareSupported = typeof MediaRecorder !== "undefined"
    && typeof HTMLCanvasElement !== "undefined"
    && "captureStream" in HTMLCanvasElement.prototype;

  // demo（プロモ）や非対応環境では Share ボタンを隠す
  const detailShareBtn = document.getElementById("detail-share");
  if (detailShareBtn && (demo || !shareSupported)) detailShareBtn.style.display = "none";

  let director: ShareClipHandle | null = null;
  let capturing: ClipRecorder | null = null;
  let shareNode: KanjiNode | null = null;
  let shareObjectUrl: string | null = null;
  let finalizing = false;

  function openShareGenerating() {
    if (!shareModal || !shareGenEl || !shareReadyEl) return;
    shareGenEl.style.display = "block";
    shareReadyEl.style.display = "none";
    shareModal.style.display = "flex";
    shareModal.classList.remove("hidden");
  }

  function closeShareModal() {
    if (shareVideo) { shareVideo.pause(); shareVideo.removeAttribute("src"); shareVideo.load(); }
    if (shareObjectUrl) { URL.revokeObjectURL(shareObjectUrl); shareObjectUrl = null; }
    if (!shareModal) return;
    const m = shareModal;
    m.classList.add("hidden");
    m.addEventListener("transitionend", () => {
      if (m.classList.contains("hidden")) m.style.display = "none";
    }, { once: true });
  }

  async function runShare(node: KanjiNode) {
    if (!shareSupported || director || capturing) return;
    shareNode = node;
    openShareGenerating();
    const audioTrack = await audio.beginCapture();
    // ディレクター開始と録画開始の間に await を挟まない＝両者の時計を揃える
    director = startShareClip(
      { camera, controls, onDive: () => audio.bump() },
      nodeWorldPos(node),
    );
    const rec = createClipRecorder({
      audioTrack,
      url: `mu-777.github.io/kanji-verse/?k=${node.k}`,
    });
    capturing = rec;
    rec.start();
  }

  function showSharePreview(blob: Blob, ext: string, mimeType: string, node: KanjiNode) {
    if (!shareGenEl || !shareReadyEl) return;
    shareObjectUrl = URL.createObjectURL(blob);
    if (shareVideo) { shareVideo.src = shareObjectUrl; shareVideo.play().catch(() => { /* ignore */ }); }
    shareGenEl.style.display = "none";
    shareReadyEl.style.display = "block";

    const file = new File([blob], `kanji-verse-${node.k}.${ext}`, { type: mimeType || "video/webm" });
    const pageUrl = `https://mu-777.github.io/kanji-verse/?k=${encodeURIComponent(node.k)}`;
    const text = `${node.k} — Kanji-Verse ✨`;
    const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [file] }));

    const downloadFile = () => {
      if (!shareObjectUrl) return;
      const a = document.createElement("a");
      a.href = shareObjectUrl; a.download = file.name; a.click();
    };

    if (shareDoBtn) {
      shareDoBtn.textContent = canShareFiles ? "Share" : "Download + post on X";
      shareDoBtn.onclick = async () => {
        if (canShareFiles) {
          try { await navigator.share({ files: [file], text, url: pageUrl }); }
          catch { /* ユーザーがキャンセル */ }
        } else {
          // デスクトップ等のフォールバック: 保存 + X 投稿画面（動画は手動添付）
          downloadFile();
          window.open(
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`,
            "_blank", "noopener",
          );
        }
      };
    }
    if (shareDownload) shareDownload.onclick = downloadFile;
  }

  async function finalizeShare() {
    if (finalizing || !capturing) return;
    finalizing = true;
    const rec = capturing;
    capturing = null; // これ以降はフレームを取り込まない
    let blob: Blob | null = null;
    try { blob = await rec.stop(); } catch { /* ignore */ }
    audio.endCapture();
    director?.dispose(); // カメラ/コントロールを録画前へ復帰
    director = null;
    finalizing = false;
    if (blob && shareNode) showSharePreview(blob, rec.ext, rec.mimeType, shareNode);
    else closeShareModal();
  }

  shareCloseBtn?.addEventListener("click", closeShareModal);

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

  // demo（プロモ動画）モードでは BGM を自動 ON にする（pref は汚さない）。
  if (demo) audio.setEnabled(true, { persist: false });

  // レンダーループ
  let prev = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt  = (now - prev) / 1000;
    prev = now;
    if (cinematic) cinematic.update(dt);
    else if (director) director.update(dt);
    else updateCamera(dt);
    audio.update(dt, director ? 0 : getSpeed());
    proximityLabel.update(dt);
    composer.render();
    proximityLabel.render(renderer);
    // 録画中は同フレーム内で 2D 合成キャンバスへ取り込む（preserveDrawingBuffer 不要）
    if (capturing) capturing.drawFrame(canvas);
    if (director && director.done && capturing) finalizeShare();
  }
  animate();
}

main();
