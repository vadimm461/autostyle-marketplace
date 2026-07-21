
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const config = {
  apiKey: "AIzaSyBZ-AW6XoMR14KmBtlz2q06Z0jPGXnWMTw",
  authDomain: "auto-style-4dbb7.firebaseapp.com",
  projectId: "auto-style-4dbb7",
  storageBucket: "auto-style-4dbb7.firebasestorage.app",
  messagingSenderId: "217023127803",
  appId: "1:217023127803:web:78568cf161edd452b0905e"
};

const app = getApps().length ? getApp() : initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const permission = {
  key: "staffCalculators",
  title: "Калькуляторы рассрочки",
  href: "staff-tools/calculators.html",
  desc: "Расчёт рассрочки Агропромбанк, Эксимбанк и Сбербанк"
};

function addWorkspaceCard(profile = {}) {
  const allowed =
    profile.role === "admin" ||
    profile.permissions?.[permission.key] === true;

  if (!allowed) return;

  const grid = document.getElementById("staffWorkspaceGrid");
  if (!grid || grid.querySelector(`[href="${permission.href}"]`)) return;

  const card = document.createElement("a");
  card.className = "staff-tool-card";
  card.href = permission.href;
  card.innerHTML = `
    <b>${permission.title}</b>
    <small>${permission.desc}</small>
    <em>Открыть раздел →</em>
  `;
  grid.appendChild(card);

  const tab = document.getElementById("staffWorkspaceTab");
  if (tab) tab.hidden = false;

  const empty = document.getElementById("staffWorkspaceEmpty");
  if (empty) empty.hidden = true;
}

function addAccessCheckboxes() {
  document.querySelectorAll(".access-user-card").forEach((card) => {
    if (card.querySelector(`[data-permission="${permission.key}"]`)) return;

    const permissions = card.querySelector(".access-permissions");
    if (!permissions) return;

    const user = (window.__accessUsers || [])
      .find((item) => item.uid === card.dataset.uid);

    const label = document.createElement("label");
    label.className = "access-permission";
    label.innerHTML = `
      <input type="checkbox"
             data-permission="${permission.key}"
             ${user?.permissions?.[permission.key] === true ? "checked" : ""}>
      <span>
        <b>${permission.title}</b><br>
        ${permission.desc}
      </span>
    `;
    permissions.appendChild(label);
  });
}

const observer = new MutationObserver(() => addAccessCheckboxes());
observer.observe(document.documentElement, { childList: true, subtree: true });

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const snapshot = await getDoc(doc(db, "autostyle_users", user.uid));
    const profile = snapshot.exists() ? snapshot.data() : {};
    addWorkspaceCard(profile);
    addAccessCheckboxes();
  } catch (error) {
    console.error("Не удалось добавить доступ к калькуляторам:", error);
  }
});
