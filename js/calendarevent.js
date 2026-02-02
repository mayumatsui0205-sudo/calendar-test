if (window.__calendarevent_loaded__) {
  console.warn("calendarevent.js loaded twice - skipped");
} else {
  window.__calendarevent_loaded__ = true;

  document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(location.search);
    const presetDate = params.get("date");
    if (!presetDate) return;

    const dateInput = document.getElementById("date");
    if (!dateInput) {
      console.warn('date input (#date) not found');
      return;
    }

    dateInput.value = presetDate;
    console.log("preset date applied:", presetDate);
  });

  let selectedCategory = [];
  // [{ name: "勉強会", color: "#4fc3f7" }]


  function toggleCategory(el) {
    const name = el.textContent;
    const color =
      getComputedStyle(el).getPropertyValue("--tag-color").trim() || "#4fc3f7";

    el.classList.toggle("active");

    if (el.classList.contains("active")) {
      if (!selectedCategory.some(c => c.name === name)) {
        selectedCategory.push({ name, color });
      }
    } else {
      selectedCategory = selectedCategory.filter(c => c.name !== name);
    }
  }


  function openCategoryModal() {
    const modal = document.getElementById("categoryModal");
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
  }

  function closeCategoryModal() {
    document.getElementById("categoryModal").style.display = "none";
  }

  function createCategory(select) {
    const name = document.getElementById("newCategoryName").value.trim();
    const color = document.getElementById("newCategoryColor").value;

    if (!name) return;

    const span = document.createElement("span");
    span.className = "category-tag";
    span.textContent = name;
    span.style.setProperty("--tag-color", color);

    span.onclick = () => toggleCategory(span);

    document.getElementById("categoryArea").insertBefore(
      span,
      document.querySelector(".add-category")
    );

    if (select) toggleCategory(span);

    document.getElementById("newCategoryName").value = "";
    closeCategoryModal();
  }

  function readImageAsDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function save() {
    const title = document.getElementById("title").value;
    const date = document.getElementById("date").value;
    const time = document.getElementById("time").value;
    const detail = document.getElementById("detail").value;

    if (!title || !date) {
      alert("イベント名と日付は必須です");
      return;
    }

    const supabase = window.supabaseClient;
    if (!supabase) {
      alert("DB接続が初期化されていません");
      return;
    }

    // 画像アップロード（あれば）
    const fileInput = document.getElementById("imageFile");
    const file = fileInput?.files?.[0] || null;

    let imagePath = null;
    if (file) {
      try {
        imagePath = await uploadImage(supabase, file);
      } catch (e) {
        console.error("uploadImage error:", e);
        alert(`画像アップロードに失敗しました: ${e?.message || e}`);
        return;
      }
    }

    // questImage 用（トップ表示用）
    if (file) {
      try {
        const imageDataUrl = await readImageAsDataURL(file);
        localStorage.setItem("questImage", imageDataUrl);
      } catch (e) {
        console.warn("quest image save skipped", e);
      }
    }

    const safeTime = time && time.trim() ? time : "00:00";
    const eventDate = `${date}T${safeTime}:00+09:00`;

    const { error } = await supabase
      .from("EventTable")
      .insert({
        title: title,
        event_date: eventDate,
        category: selectedCategory.map(c => c.name).join(","),
        content: detail,
        image_path: imagePath,
        status: "published"
      });

    if (error) {
      console.error(error);
      alert("イベントの保存に失敗しました");
      return;
    }

    // localStorage（即時反映用キャッシュ）
    const key = `${Number(date.split("-")[0])}-${Number(date.split("-")[1])}-${Number(date.split("-")[2])}`;
    const events = JSON.parse(localStorage.getItem("events")) || {};
    events[key] = events[key] || [];
    events[key].push({
      title,
      time,
      category: selectedCategory,
      detail
    });
    localStorage.setItem("events", JSON.stringify(events));

    // 完了通知 → トップへ
    alert("イベントを作成しました");
    location.href = "index.html";
  }


  async function uploadImage(supabase, file) {
    if (!file) return null;

    const fileExt = file.name.split(".").pop();
    const fileName = crypto.randomUUID();
    const filePath = `events/${fileName}.${fileExt}`;

    const { data, error } = await supabase
      .storage
      .from("event-images")
      .upload(filePath, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (error) {
      console.error("storage.upload error:", error);
      throw error;
    }

    return filePath;
  }
}