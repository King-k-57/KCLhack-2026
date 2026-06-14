/**
 * 島ガチャ — ゲーム進行スクリプト
 *
 * 担当: Leaflet 地図操作、タイマー、写真切替、API 通信、ラウンド管理
 */

// ============================================================
// 設定
// ============================================================

const API_BASE = "http://localhost:5000/api";

// 難易度別の地図初期設定
const MAP_ZOOM_CONFIG = {
  easy:   { center: [34.0, 133.5], zoom: 8  },  // 県レベル
  normal: { center: [33.0, 131.0], zoom: 7  },  // 地方レベル
  hard:   { center: [31.0, 131.0], zoom: 5  },  // 西日本全体
};

// ============================================================
// 状態管理
// ============================================================

let gameSession = null;     // セッション情報
let currentRound = 0;       // 現在のラウンド (0-indexed)
let totalScore = 0;         // 合計スコア
let roundResults = [];      // 各ラウンドの結果を保存

// 地図関連
let map = null;
let guessMarker = null;
let correctMarker = null;
let distanceLine = null;

// タイマー関連
let timerInterval = null;
let roundStartTime = null;

// 写真関連
let currentPhotoIndex = 0;

// ヒント関連
let revealedHints = 0;

// ============================================================
// 初期化
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  // セッション情報を取得
  const stored = sessionStorage.getItem("gameSession");
  if (!stored) {
    alert("セッション情報がありません。トップに戻ります。");
    window.location.href = "index.html";
    return;
  }

  gameSession = JSON.parse(stored);
  initMap();
  showRound();
});


function initMap() {
  const difficulty = gameSession.config.difficulty || "normal";
  const config = MAP_ZOOM_CONFIG[difficulty] || MAP_ZOOM_CONFIG.normal;

  map = L.map("map", {
    center: config.center,
    zoom: config.zoom,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 18,
  }).addTo(map);

  // 地図クリック → ピン設置
  map.on("click", onMapClick);
}


function onMapClick(e) {
  // 結果表示中はクリック無効
  if (document.getElementById("result-overlay").classList.contains("hidden") === false) {
    return;
  }

  const { lat, lng } = e.latlng;

  // 既存のピンを削除
  if (guessMarker) {
    map.removeLayer(guessMarker);
  }

  // 新しいピンを設置
  guessMarker = L.marker([lat, lng], {
    icon: L.icon({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [0, -41],
    }),
  }).addTo(map);

  guessMarker.bindPopup("あなたの回答").openPopup();

  // 回答ボタンを有効化
  document.getElementById("answer-btn").disabled = false;
}


// ============================================================
// ラウンド表示
// ============================================================

function showRound() {
  const island = gameSession.islands[currentRound];
  if (!island) return;

  // ヘッダー更新
  document.getElementById("round-label").textContent = `ラウンド ${currentRound + 1} / 5`;
  document.getElementById("total-score").textContent = `合計: ${totalScore}`;

  // 前のラウンドのマーカーを消す
  clearMapMarkers();

  // 地図ビューをリセット
  const difficulty = gameSession.config.difficulty || "normal";
  const mapConfig = MAP_ZOOM_CONFIG[difficulty] || MAP_ZOOM_CONFIG.normal;

  // easy の場合、出題島の県に近いエリアにズーム
  if (difficulty === "easy" && island.prefecture) {
    // 大まかに地方ごとの中心座標を設定
    const prefectureCenter = getPrefectureCenter(island.prefecture);
    if (prefectureCenter) {
      map.setView(prefectureCenter, 9);
    } else {
      map.setView(mapConfig.center, mapConfig.zoom);
    }
  } else if (difficulty === "normal" && island.region) {
    const regionCenter = getRegionCenter(island.region);
    if (regionCenter) {
      map.setView(regionCenter, 7);
    } else {
      map.setView(mapConfig.center, mapConfig.zoom);
    }
  } else {
    map.setView(mapConfig.center, mapConfig.zoom);
  }

  // 写真を表示
  showPhotos(island);

  // ヒントを表示
  showHints(island);

  // 結果を隠す
  document.getElementById("result-overlay").classList.add("hidden");
  document.getElementById("answer-btn").disabled = true;
  document.getElementById("answer-btn").textContent = "ここだ！";

  // タイマー開始
  startTimer();
}


// ============================================================
// 写真表示
// ============================================================

