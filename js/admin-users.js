import { db, COLLECTIONS } from './firebase.js';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, USER_GROUPS_COLLECTION } from './notify-service.js';

const USERS_COLLECTION = COLLECTIONS.users || 'autostyle_users';
const $ = s => document.querySelector(s);

let users = [];
let groups = [];
let adminUsersLoaded = false;
let adminUsersLoading = false;
let adminUsersBound = false;

function setStatus(text){
  const st = $('#adminUsersStatus');
  if (st) st.textContent = text || '';
}

function makeId(name){
  const clean = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return clean || ('group-' + Date.now());
}

function userName(u){ return u.name || u.displayName || u.fullName || u.email || 'Пользователь'; }
function userEmail(u){ return u.email || u.userEmail || ''; }
function userGroups(u){ return Array.isArray(u.groupIds) ? u.groupIds : (Array.isArray(u.groups) ? u.groups : []); }
function groupName(id){ return groups.find(g => g.id === id)?.name || id; }

async function loadUsers(){
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  users = snap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }));
}

async function loadGroups(){
  const snap = await getDocs(collection(db, USER_GROUPS_COLLECTION));
  groups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderGroupOptions(){
  const select = $('#adminAssignGroup');
  if (!select) return;
  select.innerHTML = groups.length
    ? groups.map(g => `<option value="${esc(g.id)}">${esc(g.name || g.id)}</option>`).join('')
    : '<option value="">Сначала создай группу</option>';
}

function renderGroups(){
  const box = $('#adminUserGroupsList');
  if (!box) return;
  box.innerHTML = groups.length ? groups.map(g => {
    const count = Array.isArray(g.userIds)
      ? g.userIds.length
      : users.filter(u => userGroups(u).includes(g.id)).length;
    return `<div class="admin-user-group-row">
      <div><b>${esc(g.name || g.id)}</b><small>ID: ${esc(g.id)}</small></div>
      <span class="admin-user-badge">${count} пользователей</span>
    </div>`;
  }).join('') : '<div class="muted">Групп пока нет.</div>';
}

function renderUsers(){
  const box = $('#adminUsersList');
  if (!box) return;
  box.innerHTML = users.length ? users.map(u => {
    const gids = userGroups(u);
    return `<div class="admin-user-row">
      <label>
        <input type="checkbox" class="admin-user-check" value="${esc(u.id)}">
        <span class="admin-user-main"><b>${esc(userName(u))}</b><small>${esc(userEmail(u) || u.id)}</small></span>
      </label>
      <div class="admin-user-badges">${gids.length ? gids.map(id => `<span class="admin-user-badge">${esc(groupName(id))}</span>`).join('') : '<small class="muted">Без группы</small>'}</div>
    </div>`;
  }).join('') : '<div class="muted">Пользователей пока нет.</div>';
}

async function refresh(force = false){
  if (adminUsersLoading) return;
  if (adminUsersLoaded && !force) return;
  adminUsersLoading = true;
  setStatus('Загружаем...');
  try {
    await Promise.all([loadUsers(), loadGroups()]);
    adminUsersLoaded = true;
    renderGroupOptions();
    renderGroups();
    renderUsers();
    setStatus('');
  } catch (e) {
    adminUsersLoaded = false;
    console.error('users/groups load error', e);
    setStatus('Ошибка загрузки: ' + (e.message || e));
  } finally {
    adminUsersLoading = false;
  }
}

async function createGroup(){
  const input = $('#adminUserGroupName');
  const name = input?.value?.trim() || '';
  if (!name) {
    setStatus('Напиши название группы.');
    input?.focus();
    return;
  }

  const btn = $('#adminCreateUserGroup');
  if (btn) btn.disabled = true;
  setStatus('Создаём группу...');

  try {
    const id = makeId(name);
    await setDoc(doc(db, USER_GROUPS_COLLECTION, id), {
      name,
      userIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    input.value = '';
    adminUsersLoaded = false;
    await refresh(true);
    setStatus('Группа создана.');
    window.dispatchEvent(new CustomEvent('autostyle:user-groups-changed'));
  } catch (e) {
    console.error('create group error', e);
    setStatus('Ошибка создания группы: ' + (e.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function assignSelected(){
  const groupId = $('#adminAssignGroup')?.value || '';
  const ids = [...document.querySelectorAll('.admin-user-check:checked')].map(x => x.value);

  if (!groupId) { setStatus('Выбери группу.'); return; }
  if (!ids.length) { setStatus('Выбери пользователей.'); return; }

  const btn = $('#adminAssignUsersToGroup');
  if (btn) btn.disabled = true;
  setStatus('Добавляем...');

  try {
    await setDoc(doc(db, USER_GROUPS_COLLECTION, groupId), {
      userIds: arrayUnion(...ids),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await Promise.all(ids.map(id => updateDoc(doc(db, USERS_COLLECTION, id), {
      groupIds: arrayUnion(groupId),
      updatedAt: serverTimestamp()
    }).catch(() => setDoc(doc(db, USERS_COLLECTION, id), {
      groupIds: arrayUnion(groupId),
      updatedAt: serverTimestamp()
    }, { merge: true }))));

    adminUsersLoaded = false;
    await refresh(true);
    setStatus('Пользователи добавлены в группу.');
    window.dispatchEvent(new CustomEvent('autostyle:user-groups-changed'));
  } catch (e) {
    console.error('assign users error', e);
    setStatus('Ошибка добавления: ' + (e.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bind(){
  if (adminUsersBound) return;
  adminUsersBound = true;

  document.addEventListener('click', e => {
    const createBtn = e.target.closest('#adminCreateUserGroup');
    if (createBtn) {
      e.preventDefault();
      e.stopPropagation();
      createGroup();
      return;
    }

    const assignBtn = e.target.closest('#adminAssignUsersToGroup');
    if (assignBtn) {
      e.preventDefault();
      e.stopPropagation();
      assignSelected();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target?.id === 'adminUserGroupName') {
      e.preventDefault();
      createGroup();
    }
  });

  window.addEventListener('autostyle:admin-section-open', e => {
    if (e?.detail?.section === 'users') refresh();
  });
}

function init(){
  bind();
  if (location.hash === '#users' || $('#users')?.classList.contains('active')) refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
