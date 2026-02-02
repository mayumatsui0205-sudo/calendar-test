/* =========================
   DOM取得
========================= */
const grid = document.getElementById("calendarGrid");
const label = document.getElementById("monthLabel");
const prev = document.getElementById("prev");
const next = document.getElementById("next");

const popupOverlay = document.getElementById("eventPopup");
const popupTitle = document.getElementById("eventPopupTitle");
const popupList = document.getElementById("eventPopupList");
const popupClose = document.getElementById("eventPopupClose");

/* カレンダーページ判定 */
const isCalendarPage = !!(
  grid && label && prev && next &&
  popupOverlay && popupTitle && popupList && popupClose
);

if (!isCalendarPage) {
  console.warn("Not calendar page, skip calendar logic");
}

/* =========================
   DB → localStorage 同期
========================= */
async function syncEventsFromDB() {
  if (!window.supabaseClient) {
    console.warn("supabaseClient not found, skip DB sync");
    return;
  }



  const { data, error } = await window.supabaseClient
    .from("EventTable")
    .select("title, event_date, category, content")
    .eq("status", "published");

  if (error) {
    console.error("DB sync failed:", error);
    return;
  }

  const events = {};

  data.forEach((row) => {
    const d = new Date(row.event_date);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    if (!events[key]) events[key] = [];

    events[key].push({
      title: row.title,
      time: d.toTimeString().slice(0, 5),
      category: row.category,
      detail: row.content
    });
  });

  localStorage.setItem("events", JSON.stringify(events));
  // console.log("DB synced:", events); // 必要なら有効化
}

async function renderNextEventFromDB() {
  const textEl = document.getElementById("nextEventText");
  const imgEl = document.getElementById("nextEventImage");
  if (!textEl || !imgEl) return; // index以外は何もしない

  // supabaseClient 初期化待ち（最大3秒）
  for (let i = 0; i < 30; i++) {
    if (window.supabaseClient) break;
    await new Promise(r => setTimeout(r, 100));
  }

  if (!window.supabaseClient) {
    textEl.textContent = "DB未接続のため直近イベントを表示できません";
    imgEl.style.display = "none";
    return;
  }

  const supabase = window.supabaseClient;

  // これから先の直近1件（publishedのみ）
  const nowIso = new Date().toISOString();
  let { data, error } = await supabase
    .from("EventTable")
    .select("title, event_date, category, content, image_path")
    .eq("status", "published")
    .gte("event_date", nowIso)
    .order("event_date", { ascending: true })
    .limit(1);

  if (error) {
    console.error("next event fetch failed:", error);
    textEl.textContent = "直近イベントの取得に失敗しました";
    imgEl.style.display = "none";
    return;
  }

  if (!data || data.length === 0) {
    textEl.textContent = "直近イベントはありません";
    imgEl.style.display = "none";
    return;
  }

  const e = data[0];
  const dt = new Date(e.event_date);

  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");

  textEl.textContent = `${yyyy}/${mm}/${dd} ${hh}:${mi}  ${e.title}`;

  // 画像（あれば表示、失敗したら隠す）
  imgEl.onerror = () => { imgEl.style.display = "none"; };

  if (e.image_path) {
    const { data: pub } = supabase.storage.from("event-images").getPublicUrl(e.image_path);
    const url = pub?.publicUrl;

    if (url) {
      imgEl.src = url;
      imgEl.alt = e.title || "";
      imgEl.style.display = "block";
    } else {
      imgEl.style.display = "none";
    }
  } else {
    imgEl.style.display = "none";
  }
}

/* =========================
   メイン処理（カレンダーページのみ）
========================= */
if (isCalendarPage) {
  let current = new Date();
  let events = {};

  function closeEventPopup() {
    popupOverlay.style.display = "none";
  }

  popupClose.onclick = closeEventPopup;
  popupOverlay.onclick = closeEventPopup;

  function sortEventsByTime(list) {
    return [...list].sort((a, b) => {
      const ta = a.time || "99:99";
      const tb = b.time || "99:99";
      return ta.localeCompare(tb);
    });
  }

  function openEventPopup(dateStr, dayEvents) {
    popupTitle.textContent = `${dateStr} のイベント`;
    popupList.innerHTML = "";

    sortEventsByTime(dayEvents).forEach((e, indexInSorted) => {
      // クリック先の idx を「元配列基準」にしたいなら indexOf を維持
      // ※重複タイトル等があると indexOf は最初の一致を返す点は仕様
      const idx = dayEvents.indexOf(e);

      const item = document.createElement("div");
      item.className = "event-list-item";
      item.textContent = `${e.time ? e.time + " " : ""}${e.title}`;
      item.onclick = () => {
        location.href = `eventdetail.html?date=${dateStr}&idx=${idx}`;
      };
      popupList.appendChild(item);
    });

    popupOverlay.style.display = "block";
  }

  function render() {
    events = JSON.parse(localStorage.getItem("events")) || {};
    grid.innerHTML = "";

    const y = current.getFullYear();
    const m = current.getMonth();
    label.textContent = `${y}年 ${m + 1}月`;

    const start = (new Date(y, m, 1).getDay() + 6) % 7;
    const last = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < start; i++) {
      const e = document.createElement("div");
      e.className = "hidden-day";
      grid.appendChild(e);
    }

    for (let d = 1; d <= last; d++) {
      const cell = document.createElement("div");
      cell.className = "date-cell";

      const num = document.createElement("div");
      num.className = "date-num";
      num.textContent = d;
      cell.appendChild(num);

      const key = `${y}-${m + 1}-${d}`;
      const dayEvents = events[key] || [];

      dayEvents.slice(0, 4).forEach((e) => {
        const t = document.createElement("div");
        t.className = "event-title";
        t.textContent = `${e.time ? e.time + " " : ""}${e.title}`;
        cell.appendChild(t);
      });

      cell.onclick = () => {
        if (dayEvents.length === 0) return;
        const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        openEventPopup(ds, dayEvents);
      };

      cell.ondblclick = () => {
        const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        location.href = `calendarevent.html?date=${ds}`;
      };

      grid.appendChild(cell);
    }
  }

  prev.onclick = () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    render();
  };

  next.onclick = () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    render();
  };

  /* =========================
     起動シーケンス（重要）
  ========================= */
  (async () => {
    await syncEventsFromDB();

    try {
      await renderNextEventFromDB();
    } catch (e) {
      console.error("renderNextEventFromDB failed:", e);
    }

    render();
  })();

}
