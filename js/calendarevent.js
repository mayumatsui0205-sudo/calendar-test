// calendarevent.js（DB正 / localStorage廃止版）
document.addEventListener("DOMContentLoaded", () => {

  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error("supabaseClient not found (check supabaseClient.js load order)");
    return;
  }

  // ---- DOM ----
  const titleEl = document.getElementById("title");
  const dateEl = document.getElementById("date");
  const timeEl = document.getElementById("time");
  const endTimeEl = document.getElementById("endTime");
  const detailEl = document.getElementById("detail");
  const imageFileEl = document.getElementById("imageFile");

  const categoryArea = document.getElementById("categoryArea");
  const addCategoryBtn = document.getElementById("addCategoryBtn");

  const modal = document.getElementById("categoryModal");
  const newCategoryEl = document.getElementById("newCategory");
  const createCategoryBtn = document.getElementById("createCategoryBtn");
  const closeCategoryBtn = document.getElementById("closeCategoryBtn");

  const createBtn = document.getElementById("createBtn");
  const newCategoryColorEl = document.getElementById("newCategoryColor");

  // ---- state ----
  let selectedCategory = "";
  const initialCategories = [
    { name: "勉強会", color: "#4fc3f7" },
    { name: "ほっと一息", color: "#81c784" },
  ];


  // URLの ?date=YYYY-MM-DD を date input に反映
  const params = new URLSearchParams(location.search);
  const dateParam = params.get("date");
  if (dateParam && dateEl) dateEl.value = dateParam;

  (async () => {
    // 初期タグをDBに保証（同名は上書き）
    await supabase
      .from("CategoryTable")
      .upsert(initialCategories, { onConflict: "name" });

    // DBから必ず描画
    const cats = await loadCategories();
    renderCategoryTags(cats);
  })();


  function renderCategoryTags(categories) {
    categoryArea.innerHTML = "";

    for (const c of categories) {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "category-tag";
      tag.textContent = c.name;
      tag.style.setProperty("--tag-color", c.color);

      tag.addEventListener("click", () => toggleCategory(c.name, tag));
      categoryArea.appendChild(tag);
    }

    // 末尾に「+ タグ追加」
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-category";
    addBtn.textContent = "+ タグ追加";
    addBtn.addEventListener("click", openModal);
    categoryArea.appendChild(addBtn);
  }

  function toggleCategory(cat, tagEl) {
    const isActive = tagEl.classList.contains("active");

    // いったん全部解除
    const all = categoryArea.querySelectorAll(".category-tag");
    all.forEach((n) => n.classList.remove("active"));
    selectedCategory = "";

    // すでに選択中だった場合 → 解除して終了
    if (isActive) {
      return;
    }

    // 未選択だった場合 → 新たに選択
    selectedCategory = cat;
    tagEl.classList.add("active");
  }


  // ---- Modal ----
  function openModal() {
    modal.classList.add("open");
    modal.style.display = "flex";
    newCategoryEl.value = "";
    newCategoryEl.focus();
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.style.display = "none";
  }

  closeCategoryBtn?.addEventListener("click", closeModal);

  // 背景クリックで閉じる
  modal?.addEventListener("click", (ev) => {
    if (ev.target === modal) closeModal();
  });

  // カテゴリ追加
  createCategoryBtn?.addEventListener("click", async () => {
    const name = (newCategoryEl?.value || "").trim();
    const color = (newCategoryColorEl?.value || "#4fc3f7").trim();

    if (!name) return;

    const { error } = await supabase
      .from("CategoryTable")
      .upsert({ name, color }, { onConflict: "name" });

    if (error) {
      console.error(error);
      alert("カテゴリ追加に失敗しました（同名が既にある可能性があります）");
      return;
    }

    // 既存タグを消さずに1件だけ追加（同名は上書き扱い：色更新）
    let existingBtn = Array.from(categoryArea.querySelectorAll(".category-tag"))
      .find(b => b.textContent === name);

    if (!existingBtn) {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "category-tag";
      tag.textContent = name;
      tag.style.setProperty("--tag-color", color);
      tag.addEventListener("click", () => toggleCategory(name, tag));

      // 末尾の「+ タグ追加」ボタンの直前に挿入
      const addBtn = Array.from(categoryArea.querySelectorAll(".add-category")).at(-1);
      if (addBtn) categoryArea.insertBefore(tag, addBtn);
      else categoryArea.appendChild(tag);

      existingBtn = tag;
    } else {
      // 同名なら色だけ更新（upsertの結果をUIにも反映）
      existingBtn.style.setProperty("--tag-color", color);
    }

    // 追加（または更新）したカテゴリを選択状態に
    toggleCategory(name, existingBtn);

    closeModal();
  });

  //DBからカテゴリ一覧を読む
  async function loadCategories() {
    const { data, error } = await supabase
      .from("CategoryTable")
      .select("name, color")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("loadCategories failed:", error);
      return [];
    }
    return data || [];
  }

  // ---- Create Event ----
  createBtn?.addEventListener("click", async () => {
    try {
      createBtn.disabled = true;

      const title = (titleEl?.value || "").trim();
      const date = (dateEl?.value || "").trim(); // YYYY-MM-DD
      const time = (timeEl?.value || "").trim(); // HH:MM
      const detail = (detailEl?.value || "").trim();

      if (!title) return alert("イベント名を入力してください");
      if (!date) return alert("日付を選択してください");
      if (!time) return alert("時刻を入力してください");
      if (!selectedCategory) return alert("タグを選択してください");

      // timestamptz に入れる（ローカル時刻をISO化）
      const eventDateIso = new Date(`${date}T${time}:00`).toISOString();

      const endTime = (endTimeEl?.value || "").trim();
      if (!endTime) return alert("終了時間を入力してください");
      const endDateIso = new Date(`${date}T${endTime}:00`).toISOString();

      // 終了が開始より前は弾く
      if (new Date(endDateIso) <= new Date(eventDateIso)) {
        return alert("終了時間は開始時間より後にしてください");
      }


      // 画像アップロード（任意）
      let imagePath = null;
      const file = imageFileEl?.files?.[0] || null;

      if (file) {
        // パス：events/<uuid>-<filename>
        const safeName = file.name.replace(/[^\w.\-()]+/g, "_");
        const uuid = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
        imagePath = `events/${uuid}-${safeName}`;

        const up = await supabase.storage
          .from("event-images")
          .upload(imagePath, file, { upsert: false, contentType: file.type });

        if (up.error) {
          console.error(up.error);
          alert("画像アップロードに失敗しました");
          return;
        }
      }

      // DB INSERT
      const ins = await supabase.from("EventTable").insert({
        title,
        event_date: eventDateIso,
        end_date: endDateIso,
        category: selectedCategory,
        content: detail,
        status: "published",
        image_path: imagePath,
      });

      if (ins.error) {
        console.error(ins.error);
        alert("イベント登録に失敗しました（DB）");
        return;
      }

      // 完了 → トップへ
      location.href = "index.html#calendar";
    } finally {
      createBtn.disabled = false;
    }
  });
});