function showPhotos(island) {
  const photoEl = document.getElementById("island-photo");
  const placeholder = document.getElementById("photo-placeholder");
  const photoNav = document.getElementById("photo-nav");
  const images = island.image_urls || [];

  currentPhotoIndex = 0;

  if (images.length === 0) {
    photoEl.style.display = "none";
    photoNav.style.display = "none";
    placeholder.style.display = "flex";
    placeholder.innerHTML = "<p>📷 この島の写真はありません</p>";
    return;
  }

  placeholder.style.display = "none";
  photoEl.style.display = "block";
  photoEl.src = images[0];
  photoEl.alt = "この島はどこ？";

  // 複数枚の場合ナビゲーション表示
  if (images.length > 1) {
    photoNav.style.display = "flex";
    updatePhotoCounter(images.length);
  } else {
    photoNav.style.display = "none";
  }
}

function changePhoto(direction) {
  const island = gameSession.islands[currentRound];
  const images = island.image_urls || [];
  if (images.length <= 1) return;

  currentPhotoIndex = (currentPhotoIndex + direction + images.length) % images.length;
  document.getElementById("island-photo").src = images[currentPhotoIndex];
  updatePhotoCounter(images.length);
}

function updatePhotoCounter(total) {
  document.getElementById("photo-counter").textContent = `${currentPhotoIndex + 1} / ${total}`;
}


// ============================================================
// ヒント表示
// ============================================================

function showHints(island) {
  const hintList = document.getElementById("hint-list");
  const hintBtn = document.getElementById("hint-btn");
  const hints = island.hints || [];

  revealedHints = 0;
  hintList.innerHTML = "";

  if (hints.length === 0) {
    document.getElementById("hint-area").style.display = "none";
    return;
  }

  document.getElementById("hint-area").style.display = "block";

  // 最初の1つは自動公開
  addHintElement(hints[0], 1);
  revealedHints = 1;

  // 残りがあればボタン表示
  if (hints.length > 1) {
    hintBtn.style.display = "block";
    hintBtn.textContent = "次のヒントを見る";
  } else {
    hintBtn.style.display = "none";
  }
}

function revealHint() {
  const island = gameSession.islands[currentRound];
  const hints = island.hints || [];

  if (revealedHints >= hints.length) return;

  addHintElement(hints[revealedHints], revealedHints + 1);
  revealedHints++;

  if (revealedHints >= hints.length) {
    document.getElementById("hint-btn").style.display = "none";
  }
}

function addHintElement(text, number) {
  const hintList = document.getElementById("hint-list");
  const div = document.createElement("div");
  div.className = "hint-item";
  div.innerHTML = `<span class="hint-number">${number}</span><span class="hint-text">${text}</span>`;
  hintList.appendChild(div);
}


// ============================================================
// タイマー（獲得可能スコア方式）
// ============================================================

function startTimer() {
  roundStartTime = Date.now();
  updatePossibleScore();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updatePossibleScore, 200); // 200ms ごとに更新
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function getElapsedSeconds() {
  if (!roundStartTime) return 0;
  return (Date.now() - roundStartTime) / 1000;
}

function updatePossibleScore() {
  const elapsed = getElapsedSeconds();
  // タイムボーナス: max(0, 30 - (秒数 / 2))
  const timeBonus = Math.max(0, Math.round(30 - elapsed / 2));
  // 距離スコアは最大70点、合計で最大100点
  const possible = 70 + timeBonus;

  const el = document.getElementById("possible-score");
  el.textContent = possible;

  // 色の変化
  if (possible > 80) {
    el.className = "possible-value score-green";
  } else if (possible > 70) {
    el.className = "possible-value score-gold";
  } else {
    el.className = "possible-value score-red";
  }
}


// ============================================================
// 回答送信
// ============================================================

