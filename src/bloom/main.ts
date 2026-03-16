import { BloomRenderer } from "./renderer";
import { loadKanji } from "../shared/loader";
import { setupUI } from "../shared/ui";

async function main() {
  const loading = document.getElementById("loading")!;
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;

  let nodes;
  try {
    nodes = await loadKanji("kanji-2d.json");
  } catch (e) {
    loading.innerHTML = `
      <p style="color:#ff6b6b">Failed to load data</p>
      <p style="font-size:12px;opacity:0.6;margin-top:8px">
        Run scripts/generate_data.py to generate public/data/kanji-2d.json
      </p>`;
    return;
  }

  const renderer = new BloomRenderer(canvas);
  renderer.load(nodes);
  loading.style.display = "none";

  setupUI(renderer);
}

main();
