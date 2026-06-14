/**
 * 島ガチャ — ランキング表示スクリプト
 */

const API_BASE = "http://localhost:5000/api";

// 初期読み込み
window.addEventListener("DOMContentLoaded", () => {
  fetchRanking("");
});


/**
 * 難易度フィルターボタンのクリック処理
 */
function filterRanking(difficulty) {
  // ボタンの active 切替
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === difficulty);
  });

  fetchRanking(difficulty);
}


/**
 * ランキングデータをAPIから取得して表示
 */
async function fetchRanking(difficulty) {
  const list = document.getElementById("ranking-list");
  list.innerHTML = '<p class="loading-text">読み込み中...</p>';

  try {
    const query = difficulty ? `?difficulty=${difficulty}` : "";
    const res = await fetch(`${API_BASE}/ranking${query}`);

    if (!res.ok) throw new Error("API error");

    const data = await res.json();
    showRanking(data);
  } catch (err) {
    console.error("Ranking fetch failed:", err);
    list.innerHTML = '<p class="loading-text">ランキングを取得できませんでした</p>';
  }
}


/**
 * ランキングデータをDOMに描画
 */
function showRanking(entries) {
  const list = document.getElementById("ranking-list");
  list.innerHTML = "";

  if (entries.length === 0) {
    list.innerHTML = '<p class="loading-text">まだランキングデータがありません</p>';
    return;
  }

  const diffLabels = { easy: "かんたん", normal: "ふつう", hard: "むずかしい" };

  entries.forEach((entry, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
    const date = new Date(entry.created_at).toLocaleDateString("ja-JP");
    const diffLabel = diffLabels[entry.difficulty] || entry.difficulty;

    const div = document.createElement("div");
    div.className = `ranking-row ${rank <= 3 ? "ranking-top" : ""}`;
    div.innerHTML = `
      <span class="ranking-rank">${medal || rank}</span>
      <div class="ranking-info">
        <span class="ranking-name">${entry.user_name}</span>
        <span class="ranking-meta">${diffLabel} · ${date}</span>
      </div>
      <span class="ranking-score">${entry.total_score} pt</span>
    `;
    list.appendChild(div);
  });
}
