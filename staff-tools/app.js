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
        { href: "close-shift.html", icon: "📊", title: "Закрытие смен", desc: "Ссылка на отчет по закрытию смены", managerOnly: true },
        { href: "cash-diff.html", icon: "💰", title: "Расхождение по кассе", desc: "Контроль расхождения наличности.", managerOnly: true },
        { href: "#", icon: "🚪", title: "Выход", desc: "Завершить текущую сессию пользователя.", action: "logout" }
    ]
};

let appData = clone(fallbackData);
let timerInterval = null;
const $ = (id) => document.getElementById(id);

function withTimeout(promise, ms = 7000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase timeout")), ms))
    ]);
}

function normalizeRows(rows) {
    return (rows || []).map(row => {
        if (Array.isArray(row)) return [row[0], Number(row[1])];
        return [row.term || row.title || "", Number(row.coef ?? row.value ?? 0)];
    }).filter(row => row[0] && !Number.isNaN(row[1]));
}

function normalizeAppData(rawData) {
    const result = { ...clone(fallbackData), ...(rawData || {}) };

    result.calculators = (result.calculators || []).map(calc => ({
        ...calc,
        rows: normalizeRows(calc.rows)
    }));

    return result;
}

async function getFirebaseConfig() {
    try {
        const module = await import("./firebase-config.js?ts=" + Date.now());
        const config = module.firebaseConfig || {};
        if (!config.apiKey || String(config.apiKey).includes("PASTE_")) return null;
        return config;
    } catch (error) {
        console.warn("firebase-config.js не загружен, используется локальный fallback", error);
        return null;
    }
}

async function loadData() {
    const config = await getFirebaseConfig();
    if (!config) return clone(fallbackData);

    try {
        const [{ initializeApp }, { getFirestore, doc, getDoc }] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
            import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
        ]);

        const firebaseApp = initializeApp(config);
        const db = getFirestore(firebaseApp);
        const snapshot = await withTimeout(getDoc(doc(db, "site", "main")));

        return snapshot.exists() ? normalizeAppData(snapshot.data()) : clone(fallbackData);
    } catch (error) {
        console.warn("Firebase недоступен, используется локальный fallback:", error);
        return clone(fallbackData);
    }
}

function renderLoginUsers() {
    if (!$('userSelect')) return;

    $("userSelect").innerHTML = Object.entries(appData.users || fallbackData.users)
        .map(([key, user]) => `<option value="${key}">${user.name}</option>`)
        .join("");
}

function renderNews() {
    const container = $("newsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="news-banner">
            <div class="news-left">
                <div class="news-badge">${appData.news.badge}</div>
                <div class="news-title">${appData.news.title}</div>
                <div class="news-text">${appData.news.text}</div>
            </div>
            <div class="news-timer">
                <div class="timer-label">СТАРТ ЧЕРЕЗ</div>
                <div class="days" id="days">--д 00:00:00</div>
            </div>
        </div>
    `;
}

function renderCalculators() {
    const container = $("calculatorsContainer");
    if (!container) return;

    container.innerHTML = (appData.calculators || []).map(calc => `
        <div class="calculator">
            <div class="calc-title">${calc.title}</div>
            <div class="calc-subtitle">${calc.bank}</div>
            <input type="number" class="sum">
            <button class="btn btn-calc">РАССЧИТАТЬ</button>
            <table>
                ${normalizeRows(calc.rows).map(([term, coef]) => `
                    <tr>
                        <td>${term}</td>
                        <td class="coef">${coef}</td>
                        <td class="result"></td>
                    </tr>
                `).join("")}
            </table>
        </div>
    `).join("");
}

function renderMenu(isManager = false) {
    const grid = $("menuGrid");
    if (!grid) return;

    grid.innerHTML = (appData.menu || [])
        .filter(item => !item.managerOnly || isManager)
        .map(item => `
            <a href="${item.href}" class="menu-card" ${item.action ? `data-action="${item.action}"` : ""}>
                <div class="menu-icon">${item.icon}</div>
                <div class="menu-title">${item.title}</div>
                <div class="menu-desc">${item.desc}</div>
            </a>
        `).join("");
}

function bindCalculators() {
    document.querySelectorAll(".calculator").forEach(calc => {
        calc.querySelector(".btn-calc").onclick = () => {
            const sum = parseFloat(calc.querySelector(".sum").value);
            if (isNaN(sum)) return;

            calc.querySelectorAll(".coef").forEach((coef, i) => {
                const value = sum / parseFloat(coef.textContent);
                calc.querySelectorAll(".result")[i].textContent = value.toLocaleString("ru-RU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            });
        };
    });
}

function bindMenu() {
    const grid = $("menuGrid");
    if (!grid) return;

    grid.addEventListener("click", (event) => {
        const card = event.target.closest("[data-action='logout']");
        if (!card) return;

        event.preventDefault();
        logout();
    });
}

function login() {
    const userKey = $("userSelect").value;
    const user = (appData.users || fallbackData.users)[userKey];

    if (!user || $("passwordInput").value !== user.pass) {
        $("errorMsg").textContent = "Неверный пароль";
        return;
    }

    const expire = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem("session", JSON.stringify({
        key: userKey,
        name: user.name,
        manager: !!user.manager,
        expire
    }));

    openApp(user.name, !!user.manager);
}

function openApp(name, isManager = false) {
    $("loginScreen").style.display = "none";
    $("app").style.display = "block";
    $("currentUser").innerHTML = "👤 " + name;
    renderMenu(isManager);
}

function logout() {
    localStorage.removeItem("session");
    location.reload();
}

function updateTimer() {
    const endDate = new Date(appData.news.endDate).getTime();
    const diff = endDate - Date.now();
    const el = $("days");

    if (!el) return;

    if (!endDate || diff <= 0) {
        el.innerHTML = "СТАРТ";
        return;
    }

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff / 3600000) % 24);
    const minutes = Math.floor((diff / 60000) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    el.innerHTML = `${days}д ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startTimer() {
    clearInterval(timerInterval);
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

async function init() {
    try {
        renderLoginUsers();
        appData = await loadData();
        renderLoginUsers();
        renderNews();
        renderCalculators();
        renderMenu(false);
        bindCalculators();
        bindMenu();
        startTimer();

        const session = JSON.parse(localStorage.getItem("session"));
        if (session && session.expire > Date.now()) {
            openApp(session.name, !!session.manager);
        }

        $("loginBtn").onclick = login;
        $("passwordInput").addEventListener("keyup", e => {
            if (e.key === "Enter") login();
        });
    } catch (error) {
        console.error("Ошибка запуска сайта:", error);
        alert("Ошибка запуска сайта. Проверь firebase-config.js и консоль браузера.");
    }
}

window.logout = logout;
init();
