# 🌲 林業GPX-GIS解析・離隔距離計測・ヒヤリハット報告システム
### Forestry GPX-GIS Safety & Production Analysis System

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-green.svg)](https://leafletjs.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.4.0-orange.svg)](https://www.chartjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

林業現場における作業員や高性能林業機械（プロセッサ・フォワーダ等）のGNSSログ動態解析、危険接近（離隔距離）アラート検知、StanForD 2010（`.hpr`）ハーベスタ伐倒データのGeoJSON変換、ヒヤリハット報告の現場プロット＆出力、およびPDF報告書作成をブラウザ上で完結して行えるオールインワンGIS解析システムです。

---

## 🌟 主な機能

### 1. 🗺️ マルチフォーマットGIS現場地図表示 (Leaflet / 国土地理院タイル)
- **国土地理院地図連携**: 標準地図、写真（航空写真）、陰影起伏図、OpenStreetMap のリアルタイム切替に対応。
- **ドラッグ＆ドロップ対応**: 各種ファイルをブラウザ画面にドロップするだけで即座に読み込み・重畳描画。
- **対応フォーマット**:
  - **GPX** (`.gpx`): 作業員・重機の測位ログ軌跡
  - **林班ポリゴン** (`.geojson`, `.kml`): 施業区域・小班界線
  - **ドローン空撮オルソ / 標高DEM** (`.tif`, `.tiff`): GeoTIFF / Cloud-Optimized GeoTIFF (COGS)
  - **現場メディア** (`.jpg`, `.jpeg`, `.mp4`): Exif位置情報付き写真、360度パノラマビューア（Pannellum）、動画
  - **ハーベスタ伐倒データ** (`.hpr`): StanForD 2010 XML規格

### 2. 🌲 StanForD 2010 (`.hpr`) 伐倒立木データのGeoJSON自動変換
- 林業機械（ハーベスタ等）の国際規格 `StanForD 2010` (`.hpr`) ファイルをクライアントサイドで高速解析。
- **自動抽出・構造化属性**:
  - **樹種情報**: スギ、ヒノキ、アカマツ、トウヒ、シラカバ等を自動判定し樹種別カラーで描画
  - **寸法・材積**: 胸高直径 (DBH)、単木総材積（皮付き・皮なし）
  - **玉切り丸太内訳**: 丸太本数、規格（用材/パルプ）、採材長、末口径、丸太材積のテーブル化
  - **機械・現場情報**: ハーベスタ機械型式、ヘッド型式、現場名、伐倒日時
- **GeoJSONエクスポート**: 変換した伐倒単木データをワンクリックで標準GeoJSON形式としてダウンロード可能。

### 3. ⏱️ 移動動態・1時間区間統計 & 標高プロファイル
- 総水平移動距離、平均移動速度、累積上昇/下降量、最低/最高標高をKPIカードで表示。
- **1時間ごとの区間集計**: 1時間あたりの移動距離、平均分速、垂直昇降量、測位点数を表および棒グラフで可視化。
- **時系列連続標高プロファイル**: 高低差の変化をエリアチャートで直感的に把握。

### 4. ⚠️ 2地点間離隔距離計測 & 接近アラート解析
- 同時刻における2つのGNSSログ（例: チェンソー伐倒作業員 ⇔ 集材重機）の距離を時系列で精密補間・計算。
- **最小離隔距離・平均距離** の算出と、指定した危険閾値（例: 20m未満）を下回った接近ポイントの自動抽出。
- 標高プロファイルと離隔距離グラフを連動させた複合チャート表示。

### 5. 🔲 10mリスク分布メッシュ（危険エリア抽出）
- 危険接近（アラート）が発生した地点を基に、林班ポリゴン内に **10m解像度のリスクメッシュ** を自動生成。
- 危険検知セルのみをピンポイントでハイライト（安全エリアは非表示にして背景地図の視認性を確保）。
- 接近密度に応じた10段階の危険度グラデーション表示。

### 6. ⚠️ ヒヤリハット報告 & GeoJSON一括出力
- 地図上の **フローティング警告ボタン（⚠️ !）** をクリックし、発生地点をクリックするだけでピンを設置。
- 現場入力に適した **5つの重要項目（選択式中心）**:
  1. 発生日時
  2. 作業種別・要因（伐倒・集材・重機接触・斜面滑落・落石・害虫・熱中症等）
  3. 関与対象（作業員同士、重機×作業員、単独作業等）
  4. 危険度（🟡軽微 Lv.1 / 🟠中度 Lv.2 / 🔴重大 Lv.3）
  5. 状況・要因・対策メモ
- 危険度別SVGハザードマーカー表示、サイドバーでの一覧管理、**GeoJSON一括ダウンロード** に対応。

### 7. 📑 印刷・PDF保存対応 総合解析報告書出力
- 「📑 レポート出力」ボタンで、A4印刷に最適化された総合解析レポートを生成。
- 地図キャプチャ、凡例、移動統計KPI、区間統計表、各種グラフ、接近解析、**ヒヤリハット集計KPI＆一覧テーブル**、現地写真を網羅。

---

## 📁 ディレクトリ構成

```text
forestry-gps-gis/
├── leaflet_app/                 # 【メイン】ブラウザ単体で動作するLeaflet Webアプリ
│   ├── index.html               # メインUI画面
│   ├── css/
│   │   └── style.css            # アプリケーションスタイルシート
│   ├── js/
│   │   ├── app.js               # アプリケーション全体制御・PDFレポート生成
│   │   ├── hpr_parser.js        # StanForD 2010 (.hpr) XML解析・GeoJSON変換
│   │   ├── near_miss_manager.js # ヒヤリハット報告・ピン配置・GeoJSON出力
│   │   ├── gpx_parser.js        # GPXパーサー
│   │   ├── distance.js          # 離隔距離計算・10mリスクメッシュ生成
│   │   ├── stats.js             # 移動・標高統計解析
│   │   ├── charts.js            # Chart.js グラフ描画制御
│   │   ├── gis_layer_loader.js  # GeoJSON / KML / GeoTIFF / HPR レイヤ管理
│   │   └── media_loader.js      # Exif位置情報付き写真 / 360度パノラマ制御
│   └── sample_sugi_10trees.hpr  # スギ10本 HPRサンプルデータ
├── sample_data/                 # 検証用サンプルデータセット
│   ├── worker_01_tanaka.gpx     # 作業員A GPXログ
│   ├── worker_02_suzuki.gpx     # 作業員B GPXログ
│   ├── machine_01_processor.gpx # プロセッサ重機 GPXログ
│   ├── machine_02_forwarder.gpx # フォワーダ重機 GPXログ
│   ├── sample_sugi_10trees.hpr  # 第102林班内スギ立木 HPRデータ
│   └── generate_samples.py      # サンプルデータ生成スクリプト
├── core/                        # Pythonバックエンド解析モジュール
│   ├── gpx_parser.py            # Python版 GPXパーサー
│   ├── interpolator.py          # 時系列GNSS座標補間エンジン
│   ├── spatial_engine.py        # 測地線距離計算 (WGS84 / 平面直角座標系)
│   └── risk_analyzer.py         # 危険接近・リスクメッシュ集計
├── ui/                          # Streamlit UIコンポーネント
├── tests/                       # 単体テスト (pytest)
│   └── test_core.py
├── app.py                       # Python / Streamlit版 ダッシュボードアプリ
├── requirements.txt             # Python依存パッケージ定義
└── README.md                    # 本ドキュメント
```

---

## 🚀 クイックスタート

### 方法 1: ブラウザ版（推奨・インストール不要）

サーバーのセットアップやPython環境の構築は不要です。

1. 本リポジトリをクローンまたはダウンロードします。
2. `leaflet_app/index.html` をお好みのWebブラウザ（Google Chrome, Microsoft Edge, Safari等）で直接開きます。
3. 画面左上の **「🌲 サンプルデータ読込」** ボタンをクリックすると、GPX軌跡、林班ポリゴン、ドローンオルソ画像、HPRスギ立木、ヒヤリハット事例が自動的に読み込まれます。

---

### 方法 2: Python / Streamlit版

Python環境でデータ解析やダッシュボードを実行する場合:

```bash
# 1. 依存ライブラリのインストール
pip install -r requirements.txt

# 2. テストの実行
python -m pytest tests

# 3. Streamlitアプリの起動
streamlit run app.py
```

---

## 📊 対応データフォーマット仕様

| 拡張子 | フォーマット名 | 用途・表示内容 |
| :--- | :--- | :--- |
| `.gpx` | GPS Exchange Format | 作業員・重機の移動軌跡、速度・標高プロファイル、離隔距離計算 |
| `.hpr` | StanForD 2010 (XML) | ハーベスタ伐倒単木（樹種、胸高直径、材積、玉切り丸太仕様） |
| `.geojson` | GeoJSON (RFC 7946) | 林班小班ポリゴン、作業道ライン、伐倒立木ポイント、ヒヤリハット |
| `.kml` | Keyhole Markup Language | 森林簿ポリゴン、予定施業区域、測量境界線 |
| `.tif` / `.tiff` | GeoTIFF / Cloud-Optimized | ドローン空撮高解像度オルソ画像、数値標高モデル (DEM) |
| `.jpg` / `.jpeg` | Exif GPS写真 / 360°パノラマ | 現地状況写真（Exif位置情報自動抽出）、Pannellum 360度パノラマ |

---

## 🧪 テストの実行

Pythonのコア解析ロジック（GPXパース、座標補間、離隔距離計算）の検証テストが含まれています。

```bash
python -m pytest tests -v
```

---

## 📄 ライセンス

本プロジェクトは [MIT License](LICENSE) の下で公開されています。商用・非商用問わず自由にご利用・改変いただけます。
