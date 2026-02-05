// script.js（index.html カレンダー用：DB正・複数タグドット）
// ✅ Sunday start / weekend dataset / holiday (year-based JSON) with cache

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("monthLabel");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");

  const popupOverlay = document.getElementById("eventPopup");
  const popupTitle = document.getElementById("eventPopupTitle");
  const popupList = document.getElementById("eventPopupList");
  const popupClose = document.getElementById("eventPopupClose");

  // index.html 以外では何もしない（null参照防止）
  const isCalendarPage = !!(
    grid && label && prev && next &&
    popupOverlay && popupTitle && popupList && popupClose
  );
  if (!isCalendarPage) return;

  /* =========================
     State
  ========================= */
  let current = new Date();
  current = new Date(current.getFullYear(), current.getMonth(), 1);

  let eventsByDate = {};       // "YYYY-M-D" -> [{id,title,time,category}]
  let categoryColorMap = {};   // name -> color

  // Holiday state (year based)
  let holidaySet = new Set();         // current year holidays (YYYY-MM-DD)
  const holidayCache = new Map();     // year -> Set
  let loadedHolidayYear = null;

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (y, mIndex, d) => `${y}-${pad2(mIndex + 1)}-${pad2(d)}`;

  function dateKeyFromDate(dt) {
    return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
  }

  function hhmmFromDate(dt) {
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }

  async function waitForSupabaseClient(maxMs = 3000) {
    const step = 100;
    for (let t = 0; t < maxMs; t += step) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise((r) => setTimeout(r, step));
    }
    return null;
  }

  /* =========================
     Holidays: year JSON loader
     - expects: /holidays/2026.json
     - content: ["2026-01-01", "2026-01-12", ...]
  ========================= */
  async function loadHolidaySetForYear(year) {
    // cache hit
    if (holidayCache.has(year)) return holidayCache.get(year);

    try {
      const res = await fetch(`holidays/${year}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`holiday json not found: ${year} (status ${res.status})`);

      const arr = await res.json();

      // minimal validation
      const set = new Set(
        (Array.isArray(arr) ? arr : [])
          .filter((s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s))
      );

      holidayCache.set(year, set);
      return set;
    } catch (e) {
      // if not found / invalid: treat as no holidays, but do not break calendar
      console.warn("loadHolidaySetForYear failed:", e);
      const empty = new Set();
      holidayCache.set(year, empty);
      return empty;
    }
  }

  /* =========================
     複数タグ → 配列
  ========================= */
  function categoriesFromString(categoryStr) {
    return (categoryStr || "")
      .split(/[,\u3001]/) // , と 、 の両対応
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function buildTagDots(categoryStr) {
    const cats = categoriesFromString(categoryStr);

    const wrap = document.createElement("span");
    wrap.className = "tag-dots";

    const MAX = 3;

    // ドット（最大3）
    cats.slice(0, MAX).forEach((name) => {
      const color = categoryColorMap[name];
      if (!color) return;

      const dot = document.createElement("span");
      dot.className = "tag-dot";
      dot.style.setProperty("--dot-color", color);
      dot.title = name;
      wrap.appendChild(dot);
    });

    // 残りがあれば +N
    const rest = cats.length - MAX;
    if (rest > 0) {
      const more = document.createElement("span");
      more.className = "tag-more";
      more.textContent = `+${rest}`;
      more.title = cats.slice(MAX).join(", ");
      wrap.appendChild(more);
    }

    return wrap;
  }

  /* =========================
     Popup
  ========================= */
  function closeEventPopup() {
    popupOverlay.style.display = "none";
  }

  popupClose.addEventListener("click", closeEventPopup);
  popupOverlay.addEventListener("click", closeEventPopup);

  function openEventPopup(dateStr, dayEvents) {
    popupTitle.textContent = `${dateStr} のイベント`;
    popupList.innerHTML = "";

    const sorted = [...dayEvents].sort((a, b) =>
      (a.time || "").localeCompare(b.time || "")
    );

    sorted.forEach((ev) => {
      const item = document.createElement("div");
      item.className = "event-list-item";

      const text = document.createElement("span");
      text.className = "event-text";
      text.textContent = `${ev.time ? ev.time + " " : ""}${ev.title}`;
      item.appendChild(text);

      item.appendChild(buildTagDots(ev.category));

      item.onclick = (e) => {
        e.stopPropagation();
        location.href = `eventdetail.html?id=${ev.id}`;
      };

      popupList.appendChild(item);
    });

    popupOverlay.style.display = "block";
  }

  /* =========================
     DB: Category colors
  ========================= */
  async function loadCategoryColors(supabase) {
    categoryColorMap = {};

    const { data, error } = await supabase
      .from("CategoryTable")
      .select("name, color");

    if (error) {
      console.error("loadCategoryColors failed:", error);
      return;
    }

    (data || []).forEach((c) => {
      if (c?.name && c?.color) categoryColorMap[c.name] = c.color;
    });
  }

  /* =========================
     DB: Events for month
  ========================= */
  async function loadMonthEvents(supabase) {
    const y = current.getFullYear();
    const m = current.getMonth();

    const startIso = new Date(y, m, 1).toISOString();
    const endIso = new Date(y, m + 1, 1).toISOString();

    const { data, error } = await supabase
      .from("EventTable")
      .select("id, title, event_date, category, status")
      .eq("status", "published")
      .gte("event_date", startIso)
      .lt("event_date", endIso)
      .order("event_date", { ascending: true });

    if (error) {
      console.error("loadMonthEvents failed:", error);
      eventsByDate = {};
      return;
    }

    const map = {};
    (data || []).forEach((row) => {
      const dt = new Date(row.event_date);
      const key = dateKeyFromDate(dt);
      if (!map[key]) map[key] = [];
      map[key].push({
        id: row.id,
        title: row.title || "",
        category: row.category || "",
        time: hhmmFromDate(dt),
      });
    });

    eventsByDate = map;
  }

  async function renderNextEventFromDB(supabase) {
    const textEl = document.getElementById("nextEventText");
    const imgEl = document.getElementById("nextEventImage");
    if (!textEl) return;

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("EventTable")
      .select("id, title, event_date, category, image_path, status")
      .eq("status", "published")
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .limit(1);

    if (error) {
      console.error("renderNextEventFromDB failed:", error);
      textEl.textContent = "直近イベントの取得に失敗しました";
      if (imgEl) imgEl.style.display = "none";
      return;
    }

    if (!data || data.length === 0) {
      textEl.textContent = "直近のイベントはありません";
      if (imgEl) imgEl.style.display = "none";
      return;
    }

    const e = data[0];
    const dt = new Date(e.event_date);
    const timeStr = `${pad2(dt.getMonth() + 1)}/${pad2(dt.getDate())} ${hhmmFromDate(dt)}`;
    textEl.textContent = `${timeStr} ${e.title}`;

    if (!imgEl) return;
    if (!e.image_path) {
      imgEl.style.display = "none";
      return;
    }

    const { data: pub } = supabase.storage.from("event-images").getPublicUrl(e.image_path);
    if (pub?.publicUrl) {
      imgEl.src = pub.publicUrl;
      imgEl.style.display = "block";
    } else {
      imgEl.style.display = "none";
    }
  }

  /* =========================
     Calendar render
  ========================= */
  function renderCalendar() {
    grid.innerHTML = "";

    const y = current.getFullYear();
    const m = current.getMonth();
    label.textContent = `${y}年 ${m + 1}月`;

    // Sunday start（0=日）
    const start = new Date(y, m, 1).getDay();
    const last = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < start; i++) {
      const blank = document.createElement("div");
      blank.className = "hidden-day";
      grid.appendChild(blank);
    }

    for (let d = 1; d <= last; d++) {
      const cell = document.createElement("div");
      cell.className = "date-cell";

      // weekday data (0=日..6=土)
      const dow = new Date(y, m, d).getDay();
      cell.dataset.dow = dow;

      // holiday class (YYYY-MM-DD)
      const keyYmd = ymd(y, m, d);
      if (holidaySet.has(keyYmd)) cell.classList.add("is-holiday");

      const num = document.createElement("div");
      num.className = "date-num";
      num.textContent = d;
      cell.appendChild(num);

      const key = `${y}-${m + 1}-${d}`;
      const dayEvents = eventsByDate[key] || [];

      dayEvents.slice(0, 4).forEach((ev) => {
        const t = document.createElement("div");
        t.className = "event-title";

        const text = document.createElement("span");
        text.className = "event-text";
        text.textContent = `${ev.time ? ev.time + " " : ""}${ev.title}`;
        t.appendChild(text);

        t.appendChild(buildTagDots(ev.category));
        cell.appendChild(t);
      });

      cell.onclick = () => {
        if (dayEvents.length === 0) return;
        openEventPopup(ymd(y, m, d), dayEvents);
      };

      cell.ondblclick = () => {
        location.href = `calendarevent.html?date=${ymd(y, m, d)}`;
      };

      grid.appendChild(cell);
    }
  }

  /* =========================
     Controls
  ========================= */
  prev.addEventListener("click", async () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    await main();
  });

  next.addEventListener("click", async () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    await main();
  });

  /* =========================
     Main
  ========================= */
  async function main() {
    const supabase = await waitForSupabaseClient(3000);
    if (!supabase) {
      console.error("supabaseClient not found (timeout)");
      return;
    }

    // load holidays for current year (only when year changes)
    const y = current.getFullYear();
    if (loadedHolidayYear !== y) {
      holidaySet = await loadHolidaySetForYear(y);
      loadedHolidayYear = y;
    }

    await loadCategoryColors(supabase);
    await loadMonthEvents(supabase);
    await renderNextEventFromDB(supabase);

    renderCalendar();
  }

  main().catch((e) => console.error(e));
});
