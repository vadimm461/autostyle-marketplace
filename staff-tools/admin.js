const clone = (obj) => JSON.parse(JSON.stringify(obj));

const fallbackData = {
    users: {
        cashier: { name: "Кассир", pass: "2012" },
        evgeniy: { name: "Евгений", pass: "0186", manager: true },
        vadim: { name: "Вадим", pass: "2385", manager: true }
    },
    news: {
        badge: "НОВОСТЬ ДЛЯ КОМАНДЫ",
        title: "🚀 Команда, для вас хорошие новости",
        text: `Запускаем <b>Бонусный проект</b> — систему накопительных скидок.<br><br>Привязка клиента:<br>• по ФИО<br>• по номеру телефона<br><br>Все покупки сохраняются автоматически.`,
        endDate: "2026-06-20T00:00:00"
    },
    calculators: [
        { title: "КАЛЬКУЛЯТОР РАССРОЧКИ", bank: "АГРОПРОМБАНК", rows: [["3 мес.", 0.955], ["6 мес.", 0.93], ["9 мес.", 0.90], ["12 мес.", 0.875]] },
        { title: "КАЛЬКУЛЯТОР РАССРОЧКИ", bank: "ЭКСИМБАНК", rows: [["3 мес.", 0.955], ["6 мес.", 0.93], ["9 мес.", 0.90], ["12 мес.", 0.886]] },
        { title: "КАЛЬКУЛЯТОР РАССРОЧКИ", bank: "СБЕРБАНК", rows: [["3 мес.", 0.96], ["6 мес.", 0.93], ["9 мес.", 0.90], ["12 мес.", 0.88]] }
    ],
    menu: [
        { href: "beznal.html", icon: "💳", title: "Безнал", desc: "Оформление безналичной оплаты и документов." },
        { href: "smena.html", icon: "📊", title: "Закрытие смены", desc: "Быстрое оформление и завершение смены." },
        { href: "discount.html", icon: "🎫", title: "Скидочная карта", desc: "Создание и печать анкеты клиента." },
        { href: "baza.html", icon: "📚", title: "База знаний", desc: "Инструкции, масла и техническая информация." },
        { href: "pass.html", icon: "🔐", title: "Пароли", desc: "Доступы и служебная информация." },
        { href: "salary.html", icon: "💵", title: "Заработная плата", desc: "Отчет по зарплате и ценовым группам.", managerOnly: true },
        { href: "close-shift.html", icon: "📊", title: "Закрытие смен", desc: "Ссылка на отчет по закрытию смены", managerOnly: true },
        { href: "cash-diff.html", icon: "💰", title: "Расхождение по кассе", desc: "Контроль расхождения наличности.", managerOnly: true },
        { href: "#", icon: "🚪", title: "Выход", desc: "Завершить текущую сессию пользователя.", action: "logout" }
    ]
};

const defaultSalaryGroups = [
    "Скидка до 1%",
    "Скидка до 3%",
    "Скидка до 5%",
    "Скидка до 7%",
    "Скидка до 10%",
    "Скидка до 15%",
    "Скидка до 20%"
];

let db = null;
let fb = null;
let auth = null;
let authMod = null;
let currentAdmin = null;
let data = clone(fallbackData);
let products = [];
let deletedProductIds = [];
let salaryData = {
    period: "",
    rows: [],
    rates: Object.fromEntries(defaultSalaryGroups.map(group => [group, 0]))
};

const $ = (id) => document.getElementById(id);

function withTimeout(promise, ms = 9000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase timeout")), ms))
    ]);
}

