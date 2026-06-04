import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const SETTINGS = COLLECTIONS.settings || 'autostyle_settings';
const defaults = {
  companyTitle:'AutoStyle',
  companyLinks:'Контакты|contacts.html\nПро нас|about.html\nАдреса|contacts.html#addresses',
  buyerTitle:'Покупателям',
  buyerLinks:'Рассрочка|installment.html\nПодарочные сертификаты|certificates.html\nСкидочная карта|profile.html#discount-card',
  infoTitle:'Информация',
  infoLinks:'Профиль|profile.html\nИзбранное|favorites.html\nКорзина|cart.html',
  instagram:'https://www.instagram.com/d.vadim.v/'
};
function toText(v, fallback){ if(Array.isArray(v)) return v.map(x=>`${x.text}|${x.url}`).join('\n'); return v || fallback; }
function parse(v){ return String(v||'').split('\n').map(r=>{const [text,url]=r.split('|').map(x=>(x||'').trim());return {text,url};}).filter(x=>x.text&&x.url); }
async function init(){
  const settings = document.getElementById('settings'); if(!settings || document.getElementById('footerSettingsCard')) return;
  settings.insertAdjacentHTML('beforeend', `<div class="admin-card" id="footerSettingsCard"><h2>Вкладки футера</h2><p class="muted">Редактируйте ссылки в формате: Название|url. Каждая ссылка с новой строки.</p><form id="footerSettingsForm" class="grid2">
    <label class="field">Заголовок компании<input id="footerCompanyTitle"></label>
    <label class="field">Заголовок покупателей<input id="footerBuyerTitle"></label>
    <label class="field" style="grid-column:1/-1">Ссылки компании<textarea id="footerCompanyLinks" rows="4"></textarea></label>
    <label class="field" style="grid-column:1/-1">Ссылки покупателям / рассрочка и т.д.<textarea id="footerBuyerLinks" rows="5"></textarea></label>
    <label class="field">Заголовок информации<input id="footerInfoTitle"></label>
    <label class="field">Instagram<input id="footerInstagram"></label>
    <label class="field" style="grid-column:1/-1">Информационные ссылки<textarea id="footerInfoLinks" rows="4"></textarea></label>
    <button class="primary">Сохранить футер</button><span id="footerSettingsMsg" class="muted"></span>
  </form></div>`);
  const snap = await getDoc(doc(db, SETTINGS, 'footerLinks')).catch(()=>null);
  const data = snap?.exists() ? snap.data() : {};
  footerCompanyTitle.value = data.companyTitle || defaults.companyTitle;
  footerBuyerTitle.value = data.buyerTitle || defaults.buyerTitle;
  footerCompanyLinks.value = toText(data.companyLinks, defaults.companyLinks);
  footerBuyerLinks.value = toText(data.buyerLinks, defaults.buyerLinks);
  footerInfoTitle.value = data.infoTitle || defaults.infoTitle;
  footerInfoLinks.value = toText(data.infoLinks, defaults.infoLinks);
  footerInstagram.value = data.instagram || defaults.instagram;
  footerSettingsForm.onsubmit = async e => { e.preventDefault(); footerSettingsMsg.textContent='Сохраняю...'; await setDoc(doc(db, SETTINGS, 'footerLinks'), {companyTitle:footerCompanyTitle.value.trim(), buyerTitle:footerBuyerTitle.value.trim(), infoTitle:footerInfoTitle.value.trim(), instagram:footerInstagram.value.trim(), companyLinks:parse(footerCompanyLinks.value), buyerLinks:parse(footerBuyerLinks.value), infoLinks:parse(footerInfoLinks.value), updatedAt:new Date().toISOString()}, {merge:true}); footerSettingsMsg.textContent='Сохранено'; };
}
init();
