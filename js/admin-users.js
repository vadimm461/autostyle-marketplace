import { db, COLLECTIONS } from './firebase.js';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { esc, USER_GROUPS_COLLECTION } from './notify-service.js';

const USERS_COLLECTION = COLLECTIONS.users || 'autostyle_users';
const $ = s => document.querySelector(s);

let users = [];
let groups = [];
let usersFilter = 'all';
let usersSearch = '';

function makeId(name){
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g,'e')
    .replace(/[^a-z0-9а-я]+/gi,'-')
    .replace(/^-+|-+$/g,'') || ('group-' + Date.now());
}
function userName(u){ return u.name || u.displayName || u.fullName || u.email || 'Пользователь'; }
function userEmail(u){ return u.email || u.userEmail || ''; }
function userGroups(u){ return Array.isArray(u.groupIds) ? u.groupIds : (Array.isArray(u.groups) ? u.groups : []); }
function groupName(id){ return groups.find(g => g.id === id)?.name || id; }

async function loadUsers(){
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  users = snap.docs.map(d => ({ id:d.id, uid:d.id, ...d.data() }));
}
async function loadGroups(){
  try{
    const snap = await getDocs(collection(db, USER_GROUPS_COLLECTION));
    groups = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  }catch(e){
    console.warn('groups load error', e);
    groups = [];
  }
}
function renderGroupOptions(){
  const assign = $('#adminAssignGroup');
  const filter = $('#adminUsersGroupFilter');
  const groupOptions = groups.map(g => `<option value="${esc(g.id)}">${esc(g.name || g.id)}</option>`).join('');

  if (assign) {
    assign.innerHTML = groups.length ? groupOptions : '<option value="">Сначала создай группу</option>';
  }

  if (filter) {
    const current = filter.value || usersFilter || 'all';
    filter.innerHTML = `<option value="all">Все пользователи</option><option value="none">Без группы</option>${groupOptions}`;
    filter.value = [...filter.options].some(o => o.value === current) ? current : 'all';
    usersFilter = filter.value;
  }
}
function renderGroups(){
  const box = $('#adminUserGroupsList');
  if (!box) return;
  box.innerHTML = groups.length ? groups.map(g => {
    const count = Array.isArray(g.userIds) ? g.userIds.length : users.filter(u => userGroups(u).includes(g.id)).length;
    return `<div class="admin-user-group-row"><div><b>${esc(g.name || g.id)}</b><small>ID: ${esc(g.id)}</small></div><span class="admin-user-badge">${count} пользователей</span></div>`;
  }).join('') : '<div class="muted">Групп пока нет.</div>';
}
function filteredUsers(){
  const q = String(usersSearch || '').trim().toLowerCase();
  return users.filter(u => {
    const gids = userGroups(u);
    const byGroup = usersFilter === 'all'
      || (usersFilter === 'none' && !gids.length)
      || gids.includes(usersFilter);
    if (!byGroup) return false;
    if (!q) return true;
    const haystack = [userName(u), userEmail(u), u.phone, u.tel, u.city, u.id].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

function renderUsers(){
  const box = $('#adminUsersList');
  const count = $('#adminUsersCount');
  if (!box) return;

  const list = filteredUsers();
  if (count) count.textContent = `(${list.length} из ${users.length})`;

  box.innerHTML = list.length ? list.map(u => {
    const gids = userGroups(u);
    return `<div class="admin-user-row" data-user-id="${esc(u.id)}">
      <label>
        <input type="checkbox" class="admin-user-check" value="${esc(u.id)}">
        <span class="admin-user-main"><b>${esc(userName(u))}</b><small>${esc(userEmail(u) || u.id)}</small></span>
      </label>
      <div class="admin-user-badges">${gids.length ? gids.map(id => `<span class="admin-user-badge">${esc(groupName(id))}</span>`).join('') : '<small class="muted">Без группы</small>'}</div>
    </div>`;
  }).join('') : '<div class="muted">По этому фильтру пользователей нет.</div>';
}
async function refresh(){
  const status = $('#adminUsersStatus');
  if (status) status.textContent = 'Загружаем...';
  await Promise.all([loadUsers(), loadGroups()]);
  renderGroupOptions();
  renderGroups();
  renderUsers();
  if (status) status.textContent = '';
}
async function createGroup(){
  const input = $('#adminUserGroupName');
  const status = $('#adminUsersStatus');
  const name = input?.value.trim();
  if (!name) { if (status) status.textContent = 'Напиши название группы.'; return; }
  const id = makeId(name);
  await setDoc(doc(db, USER_GROUPS_COLLECTION, id), {
    name,
    userIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge:true });
  input.value = '';
  if (status) status.textContent = 'Группа создана.';
  await refresh();
}
async function assignSelected(){
  const groupId = $('#adminAssignGroup')?.value;
  const status = $('#adminUsersStatus');
  const ids = [...document.querySelectorAll('.admin-user-check:checked')].map(x => x.value);
  if (!groupId) { if (status) status.textContent = 'Выбери группу.'; return; }
  if (!ids.length) { if (status) status.textContent = 'Выбери пользователей.'; return; }
  if (status) status.textContent = 'Добавляем...';
  await setDoc(doc(db, USER_GROUPS_COLLECTION, groupId), {
    userIds: arrayUnion(...ids),
    updatedAt: serverTimestamp()
  }, { merge:true });
  await Promise.all(ids.map(id => updateDoc(doc(db, USERS_COLLECTION, id), {
    groupIds: arrayUnion(groupId),
    updatedAt: serverTimestamp()
  }).catch(async () => setDoc(doc(db, USERS_COLLECTION, id), { groupIds: arrayUnion(groupId), updatedAt: serverTimestamp() }, { merge:true }))));
  if (status) status.textContent = 'Пользователи добавлены в группу.';
  await refresh();
}

async function moveSelected(){
  const groupId = $('#adminAssignGroup')?.value;
  const status = $('#adminUsersStatus');
  const ids = [...document.querySelectorAll('.admin-user-check:checked')].map(x => x.value);
  if (!groupId) { if (status) status.textContent = 'Выбери группу.'; return; }
  if (!ids.length) { if (status) status.textContent = 'Выбери пользователей.'; return; }

  if (status) status.textContent = 'Перемещаем...';

  await Promise.all(groups.map(g => {
    const ref = doc(db, USER_GROUPS_COLLECTION, g.id);
    if (g.id === groupId) {
      return setDoc(ref, { userIds: arrayUnion(...ids), updatedAt: serverTimestamp() }, { merge:true });
    }
    return setDoc(ref, { userIds: arrayRemove(...ids), updatedAt: serverTimestamp() }, { merge:true });
  }));

  await Promise.all(ids.map(id => setDoc(doc(db, USERS_COLLECTION, id), {
    groupIds: [groupId],
    updatedAt: serverTimestamp()
  }, { merge:true })));

  if (status) status.textContent = 'Пользователи перемещены в группу.';
  await refresh();
}

function selectShownUsers(){
  document.querySelectorAll('#adminUsersList .admin-user-check').forEach(ch => ch.checked = true);
}

function clearSelectedUsers(){
  document.querySelectorAll('#adminUsersList .admin-user-check').forEach(ch => ch.checked = false);
}
let adminUsersBound = false;
let adminUsersLoaded = false;

function bind(){
  if (adminUsersBound || !$('#users')) return;
  adminUsersBound = true;
  $('#adminCreateUserGroup')?.addEventListener('click', createGroup);
  $('#adminAssignUsersToGroup')?.addEventListener('click', assignSelected);
  $('#adminMoveUsersToGroup')?.addEventListener('click', moveSelected);
  $('#adminUsersGroupFilter')?.addEventListener('change', e => { usersFilter = e.target.value || 'all'; renderUsers(); });
  $('#adminUsersSearch')?.addEventListener('input', e => { usersSearch = e.target.value || ''; renderUsers(); });
  $('#adminUsersSelectAll')?.addEventListener('click', selectShownUsers);
  $('#adminUsersClearSelection')?.addEventListener('click', clearSelectedUsers);
}

async function openUsersSection(force = false){
  bind();
  if (!$('#users')) return;
  if (adminUsersLoaded && !force) return;
  adminUsersLoaded = true;
  await refresh().catch(e => {
    adminUsersLoaded = false;
    const st=$('#adminUsersStatus');
    if(st) st.textContent='Ошибка: '+(e.message||e);
  });
}

function init(){
  bind();
  window.addEventListener('autostyle:admin-section-open', e => {
    if (e?.detail?.section === 'users') openUsersSection();
  });
  if (location.hash === '#users') openUsersSection();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