async function getFirebaseConfig() {
    try {
        const module = await import("./firebase-config.js?ts=" + Date.now());
        const config = module.firebaseConfig || {};
        if (!config.apiKey || String(config.apiKey).includes("PASTE_")) return null;
        return config;
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function initFirebase() {
    const config = await getFirebaseConfig();

    if (!config) {
        setStatus("Firebase config не заполнен или файл с ошибкой. Работает локальный шаблон.", "error");
        return false;
    }

    try {
        const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
        const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
        authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");

        fb = fsMod;
        const app = appMod.initializeApp(config);
        db = fsMod.getFirestore(app);
        auth = authMod.getAuth(app);
        return true;
    } catch (error) {
        console.error(error);
        setStatus("Firebase не подключился. Проверь firebase-config.js и интернет.", "error");
        return false;
    }
}


function showAuthGate(message = "") {
    const gate = $("authGate");
    if (gate) gate.classList.remove("hidden");
    const error = $("authError");
    if (error) error.textContent = message;
    const session = $("adminSession");
    if (session) session.hidden = true;
}

function hideAuthGate(user) {
    const gate = $("authGate");
    if (gate) gate.classList.add("hidden");
    const session = $("adminSession");
    if (session) session.hidden = false;
    const email = $("adminEmail");
    if (email) email.textContent = user?.email || "Администратор";
}

async function hasAdminRole(user) {
    if (!user || !db || !fb) return false;

    const refs = [
        fb.doc(db, "autostyle_users", user.uid),
        fb.doc(db, "users", user.uid)
    ];

    for (const ref of refs) {
        try {
            const snap = await withTimeout(fb.getDoc(ref));
            if (snap.exists() && snap.data()?.role === "admin") return true;
        } catch (error) {
            console.warn("Не удалось проверить роль администратора:", error);
        }
    }

    return false;
}

async function requireAdminAuth() {
    if (!auth || !authMod) return false;

    const user = await new Promise(resolve => {
        const unsubscribe = authMod.onAuthStateChanged(auth, value => {
            unsubscribe();
            resolve(value);
        });
    });

    if (!user) {
        showAuthGate();
        return false;
    }

    const allowed = await hasAdminRole(user);
    if (!allowed) {
        await authMod.signOut(auth);
        showAuthGate("У этого аккаунта нет роли admin в users/UID или autostyle_users/UID.");
        return false;
    }

    currentAdmin = user;
    hideAuthGate(user);
    return true;
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const email = $("authEmail")?.value.trim();
    const password = $("authPassword")?.value || "";
    const submit = $("authSubmit");
    const error = $("authError");

    if (error) error.textContent = "";
    if (submit) {
        submit.disabled = true;
        submit.textContent = "Вход…";
    }

    try {
        const credential = await authMod.signInWithEmailAndPassword(auth, email, password);
        const allowed = await hasAdminRole(credential.user);

        if (!allowed) {
            await authMod.signOut(auth);
            throw new Error("У аккаунта нет роли admin в Firestore.");
        }

        currentAdmin = credential.user;
        hideAuthGate(credential.user);
        setStatus("Вход выполнен. Загружаю данные…", "ok");
        await loadAuthorizedData();
    } catch (loginError) {
        console.error(loginError);
        const messages = {
            "auth/invalid-credential": "Неверный email или пароль.",
            "auth/user-not-found": "Пользователь не найден.",
            "auth/wrong-password": "Неверный пароль.",
            "auth/too-many-requests": "Слишком много попыток. Попробуй позже."
        };
        if (error) error.textContent = messages[loginError.code] || loginError.message || "Ошибка входа.";
        showAuthGate(error?.textContent || "Ошибка входа.");
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = "Войти";
        }
    }
}

async function logoutAdmin() {
    if (auth && authMod) await authMod.signOut(auth);
    currentAdmin = null;
    showAuthGate();
    setStatus("Выполнен выход из админ-панели.");
}

function setStatus(text, type = "") {
    const el = $("statusText");
    if (!el) return;
    el.textContent = text;
    el.className = type ? `status-${type}` : "";
}

function toDatetimeLocal(value) {
    return value ? String(value).slice(0, 16) : "";
}

function escapeAttr(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function money(value) {
    return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
}

function num(value) {
    return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function parseMoney(value) {
    if (typeof value === "number") return value;
    return Number(String(value || "")
        .replace(/\s/g, "")
        .replace(/,/g, ".")
        .replace(/[^0-9.\-]/g, "")) || 0;
}

function normalizeCalculatorRows(rows) {
    return (rows || []).map(row => {
        if (Array.isArray(row)) return [row[0], Number(row[1])];
        return [row.term || row.title || "", Number(row.coef ?? row.value ?? 0)];
    }).filter(row => row[0] && !Number.isNaN(row[1]));
}

function normalizeSiteData(siteData) {
    const result = { ...clone(fallbackData), ...(siteData || {}) };
    result.calculators = (result.calculators || []).map(calc => ({
        ...calc,
        rows: normalizeCalculatorRows(calc.rows)
    }));
    return result;
}

function prepareSiteDataForFirestore(sourceData) {
    const result = clone(sourceData);
    result.calculators = (result.calculators || []).map(calc => ({
        ...calc,
        rows: normalizeCalculatorRows(calc.rows).map(([term, coef]) => ({ term, coef }))
    }));
    return result;
}

function collectDataFromForm() {
    if (!$('newsBadge')) return;

    data.news = {
        badge: $("newsBadge").value.trim(),
        title: $("newsTitle").value.trim(),
        text: $("newsText").value,
        endDate: $("newsEndDate").value ? `${$("newsEndDate").value}:00` : ""
    };

    data.calculators = [...document.querySelectorAll("[data-calc]")].map(card => ({
        title: card.querySelector("[data-calc-title]").value.trim(),
        bank: card.querySelector("[data-calc-bank]").value.trim(),
        rows: [...card.querySelectorAll("[data-calc-row]")].map(row => [
            row.querySelector("[data-term]").value.trim(),
            Number(row.querySelector("[data-coef]").value)
        ]).filter(row => row[0] && !Number.isNaN(row[1]))
    }));

    data.menu = [...document.querySelectorAll("[data-menu]")].map(card => ({
        icon: card.querySelector("[data-menu-icon]").value.trim(),
        title: card.querySelector("[data-menu-title]").value.trim(),
        desc: card.querySelector("[data-menu-desc]").value.trim(),
        href: card.querySelector("[data-menu-href]").value.trim() || "#",
        managerOnly: card.querySelector("[data-menu-manager]").checked,
        action: card.querySelector("[data-menu-action]").value.trim() || undefined
    })).filter(item => item.title);

    const users = {};
    [...document.querySelectorAll("[data-user]")].forEach(card => {
        const key = card.querySelector("[data-user-key]").value.trim();
        if (!key) return;
        users[key] = {
            name: card.querySelector("[data-user-name]").value.trim(),
            pass: card.querySelector("[data-user-pass]").value.trim(),
            manager: card.querySelector("[data-user-manager]").checked
        };
    });

    data.users = users;
    if ($("jsonEditor")) $("jsonEditor").value = JSON.stringify(data, null, 4);
}

function collectProductsFromForm() {
    products = [...document.querySelectorAll("[data-product]")].map(card => ({
        id: card.dataset.id || "",
        code: card.querySelector("[data-product-code]")?.value.trim() || "",
        name: card.querySelector("[data-product-name]").value.trim(),
        group: card.querySelector("[data-product-group]").value.trim(),
        bonus: Number(card.querySelector("[data-product-bonus]").value) || 0,
        plan: Number(card.querySelector("[data-product-plan]").value) || 0,
        sold: Number(card.querySelector("[data-product-sold]").value) || 0
    })).filter(item => item.name);
}

function renderAll() {
    $("newsBadge").value = data.news?.badge || "";
    $("newsTitle").value = data.news?.title || "";
    $("newsText").value = data.news?.text || "";
    $("newsEndDate").value = toDatetimeLocal(data.news?.endDate);
    renderCalculators();
    renderMenu();
    renderUsers();
    $("jsonEditor").value = JSON.stringify(data, null, 4);
}

function renderCalculators() {
    $("calculatorsEditor").innerHTML = (data.calculators || []).map(calc => `
        <div class="editor-card" data-calc>
            <div class="card-title-line">
                <strong>${escapeAttr(calc.bank || "Банк")}</strong>
                <button class="danger-btn" data-remove-calc>Удалить</button>
            </div>
            <div class="editor-grid">
                <div><label>Название блока</label><input data-calc-title value="${escapeAttr(calc.title || "")}"></div>
                <div><label>Банк</label><input data-calc-bank value="${escapeAttr(calc.bank || "")}"></div>
            </div>
            <div class="row-list">${normalizeCalculatorRows(calc.rows).map(([term, coef]) => rowTemplate(term, coef)).join("")}</div>
            <button class="small-btn" data-add-row>+ Срок</button>
        </div>
    `).join("");
}

function rowTemplate(term = "3 мес.", coef = 0.95) {
    return `
        <div class="row-item" data-calc-row>
            <input data-term placeholder="Срок" value="${escapeAttr(term)}">
            <input data-coef type="number" step="0.001" placeholder="Коэффициент" value="${escapeAttr(coef)}">
            <button class="danger-btn" data-remove-row>×</button>
        </div>
    `;
}

function renderMenu() {
    $("menuEditor").innerHTML = (data.menu || []).map(item => `
        <div class="editor-card" data-menu>
            <div class="card-title-line"><strong>${escapeAttr(item.icon || "🔗")} ${escapeAttr(item.title || "Карточка")}</strong><button class="danger-btn" data-remove-menu>Удалить</button></div>
            <div class="menu-item">
                <div><label>Иконка</label><input data-menu-icon value="${escapeAttr(item.icon || "")}"></div>
                <div><label>Название</label><input data-menu-title value="${escapeAttr(item.title || "")}"></div>
                <div><label>Ссылка</label><input data-menu-href value="${escapeAttr(item.href || "#")}"></div>
            </div>
            <label>Описание</label><input data-menu-desc value="${escapeAttr(item.desc || "")}">
            <div class="editor-grid">
                <label class="checkbox-line"><input type="checkbox" data-menu-manager ${item.managerOnly ? "checked" : ""}> Только менеджерам</label>
                <div><label>Action, например logout</label><input data-menu-action value="${escapeAttr(item.action || "")}"></div>
            </div>
        </div>
    `).join("");
}

function renderUsers() {
    $("usersEditor").innerHTML = Object.entries(data.users || {}).map(([key, user]) => `
        <div class="editor-card" data-user>
            <div class="card-title-line"><strong>${escapeAttr(user.name || key)}</strong><button class="danger-btn" data-remove-user>Удалить</button></div>
            <div class="editor-grid three">
                <div><label>ID</label><input data-user-key value="${escapeAttr(key)}"></div>
                <div><label>Имя</label><input data-user-name value="${escapeAttr(user.name || "")}"></div>
                <div><label>Пароль</label><input data-user-pass value="${escapeAttr(user.pass || "")}"></div>
            </div>
            <label class="checkbox-line"><input type="checkbox" data-user-manager ${user.manager ? "checked" : ""}> Менеджер</label>
        </div>
    `).join("");
}

function getProductGroups() {
    return [...new Set(products.map(item => String(item.group || "Без группы").trim() || "Без группы"))]
        .sort((a, b) => a.localeCompare(b, "ru"));
}

function renderProducts() {
    const box = $("productsEditor");
    if (!box) return;

    const groups = getProductGroups();

    if (!products.length) {
        box.innerHTML = `
            <div class="products-toolbar"><button class="small-btn" id="addProductGroupInlineBtn">+ Группа</button></div>
            <div class="warning-box">Товары не загружены. Если во вкладке «Премия» они есть, проверь правила Firestore для коллекции <b>products</b> и нажми «Обновить».</div>
        `;
        bindProductGroupButton();
        return;
    }

    box.innerHTML = `
        <div class="products-toolbar">
            <button class="small-btn" id="addProductGroupInlineBtn">+ Группа</button>
            <span class="hint">Группы создаются автоматически, когда ты добавляешь товар с новой группой.</span>
        </div>
        ${groups.map(group => {
            const groupProducts = products
                .filter(item => (String(item.group || "Без группы").trim() || "Без группы") === group)
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"));

            return `
                <div class="product-group-block">
                    <div class="product-group-head">
                        <div><strong>${escapeAttr(group)}</strong><span>${groupProducts.length} тов.</span></div>
                        <button class="small-btn" data-add-product-to-group="${escapeAttr(group)}">+ Товар</button>
                    </div>
                    <div class="product-compact-list">${groupProducts.map(item => productTemplate(item, groups)).join("")}</div>
                </div>
            `;
        }).join("")}
    `;

    bindProductGroupButton();
}

function bindProductGroupButton() {
    const btn = $("addProductGroupInlineBtn");
    if (!btn) return;

    btn.onclick = () => {
        const group = prompt("Название новой группы:");
        if (!group || !group.trim()) return;
        collectProductsFromForm();
        products.push({ id: "", code: "", name: "Новый товар", group: group.trim(), bonus: 0, plan: 0, sold: 0 });
        renderProducts();
    };
}

function productTemplate(item = {}, groups = []) {
    const cleanGroup = String(item.group || "Без группы").trim() || "Без группы";
    const groupOptions = groups.map(group => `
        <option value="${escapeAttr(group)}" ${group === cleanGroup ? "selected" : ""}>${escapeAttr(group)}</option>
    `).join("");

    return `
        <div class="editor-card product-card-compact" data-product data-id="${escapeAttr(item.id || "")}">
            <div class="product-row-main">
                <input class="product-code-input" data-product-code placeholder="Код" value="${escapeAttr(item.code || "")}">
                <input class="product-name-input" data-product-name placeholder="Название" value="${escapeAttr(item.name || "")}">
                <select data-product-group>${groupOptions}</select>
                <input type="number" data-product-bonus placeholder="Бонус" value="${escapeAttr(item.bonus ?? 0)}">
                <input type="number" data-product-plan placeholder="План" value="${escapeAttr(item.plan ?? 0)}">
                <input type="number" data-product-sold placeholder="Продано" value="${escapeAttr(item.sold ?? 0)}">
                <button class="danger-btn compact-delete" data-remove-product>Удалить</button>
            </div>
        </div>
    `;
}

function injectSalaryAdminUI() {
    if ($("tab-salary")) return;

    const sidebar = document.querySelector(".admin-sidebar");
    const main = document.querySelector(".admin-main");
    const jsonBtn = document.querySelector('[data-tab="json"]');

    if (sidebar && jsonBtn) {
        const btn = document.createElement("button");
        btn.className = "admin-tab";
        btn.dataset.tab = "salary";
        btn.textContent = "Заработная плата";
        sidebar.insertBefore(btn, jsonBtn);
    }

    if (main) {
        const section = document.createElement("section");
        section.className = "admin-panel";
        section.id = "tab-salary";
        section.innerHTML = `
            <div class="panel-head">
                <h2>Заработная плата</h2>
                <button class="small-btn" id="saveSalaryBtn">Сохранить зарплату</button>
            </div>

            <div class="warning-box">
                Загрузи Excel. Админка ищет строку с колонками: <b>Номенклатура.Ценовая группа</b>, <b>Количество</b>, <b>Стоимость</b>.
            </div>

            <div class="editor-card">
                <div class="editor-grid three">
                    <div>
                        <label>Период отчета</label>
                        <input id="salaryPeriod" placeholder="01.05.2026 - 25.05.2026">
                    </div>
                    <div>
                        <label>Excel файл .xls / .xlsx</label>
                        <input id="salaryFile" type="file" accept=".xls,.xlsx">
                    </div>
                    <div>
                        <label>Строк в отчете</label>
                        <input id="salaryRowsCount" disabled value="0">
                    </div>
                </div>
            </div>

            <div class="editor-card">
                <div class="card-title-line">
                    <strong>Проценты ЗП по ценовым группам</strong>
                    <button class="small-btn" id="addSalaryGroupBtn">+ Группа</button>
                </div>
                <div id="salaryRatesEditor"></div>
            </div>

            <div class="editor-card">
                <div class="card-title-line">
                    <strong>Предпросмотр</strong>
                    <span id="salaryPreviewTotal">0 ₽</span>
                </div>
                <div id="salaryPreview"></div>
            </div>
        `;
        main.appendChild(section);
    }

    addSalaryCss();
}

function addSalaryCss() {
    if ($("salaryAdminCss")) return;
    const style = document.createElement("style");
    style.id = "salaryAdminCss";
    style.textContent = `
        .salary-rate-row{display:grid;grid-template-columns:1.6fr 160px 90px;gap:10px;align-items:center;margin-bottom:8px}
        .salary-rate-row input{padding:10px;border-radius:12px;border:1px solid #dbe2ea}
        .salary-preview-table{width:100%;border-collapse:collapse;min-width:760px}
        .salary-preview-table th{background:#f1f5f9;text-align:left;padding:12px;font-size:13px;color:#334155}
        .salary-preview-table td{padding:12px;border-bottom:1px solid #eef2f7;font-weight:700}
        .salary-money{color:#15803d;font-weight:900}
    `;
    document.head.appendChild(style);
}

function salaryGroupsFromRows() {
    const fromRows = salaryData.rows.map(row => row.group).filter(Boolean);
    const fromRates = Object.keys(salaryData.rates || {});
    return [...new Set([...defaultSalaryGroups, ...fromRates, ...fromRows])].sort((a, b) => a.localeCompare(b, "ru"));
}

function renderSalaryAdmin() {
    if (!$('salaryRatesEditor')) return;

    $("salaryPeriod").value = salaryData.period || "";
    $("salaryRowsCount").value = salaryData.rows.length;

    const groups = salaryGroupsFromRows();
    $("salaryRatesEditor").innerHTML = groups.map(group => `
        <div class="salary-rate-row" data-salary-rate-row>
            <input data-salary-group value="${escapeAttr(group)}" placeholder="Ценовая группа">
            <input data-salary-rate type="number" step="0.01" value="${escapeAttr(salaryData.rates?.[group] ?? 0)}" placeholder="% ЗП">
            <button class="danger-btn" data-remove-salary-group>Удалить</button>
        </div>
    `).join("");

    renderSalaryPreview();
}

function collectSalaryFromForm() {
    if (!$('salaryPeriod')) return;

    salaryData.period = $("salaryPeriod").value.trim();
    const rates = {};

    document.querySelectorAll("[data-salary-rate-row]").forEach(row => {
        const group = row.querySelector("[data-salary-group]").value.trim();
        const rate = Number(row.querySelector("[data-salary-rate]").value) || 0;
        if (group) rates[group] = rate;
    });

    salaryData.rates = rates;
}

function renderSalaryPreview() {
    const box = $("salaryPreview");
    if (!box) return;

    collectSalaryFromForm();

    if (!salaryData.rows.length) {
        box.innerHTML = `<div class="warning-box">Файл еще не загружен.</div>`;
        $("salaryPreviewTotal").textContent = "0 ₽";
        return;
    }

    const grouped = {};
    salaryData.rows.forEach(row => {
        const group = row.group || "Без группы";
        if (!grouped[group]) grouped[group] = { group, qty: 0, sum: 0, rate: 0, salary: 0 };
        grouped[group].qty += Number(row.qty || 0);
        grouped[group].sum += Number(row.sum || 0);
    });

    const result = Object.values(grouped).sort((a, b) => b.sum - a.sum).map(row => {
        row.rate = Number(salaryData.rates[row.group] || 0);
        row.salary = row.sum * row.rate / 100;
        return row;
    });

    const total = result.reduce((sum, row) => sum + row.salary, 0);
    $("salaryPreviewTotal").textContent = money(total);

    box.innerHTML = `
        <table class="salary-preview-table">
            <thead><tr><th>Ценовая группа</th><th>Кол-во</th><th>Сумма</th><th>% ЗП</th><th>ЗП</th></tr></thead>
            <tbody>
                ${result.map(row => `
                    <tr>
                        <td>${escapeAttr(row.group)}</td>
                        <td>${num(row.qty)}</td>
                        <td>${money(row.sum)}</td>
                        <td>${row.rate}%</td>
                        <td class="salary-money">${money(row.salary)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

async function loadXlsxLibrary() {
    if (window.XLSX) return;

    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function parseSalaryExcel(file) {
    await loadXlsxLibrary();

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const table = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false
    });

    let headerRowIndex = -1;
    let groupIndex = -1;
    let qtyIndex = -1;
    let sumIndex = -1;

    for (let i = 0; i < table.length; i++) {
        const row = table[i].map(x => String(x || "").toLowerCase().trim());
        const g = row.findIndex(x => x.includes("ценовая") && x.includes("группа"));
        const q = row.findIndex(x => x.includes("количество"));
        const s = row.findIndex(x => x.includes("стоимость") || x.includes("сумма"));

        if (g >= 0 && q >= 0 && s >= 0) {
            headerRowIndex = i;
            groupIndex = g;
            qtyIndex = q;
            sumIndex = s;
            break;
        }
    }

    if (headerRowIndex < 0) {
        alert("Не нашел строку таблицы. Нужны колонки: Ценовая группа, Количество, Стоимость");
        return;
    }

    salaryData.rows = [];

    for (let i = headerRowIndex + 1; i < table.length; i++) {
        const row = table[i];
        let group = String(row[groupIndex] || "").trim();
        const lowerGroup = group.toLowerCase();
        const qty = parseMoney(row[qtyIndex]);
        const sum = parseMoney(row[sumIndex]);

        if (lowerGroup === "итог") continue;
        if (!group && !qty && !sum) continue;
        if (!group) group = "Без ценовой группы";

        salaryData.rows.push({ group, qty, sum });
    }

    if (!salaryData.period) {
        const periodRow = table.find(row =>
            row.map(x => String(x).toLowerCase()).join(" ").includes("период")
        );
        if (periodRow) salaryData.period = periodRow.join(" ").replace(/\s+/g, " ").trim();
    }

    setStatus(`Excel загружен: ${salaryData.rows.length} строк.`, "ok");
    renderSalaryAdmin();
}

async function loadSiteData() {
    try {
        const snap = await withTimeout(fb.getDoc(fb.doc(db, "site", "main")));
        data = snap.exists() ? normalizeSiteData(snap.data()) : clone(fallbackData);
        renderAll();
        setStatus("Данные сайта загружены.", "ok");
    } catch (error) {
        console.error(error);
        data = clone(fallbackData);
        renderAll();
        setStatus("Данные сайта не загрузились. Оставил локальный шаблон.", "error");
    }
}

async function loadProducts() {
    if (!db) {
        products = [];
        renderProducts();
        return;
    }

    try {
        const snap = await withTimeout(fb.getDocs(fb.collection(db, "products")));
        products = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) =>
                String(a.group || "").localeCompare(String(b.group || ""), "ru") ||
                String(a.name || "").localeCompare(String(b.name || ""), "ru")
            );

        deletedProductIds = [];
        renderProducts();
        setStatus(`Товары загружены: ${products.length}.`, "ok");
    } catch (error) {
        console.error(error);
        products = [];
        renderProducts();
        setStatus("Товары из products не загрузились. Проверь правила Firestore.", "error");
    }
}

async function loadSalaryData() {
    if (!db) {
        renderSalaryAdmin();
        return;
    }

    try {
        const snap = await withTimeout(fb.getDoc(fb.doc(db, "salary", "current")));
        if (snap.exists()) {
            const loaded = snap.data();
            salaryData = {
                ...salaryData,
                ...loaded,
                rates: { ...salaryData.rates, ...(loaded.rates || {}) },
                rows: loaded.rows || []
            };
        }
        renderSalaryAdmin();
    } catch (error) {
        console.error(error);
        renderSalaryAdmin();
    }
}

async function loadAuthorizedData() {
    await loadSiteData();
    await loadProducts();
    await loadSalaryData();
}

async function loadData() {
    setStatus("Загрузка данных…");
    injectSalaryAdminUI();

    if (!db) {
        const ready = await initFirebase();
        if (!ready) {
            data = clone(fallbackData);
            renderAll();
            renderProducts();
            renderSalaryAdmin();
            return;
        }
    }

    const authorized = await requireAdminAuth();
    if (!authorized) {
        data = clone(fallbackData);
        renderAll();
        renderProducts();
        renderSalaryAdmin();
        setStatus("Войди через аккаунт администратора Firebase.", "error");
        return;
    }

    await loadAuthorizedData();
}

async function saveData() {
    collectDataFromForm();
    collectProductsFromForm();
    collectSalaryFromForm();

    if (!db || !auth?.currentUser || !currentAdmin) {
        showAuthGate("Сначала войди через аккаунт администратора Firebase.");
        setStatus("Сохранение недоступно без авторизации администратора.", "error");
        return;
    }

    try {
        const siteData = prepareSiteDataForFirestore(data);
        await fb.setDoc(fb.doc(db, "site", "main"), siteData, { merge: true });

        for (const id of deletedProductIds) {
            await fb.deleteDoc(fb.doc(db, "products", id));
        }

        for (const item of products) {
            const clean = {
                code: item.code || "",
                name: item.name,
                group: item.group,
                bonus: item.bonus,
                plan: item.plan,
                sold: item.sold
            };

            if (item.id) {
                await fb.setDoc(fb.doc(db, "products", item.id), clean, { merge: true });
            } else {
                await fb.addDoc(fb.collection(db, "products"), clean);
            }
        }

        await fb.setDoc(fb.doc(db, "salary", "current"), {
            period: salaryData.period || "",
            rates: salaryData.rates || {},
            rows: salaryData.rows || [],
            updatedAt: new Date().toISOString()
        }, { merge: true });

        deletedProductIds = [];
        setStatus("Сохранено в Firebase.", "ok");
        await loadProducts();
        await loadSalaryData();
    } catch (error) {
        console.error(error);
        setStatus("Ошибка сохранения: " + (error.message || "проверь правила Firestore"), "error");
    }
}

function bindEvents() {
    injectSalaryAdminUI();

    if ($("authForm")) $("authForm").addEventListener("submit", handleAdminLogin);
    if ($("logoutAdminBtn")) $("logoutAdminBtn").addEventListener("click", logoutAdmin);

    document.querySelectorAll(".admin-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            collectDataFromForm();
            collectProductsFromForm();
            collectSalaryFromForm();

            document.querySelectorAll(".admin-tab").forEach(x => x.classList.remove("active"));
            document.querySelectorAll(".admin-panel").forEach(x => x.classList.remove("active"));

            btn.classList.add("active");
            const panel = $(`tab-${btn.dataset.tab}`);
            if (panel) panel.classList.add("active");
        });
    });

    if ($("saveBtn")) $("saveBtn").onclick = saveData;
    if ($("reloadBtn")) $("reloadBtn").onclick = loadData;
    if ($("saveSalaryBtn")) $("saveSalaryBtn").onclick = saveData;

    if ($("salaryFile")) {
        $("salaryFile").addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await parseSalaryExcel(file);
        });
    }

    if ($("addSalaryGroupBtn")) {
        $("addSalaryGroupBtn").onclick = () => {
            collectSalaryFromForm();
            const name = prompt("Название ценовой группы:");
            if (!name || !name.trim()) return;
            salaryData.rates[name.trim()] = 0;
            renderSalaryAdmin();
        };
    }

    if ($("addCalculatorBtn")) {
        $("addCalculatorBtn").onclick = () => {
            collectDataFromForm();
            data.calculators.push({ title: "КАЛЬКУЛЯТОР РАССРОЧКИ", bank: "НОВЫЙ БАНК", rows: [["3 мес.", 0.95]] });
            renderAll();
        };
    }

    if ($("addMenuBtn")) {
        $("addMenuBtn").onclick = () => {
            collectDataFromForm();
            data.menu.push({ href: "#", icon: "🔗", title: "Новая карточка", desc: "Описание" });
            renderAll();
        };
    }

    if ($("addUserBtn")) {
        $("addUserBtn").onclick = () => {
            collectDataFromForm();
            data.users[`user${Object.keys(data.users).length + 1}`] = { name: "Новый пользователь", pass: "0000", manager: false };
            renderAll();
        };
    }

    if ($("addProductBtn")) {
        $("addProductBtn").onclick = () => {
            collectProductsFromForm();
            const groups = getProductGroups();
            products.push({ id: "", code: "", name: "Новый товар", group: groups[0] || "Новая группа", bonus: 0, plan: 0, sold: 0 });
            renderProducts();
        };
    }

    if ($("applyJsonBtn")) {
        $("applyJsonBtn").onclick = () => {
            try {
                data = normalizeSiteData(JSON.parse($("jsonEditor").value));
                renderAll();
                setStatus("JSON применён. Теперь можно сохранить в Firebase.", "ok");
            } catch {
                setStatus("Ошибка в JSON. Проверь запятые и кавычки.", "error");
            }
        };
    }

    document.body.addEventListener("input", (e) => {
        if (e.target.matches("[data-salary-rate], [data-salary-group], #salaryPeriod")) {
            collectSalaryFromForm();
            renderSalaryPreview();
        }
    });

    document.body.addEventListener("click", (e) => {
        if (e.target.matches("[data-remove-calc]")) {
            e.target.closest("[data-calc]").remove();
            collectDataFromForm();
            renderAll();
        }

        if (e.target.matches("[data-add-row]")) {
            e.target.previousElementSibling.insertAdjacentHTML("beforeend", rowTemplate());
        }

        if (e.target.matches("[data-remove-row]")) {
            e.target.closest("[data-calc-row]").remove();
            collectDataFromForm();
        }

        if (e.target.matches("[data-remove-menu]")) {
            e.target.closest("[data-menu]").remove();
            collectDataFromForm();
            renderAll();
        }

        if (e.target.matches("[data-remove-user]")) {
            e.target.closest("[data-user]").remove();
            collectDataFromForm();
            renderAll();
        }

        if (e.target.matches("[data-add-product-to-group]")) {
            collectProductsFromForm();
            products.push({ id: "", code: "", name: "Новый товар", group: e.target.dataset.addProductToGroup || "Новая группа", bonus: 0, plan: 0, sold: 0 });
            renderProducts();
        }

        if (e.target.matches("[data-remove-product]")) {
            const card = e.target.closest("[data-product]");
            if (card.dataset.id) deletedProductIds.push(card.dataset.id);
            card.remove();
            collectProductsFromForm();
            renderProducts();
        }

        if (e.target.matches("[data-remove-salary-group]")) {
            const row = e.target.closest("[data-salary-rate-row]");
            const group = row.querySelector("[data-salary-group]").value.trim();
            if (group && salaryData.rates[group] !== undefined) delete salaryData.rates[group];
            row.remove();
            collectSalaryFromForm();
            renderSalaryPreview();
        }
    });
}

injectSalaryAdminUI();
bindEvents();
loadData();
