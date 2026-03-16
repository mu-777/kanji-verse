"""
kanji-verse データ生成スクリプト

KanjiDic2 から常用漢字・人名用漢字の意味を取得し、
SentenceTransformer でEmbeddingを計算、UMAPで座標化して
public/data/kanji-2d.json / kanji-3d.json を生成する。

実行方法:
  cd scripts
  uv sync
  uv run python generate_data.py           # 2D + 3D 両方生成（デフォルト）
  uv run python generate_data.py --dim 2   # 2D のみ
  uv run python generate_data.py --dim 3   # 3D のみ
  uv run python generate_data.py --dim both  # 両方（デフォルトと同じ）
"""

import argparse
import gzip
import json
import os
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
import umap
from sklearn.cluster import KMeans
from sentence_transformers import SentenceTransformer

KANJIDIC2_URL = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz"

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
KANJIDIC2_CACHE = os.path.join(_HERE, "kanjidic2.xml.gz")
OUTPUT_DIR = os.path.join(_ROOT, "public", "data")

# KanjiDic2 の grade 値
# 1-6: 教育漢字（常用漢字に含まれる）
# 8: 残りの常用漢字
# 9: 人名用漢字
JOYO_GRADES = {1, 2, 3, 4, 5, 6, 8}
JINMEI_GRADES = {9}

N_CLUSTERS = 20


def download_kanjidic2():
    if os.path.exists(KANJIDIC2_CACHE):
        print(f"キャッシュ使用: {KANJIDIC2_CACHE}")
        return
    print("KanjiDic2 をダウンロード中...")
    urllib.request.urlretrieve(KANJIDIC2_URL, KANJIDIC2_CACHE)
    print("ダウンロード完了")


def parse_kanjidic2():
    print("KanjiDic2 をパース中...")
    with gzip.open(KANJIDIC2_CACHE, "rb") as f:
        tree = ET.parse(f)
    root = tree.getroot()

    entries = []
    for char in root.findall("character"):
        literal = char.findtext("literal")

        grade_text = char.findtext("misc/grade")
        if grade_text is None:
            continue
        grade = int(grade_text)

        if grade in JOYO_GRADES:
            kanji_type = "joyo"
        elif grade in JINMEI_GRADES:
            kanji_type = "jinmei"
        else:
            continue

        meanings, on_readings, kun_readings = [], [], []
        for rm_group in char.findall("reading_meaning/rmgroup"):
            for m in rm_group.findall("meaning"):
                if m.get("m_lang") is None:
                    meanings.append(m.text)
            for r in rm_group.findall("reading"):
                r_type = r.get("r_type")
                if r_type == "ja_on":
                    on_readings.append(r.text)
                elif r_type == "ja_kun":
                    kun_readings.append(r.text)

        if not meanings:
            continue

        entries.append({
            "kanji": literal,
            "meanings": meanings,
            "on": on_readings,
            "kun": kun_readings,
            "type": kanji_type,
        })

    print(f"  常用漢字: {sum(1 for e in entries if e['type'] == 'joyo')} 字")
    print(f"  人名用漢字: {sum(1 for e in entries if e['type'] == 'jinmei')} 字")
    print(f"  合計: {len(entries)} 字")
    return entries


def compute_embeddings(entries):
    print("Embedding モデルをロード中 (all-mpnet-base-v2)...")
    model = SentenceTransformer("all-mpnet-base-v2")
    texts = [" ".join(e["meanings"]) for e in entries]
    print(f"Embedding を計算中 ({len(texts)} 字)...")
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=64)
    print(f"Embedding shape: {embeddings.shape}")
    return embeddings


def compute_umap(embeddings, n_components: int):
    print(f"UMAP で{n_components}D座標を計算中...")
    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=20,
        min_dist=0.3,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(embeddings)

    # [0, 1] に正規化
    coords -= coords.min(axis=0)
    coords /= coords.max(axis=0)
    print(f"UMAP {n_components}D 完了")
    return coords


def compute_clusters(coords_3d):
    """UMAP 3D 座標上で K-means クラスタリングを実行し cluster_id を返す。
    3D 空間でクラスタリングすることで、意味的に近い漢字のグループが色として現れる。"""
    print(f"K-means クラスタリング中 (k={N_CLUSTERS})...")
    km = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init="auto")
    labels = km.fit_predict(coords_3d)
    print("クラスタリング完了")
    return labels


def save_json(entries, coords, cluster_ids, path, n_components: int):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    output = []
    for i, entry in enumerate(entries):
        node = {
            "k": entry["kanji"],
            "m": entry["meanings"],
            "on": entry["on"],
            "kun": entry["kun"],
            "x": round(float(coords[i][0]), 4),
            "y": round(float(coords[i][1]), 4),
            "t": 0 if entry["type"] == "joyo" else 1,
            "c": int(cluster_ids[i]),
        }
        if n_components == 3:
            node["z"] = round(float(coords[i][2]), 4)
        output.append(node)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(path) / 1024
    print(f"保存完了: {path} ({size_kb:.1f} KB, {len(output)} 字)")


def main():
    parser = argparse.ArgumentParser(description="kanji-verse データ生成")
    parser.add_argument(
        "--dim",
        choices=["2", "3", "both"],
        default="both",
        help="出力する座標の次元数 (デフォルト: both)",
    )
    args = parser.parse_args()
    need_2d = args.dim in ("2", "both")
    need_3d = args.dim in ("3", "both")

    download_kanjidic2()
    entries = parse_kanjidic2()
    embeddings = compute_embeddings(entries)

    # 3D UMAP は常に計算（クラスタリングに使用）
    coords_3d = compute_umap(embeddings, n_components=3)
    cluster_ids = compute_clusters(coords_3d)

    if need_3d:
        path_3d = os.path.join(OUTPUT_DIR, "kanji-3d.json")
        save_json(entries, coords_3d, cluster_ids, path_3d, n_components=3)

    if need_2d:
        coords_2d = compute_umap(embeddings, n_components=2)
        path_2d = os.path.join(OUTPUT_DIR, "kanji-2d.json")
        save_json(entries, coords_2d, cluster_ids, path_2d, n_components=2)

    print("\n完了。次のコマンドでWebアプリを起動してください:")
    print("  npm run dev")


if __name__ == "__main__":
    main()