async function submitAnswer() {
  if (!guessMarker) return;

  const elapsed = getElapsedSeconds();
  stopTimer();

  const latlng = guessMarker.getLatLng();
  const island = gameSession.islands[currentRound];
  const answerBtn = document.getElementById("answer-btn");

  answerBtn.disabled = true;
  answerBtn.textContent = "判定中...";

  try {
    const res = await fetch(`${API_BASE}/game/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: gameSession.session_id,
        island_id: island.id,
        guessed_lat: latlng.lat,
        guessed_lng: latlng.lng,
        time_seconds: Math.round(elapsed * 10) / 10,
        round_number: currentRound + 1,
      }),
    });

    if (!res.ok) throw new Error("API error");

    const result = await res.json();
    totalScore = result.session_total;

    // 結果を保存
    roundResults.push({
      round: currentRound + 1,
      island_name: result.correct.name,
      prefecture: result.correct.prefecture,
      distance_km: result.distance_km,
      distance_score: result.distance_score,
      time_bonus: result.time_bonus,
      total_score: result.total_score,
    });

    showRoundResult(result);
    fetchWikiInfo(island.id);

  } catch (err) {
    alert("回答の送信に失敗しました。");
    console.error(err);
    answerBtn.disabled = false;
    answerBtn.textContent = "ここだ！";
    startTimer(); // タイマー再開
  }
}


// ============================================================
// ラウンド結果表示
// ============================================================

function showRoundResult(result) {
  // ヘッダー更新
  document.getElementById("total-score").textContent = `合計: ${totalScore}`;

  // 正解マーカーを表示
  const correctIcon = L.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [0, -41],
  });

  correctMarker = L.marker([result.correct.lat, result.correct.lng], { icon: correctIcon })
    .addTo(map)
    .bindPopup(`正解: ${result.correct.name}`)
    .openPopup();

  // 推測と正解の間に線を引く
  if (guessMarker) {
    const guessLL = guessMarker.getLatLng();
    distanceLine = L.polyline(
      [[guessLL.lat, guessLL.lng], [result.correct.lat, result.correct.lng]],
      { color: "#BA7517", dashArray: "8,6", weight: 2 }
    ).addTo(map);

    // 両方のマーカーが見えるようにズーム
    const bounds = L.latLngBounds([
      [guessLL.lat, guessLL.lng],
      [result.correct.lat, result.correct.lng],
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });
  }

  // 結果カード更新
  document.getElementById("result-island-name").textContent = result.correct.name;
  document.getElementById("result-prefecture").textContent =
    `${result.correct.prefecture}（${result.correct.region || ""}）`;
  document.getElementById("result-distance").textContent = `${result.distance_km} km`;
  document.getElementById("result-dist-score").textContent = `${result.distance_score} pt`;
  document.getElementById("result-time-bonus").textContent = `+${result.time_bonus} pt`;
  document.getElementById("result-round-score").textContent = `${result.total_score} pt`;

  // 次のラウンドボタン
  const nextBtn = document.getElementById("next-btn");
  if (currentRound >= 4) {
    nextBtn.textContent = "結果を見る 🏆";
  } else {
    nextBtn.textContent = "次のラウンドへ →";
  }

  // 結果表示
  document.getElementById("result-overlay").classList.remove("hidden");
}


async function fetchWikiInfo(islandId) {
  try {
    const res = await fetch(`${API_BASE}/island/${islandId}/wiki`);
    if (!res.ok) return;
    const data = await res.json();

    const wikiInfo = document.getElementById("wiki-info");
    const wikiExtract = document.getElementById("wiki-extract");
    const wikiLink = document.getElementById("wiki-link");

    if (data.extract) {
      // 概要文を最大150文字に制限
      const text = data.extract.length > 150
        ? data.extract.substring(0, 150) + "..."
        : data.extract;
      wikiExtract.textContent = text;
      wikiLink.href = `https://ja.wikipedia.org/wiki/${encodeURIComponent(data.title)}`;
      wikiInfo.style.display = "block";
    }
  } catch (err) {
    console.error("Wiki info fetch failed:", err);
  }
}


// ============================================================
// 次のラウンド / ゲーム終了
// ============================================================

function nextRound() {
  currentRound++;

  if (currentRound >= 5) {
    // ゲーム終了 → 結果画面へ
    sessionStorage.setItem("gameResult", JSON.stringify({
      session_id: gameSession.session_id,
      user_name: gameSession.config?.user_name || "名無し",
      difficulty: gameSession.config.difficulty,
      total_score: totalScore,
      rounds: roundResults,
    }));
    window.location.href = "result.html";
    return;
  }

  showRound();
}


// ============================================================
// ヘルパー
// ============================================================

function clearMapMarkers() {
  if (guessMarker) { map.removeLayer(guessMarker); guessMarker = null; }
  if (correctMarker) { map.removeLayer(correctMarker); correctMarker = null; }
  if (distanceLine) { map.removeLayer(distanceLine); distanceLine = null; }
}

/**
 * 県名から大まかな中心座標を返す（easy モード用）
 */
function getPrefectureCenter(prefecture) {
  const centers = {
    "香川県": [34.34, 134.05],
    "岡山県": [34.66, 133.93],
    "広島県": [34.40, 132.46],
    "愛媛県": [33.84, 132.77],
    "山口県": [34.18, 131.47],
    "兵庫県": [34.69, 135.18],
    "長崎県": [32.75, 129.87],
    "鹿児島県": [31.56, 130.56],
    "熊本県": [32.79, 130.74],
    "福岡県": [33.59, 130.40],
    "大分県": [33.24, 131.61],
    "沖縄県": [26.34, 127.80],
  };
  return centers[prefecture] || null;
}

/**
 * 地域名から中心座標を返す（normal モード用）
 */
function getRegionCenter(region) {
  const centers = {
    "瀬戸内海": [34.20, 133.00],
    "九州":     [32.50, 130.70],
    "沖縄":     [26.50, 128.00],
  };
  return centers[region] || null;
}
