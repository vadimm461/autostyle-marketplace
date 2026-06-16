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
    const count = Array.isArray(g.userIds) ? g.userIds.length : users.filter(u => userGroups(u).includes(g.id)).length;
    return `<div class="admin-user-group-row"><div><b>${esc(g.name || g.id)}</b><small>ID: ${esc(g.id)}</small></div><span class="admin-user-badge">${count} пользователей</span></div>`;
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
function bind(){
  if (!$('#users')) return;
  $('#adminCreateUserGroup')?.addEventListener('click', createGroup);
  $('#adminAssignUsersToGroup')?.addEventListener('click', assignSelected);
  refresh().catch(e => { const st=$('#adminUsersStatus'); if(st) st.textContent='Ошибка: '+(e.message||e); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
