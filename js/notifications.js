
(function(){
  "use strict";

  const LS_KEY = "autostyle_notifications";
  const READ_KEY = "autostyle_notifications_read_at";
  const COLLECTION = "autostyle_notifications";

  function esc(v){
    return String(v ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function stripHtml(html){
    const div=document.createElement("div");
    div.innerHTML=html||"";
    return div.textContent||div.innerText||"";
  }

  function fmt(v){
    try{
      if(v && typeof v.toDate === "function") v = v.toDate();
      return new Date(v || Date.now()).toLocaleString("ru-RU");
    }catch(e){return "";}
  }

  function safeParse(raw,fallback){
    try{return JSON.parse(raw)||fallback}catch(e){return fallback}
  }

  function localNotifications(){
    return safeParse(localStorage.getItem(LS_KEY), []);
  }

  function saveLocal(n){
    const list = localNotifications();
    const idx = list.findIndex(x => String(x.id) === String(n.id));
    if(idx >= 0) list[idx] = n;
    else list.unshift(n);
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0,100)));
  }

  function sampleIfEmpty(list){
    if(list && list.length) return list;
    return [{
      id:"welcome",
      title:"Добро пожаловать в AutoStyle",
      shortText:"Здесь будут акции, статусы заказов и новости.",
      html:"<b>Добро пожаловать в AutoStyle!</b><br>В этом разделе будут отображаться уведомления магазина.",
      createdAt:new Date().toISOString(),
      buttonText:"Открыть каталог",
      buttonUrl:"catalog.html"
    }];
  }

  async function fetchNotifications(){
    const local = localNotifications();
    const db = window.db || window.firestore || window.firebaseDb;

    try{
      if(db && typeof collection === "function" && typeof getDocs === "function"){
        const snap = await getDocs(collection(db, COLLECTION));
        const list = [];
        snap.forEach(doc => list.push({id:doc.id, ...doc.data()}));
        list.sort((a,b)=> new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        list.forEach(saveLocal);
        return sampleIfEmpty(list);
      }
      if(window.firebase && firebase.firestore){
        const snap = await firebase.firestore().collection(COLLECTION).orderBy("createdAt","desc").get();
        const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
        list.forEach(saveLocal);
        return sampleIfEmpty(list);
      }
    }catch(e){
      console.warn("notifications fetch fallback:", e);
    }
    return sampleIfEmpty(local);
  }

  async function addNotification(data){
    const item = {
      id: "n_" + Date.now(),
      title: data.title || "Уведомление",
      shortText: data.shortText || stripHtml(data.html).slice(0,140),
      html: data.html || "",
      image: data.image || "",
      buttonText: data.buttonText || "",
      buttonUrl: data.buttonUrl || "",
      font: data.font || "",
      createdAt: new Date().toISOString(),
      audience: "all",
      status: "sent"
    };

    const db = window.db || window.firestore || window.firebaseDb;
    try{
      if(db && typeof collection === "function" && typeof addDoc === "function"){
        const ref = await addDoc(collection(db, COLLECTION), item);
        item.id = ref.id;
      }else if(window.firebase && firebase.firestore){
        const ref = await firebase.firestore().collection(COLLECTION).add(item);
        item.id = ref.id;
      }
    }catch(e){
      console.warn("notification remote save skipped:", e);
    }

    saveLocal(item);
    return item;
  }

  function unreadCount(list){
    const readAt = Number(localStorage.getItem(READ_KEY)||0);
    return list.filter(n => new Date(n.createdAt || Date.now()).getTime() > readAt).length;
  }

  function ensureHeaderButton(){
    const header = document.querySelector("header,.header,.site-header,.top-header,.navbar,.main-header");
    if(!header || document.getElementById("asNotifyMenuBtn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "asNotifyMenuBtn";
    btn.className = "as-notify-menu-btn";
    btn.innerHTML = '🔔 Уведомления <span class="as-notify-count" id="asNotifyCount" data-count="0"></span>';

    const account = Array.from(header.querySelectorAll("a,button")).find(el => /аккаунт|профиль/i.test(el.textContent||""));
    if(account && account.parentNode) account.parentNode.insertBefore(btn, account.nextSibling);
    else header.appendChild(btn);

    btn.addEventListener("click", async e=>{
      e.preventDefault();
      const drop = ensureDropdown();
      await renderDropdown(drop);
      drop.classList.toggle("is-open");
      localStorage.setItem(READ_KEY, String(Date.now()));
      updateCount();
    });
  }

  function ensureDropdown(){
    let d = document.getElementById("asNotifyDropdown");
    if(!d){
      d = document.createElement("div");
      d.id = "asNotifyDropdown";
      d.className = "as-notify-dropdown";
      document.body.appendChild(d);
    }
    return d;
  }

  async function renderDropdown(drop){
    const list = await fetchNotifications();
    drop.innerHTML = '<h3>Уведомления</h3>' + list.slice(0,6).map(n=>`
      <article class="as-notify-preview-card">
        ${n.image ? `<img class="as-notify-preview-img" src="${esc(n.image)}" alt="">` : ""}
        <div class="as-notify-preview-title">${esc(n.title)}</div>
        <div class="as-notify-preview-text">${esc(n.shortText || stripHtml(n.html).slice(0,120))}</div>
        <div class="as-notify-date">${esc(fmt(n.createdAt))}</div>
        <a class="as-notify-read-btn" href="notifications.html?id=${encodeURIComponent(n.id)}">Читать полностью</a>
      </article>
    `).join("") + '<a class="as-notify-read-btn" href="notifications.html">Все уведомления</a>';
  }

  async function updateCount(){
    const btn = document.getElementById("asNotifyCount");
    if(!btn) return;
    const count = unreadCount(await fetchNotifications());
    btn.dataset.count = String(count);
    btn.textContent = count ? String(count) : "";
  }

  async function renderNotificationsPage(){
    const root = document.getElementById("notificationsRoot");
    if(!root) return;
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const list = await fetchNotifications();

    if(id){
      const n = list.find(x => String(x.id) === String(id)) || list[0];
      root.innerHTML = `
        <main class="as-notify-detail">
          <a class="as-notify-back-btn" href="notifications.html">← Назад к уведомлениям</a>
          ${n.image ? `<img class="as-notify-detail-img" src="${esc(n.image)}" alt="">` : ""}
          <h1>${esc(n.title)}</h1>
          <div class="as-notify-date">${esc(fmt(n.createdAt))}</div>
          <div class="as-notify-body" style="font-family:${esc(n.font || 'inherit')}">${n.html || esc(n.shortText || "")}</div>
          ${n.buttonUrl ? `<p style="margin-top:18px"><a class="as-notify-action-btn" href="${esc(n.buttonUrl)}">${esc(n.buttonText || "Подробнее")}</a></p>` : ""}
        </main>
      `;
      return;
    }

    root.innerHTML = `
      <main class="as-notify-page">
        <h1>Уведомления</h1>
        <div class="as-notify-grid">
          ${list.map(n=>`
            <article class="as-notify-full-card">
              ${n.image ? `<img class="as-notify-preview-img" src="${esc(n.image)}" alt="">` : ""}
              <div class="as-notify-title">${esc(n.title)}</div>
              <div class="as-notify-short">${esc(n.shortText || stripHtml(n.html).slice(0,140))}</div>
              <div class="as-notify-date">${esc(fmt(n.createdAt))}</div>
              <a class="as-notify-read-btn" href="notifications.html?id=${encodeURIComponent(n.id)}">Читать полностью</a>
            </article>
          `).join("")}
        </div>
      </main>
    `;
  }

  function ensureAdminTab(){
    const isAdmin = /admin\.html/i.test(location.pathname);
    if(!isAdmin) return;

    const side = document.querySelector(".sidebar,.admin-sidebar,aside,nav");
    if(side && !side.querySelector('[href="#notifications"]')){
      const a = document.createElement("a");
      a.href = "#notifications";
      a.textContent = "🔔 Уведомления";
      a.className = "admin-nav-link";
      side.appendChild(a);
    }

    if(!document.getElementById("adminNotificationsSection")){
      const main = document.querySelector("main,.admin-content,.content") || document.body;
      const sec = document.createElement("section");
      sec.id = "adminNotificationsSection";
      sec.className = "as-admin-notifications-section";
      sec.innerHTML = `
        <div class="as-admin-notify-wrap">
          <div class="as-admin-card">
            <h2>Послать уведомление всем</h2>

            <label class="as-admin-field">Заголовок
              <input id="asAdminNotifyTitle" placeholder="Например: Новая акция">
            </label>

            <label class="as-admin-field">Краткий текст
              <textarea id="asAdminNotifyShort" placeholder="Краткое описание для предпросмотра"></textarea>
            </label>

            <label class="as-admin-field">Изображение URL
              <input id="asAdminNotifyImage" placeholder="https://...">
            </label>

            <label class="as-admin-field">Кнопка: текст
              <input id="asAdminNotifyButtonText" placeholder="Подробнее">
            </label>

            <label class="as-admin-field">Кнопка: ссылка
              <input id="asAdminNotifyButtonUrl" placeholder="catalog.html или product.html?id=...">
            </label>

            <div class="as-admin-field">Полный текст</div>
            <div class="as-admin-editor-toolbar">
              <select id="asAdminFont">
                <option value="">Шрифт сайта</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Tahoma">Tahoma</option>
                <option value="Verdana">Verdana</option>
              </select>
              <select id="asAdminSize">
                <option value="3">Размер</option>
                <option value="2">Маленький</option>
                <option value="3">Обычный</option>
                <option value="5">Большой</option>
                <option value="7">Очень большой</option>
              </select>
              <button type="button" data-cmd="bold">B</button>
              <button type="button" data-cmd="italic"><i>I</i></button>
              <button type="button" data-cmd="underline"><u>U</u></button>
              <button type="button" data-emoji="🔥">🔥</button>
              <button type="button" data-emoji="🎁">🎁</button>
              <button type="button" data-emoji="🚗">🚗</button>
              <button type="button" data-emoji="✅">✅</button>
              <input type="color" id="asAdminColor">
            </div>
            <div id="asAdminEditor" class="as-admin-rich-editor" contenteditable="true">Введите полный текст уведомления...</div>

            <div class="as-admin-actions">
              <button id="asAdminSendNotify" type="button">Отправить всем</button>
              <span class="as-admin-status" id="asAdminNotifyStatus"></span>
            </div>
          </div>
          <div class="as-admin-card">
            <h2>История уведомлений</h2>
            <div id="asAdminNotifyHistory"></div>
          </div>
        </div>
      `;
      main.appendChild(sec);
    }

    bindAdmin();
    renderAdminHistory();

    document.querySelectorAll('a[href="#notifications"]').forEach(a=>{
      if(a.dataset.asNotifyTabBound) return;
      a.dataset.asNotifyTabBound = "1";
      a.addEventListener("click", e=>{
        e.preventDefault();
        showAdminNotifications();
      });
    });

    if(location.hash === "#notifications") showAdminNotifications();
  }

  function showAdminNotifications(){
    document.querySelectorAll("main section,.admin-section,.content-section").forEach(s=>{
      if(s.id !== "adminNotificationsSection") s.style.display = "none";
    });
    const sec = document.getElementById("adminNotificationsSection");
    if(sec){
      sec.classList.add("active");
      sec.style.display = "block";
    }
    history.replaceState(null,"","#notifications");
  }

  function bindAdmin(){
    const editor = document.getElementById("asAdminEditor");
    if(!editor || editor.dataset.bound) return;
    editor.dataset.bound = "1";

    document.querySelectorAll(".as-admin-editor-toolbar [data-cmd]").forEach(btn=>{
      btn.addEventListener("click",()=>document.execCommand(btn.dataset.cmd,false,null));
    });
    document.querySelectorAll(".as-admin-editor-toolbar [data-emoji]").forEach(btn=>{
      btn.addEventListener("click",()=>document.execCommand("insertText",false,btn.dataset.emoji));
    });
    document.getElementById("asAdminFont")?.addEventListener("change", e=>{
      document.execCommand("fontName", false, e.target.value);
    });
    document.getElementById("asAdminSize")?.addEventListener("change", e=>{
      document.execCommand("fontSize", false, e.target.value);
    });
    document.getElementById("asAdminColor")?.addEventListener("input", e=>{
      document.execCommand("foreColor", false, e.target.value);
    });

    document.getElementById("asAdminSendNotify")?.addEventListener("click", async ()=>{
      const status = document.getElementById("asAdminNotifyStatus");
      const title = document.getElementById("asAdminNotifyTitle").value.trim();
      if(!title){
        status.textContent = "Заполни заголовок.";
        return;
      }

      status.textContent = "Отправляем...";
      await addNotification({
        title,
        shortText: document.getElementById("asAdminNotifyShort").value.trim(),
        image: document.getElementById("asAdminNotifyImage").value.trim(),
        buttonText: document.getElementById("asAdminNotifyButtonText").value.trim(),
        buttonUrl: document.getElementById("asAdminNotifyButtonUrl").value.trim(),
        font: document.getElementById("asAdminFont").value,
        html: editor.innerHTML
      });
      status.textContent = "Уведомление отправлено.";
      document.getElementById("asAdminNotifyTitle").value = "";
      document.getElementById("asAdminNotifyShort").value = "";
      editor.innerHTML = "";
      renderAdminHistory();
      updateCount();
    });
  }

  async function renderAdminHistory(){
    const box = document.getElementById("asAdminNotifyHistory");
    if(!box) return;
    const list = await fetchNotifications();
    box.innerHTML = list.map(n=>`
      <div class="as-admin-history-item">
        <strong>${esc(n.title)}</strong>
        <div>${esc(n.shortText || stripHtml(n.html).slice(0,120))}</div>
        <small>${esc(fmt(n.createdAt))}</small>
      </div>
    `).join("");
  }

  function closeDropdownOnOutside(){
    document.addEventListener("click", e=>{
      const d = document.getElementById("asNotifyDropdown");
      if(!d || !d.classList.contains("is-open")) return;
      if(e.target.closest("#asNotifyDropdown") || e.target.closest("#asNotifyMenuBtn")) return;
      d.classList.remove("is-open");
    });
  }

  function init(){
    ensureHeaderButton();
    renderNotificationsPage();
    ensureAdminTab();
    updateCount();
    closeDropdownOnOutside();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.AutoStyleNotifications = { addNotification, fetchNotifications };
})();
