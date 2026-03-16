import type { KanjiNode, FilterState } from "./types";
import { toRomaji } from "./romanize";

export interface UIRenderer {
  search(kanji: string): boolean;
  clearSearch(): void;
  setFilter(filter: FilterState): void;
  onSelect: (node: KanjiNode | null) => void;
}

export function setupUI(renderer: UIRenderer): void {
  // ── 詳細パネル ──
  const panel = document.getElementById("detail-panel")!;
  const panelKanji = document.getElementById("detail-kanji")!;
  const panelType = document.getElementById("detail-type")!;
  const panelOn = document.getElementById("detail-on")!;
  const panelKun = document.getElementById("detail-kun")!;
  const panelMeanings = document.getElementById("detail-meanings")!;
  const panelClose = document.getElementById("detail-close")!;

  renderer.onSelect = (node: KanjiNode | null) => {
    if (!node) { panel.classList.remove("visible"); return; }
    const fmt = (readings: string[]) =>
      readings.length
        ? readings.map((r) => `${r} (${toRomaji(r)})`).join(" · ")
        : "—";
    panelKanji.textContent = node.k;
    panelType.textContent = node.t === 0 ? "Jōyō Kanji" : "Jinmei Kanji";
    panelOn.textContent = fmt(node.on);
    panelKun.textContent = fmt(node.kun);
    panelMeanings.textContent = node.m.join(", ");
    panel.classList.add("visible");
  };

  panelClose.addEventListener("click", () => {
    panel.classList.remove("visible");
    renderer.onSelect(null);
  });

  // ── 検索 ──
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    const val = searchInput.value.trim();
    if (!val) { renderer.clearSearch(); return; }
    renderer.search(val);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      renderer.clearSearch();
      searchInput.blur();
    }
  });

  // ── フィルタ ──
  const filterState: FilterState = { joyo: true, jinmei: true };
  document.querySelectorAll<HTMLButtonElement>(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type as "joyo" | "jinmei";
      filterState[type] = !filterState[type];
      btn.classList.toggle("active", filterState[type]);
      btn.classList.toggle("inactive", !filterState[type]);
      renderer.setFilter({ ...filterState });
    });
  });
}
