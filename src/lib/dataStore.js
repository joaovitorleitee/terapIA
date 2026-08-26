import { supabase } from './supabaseClient.js';
import storage from './storage.js';
import { jsPDF } from 'jspdf';

const SESSION_TIMEOUT_MS = 20 * 60 * 1000; // 20 min — inatividade (camada extra de segurança no cliente)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMS_VERSION = 'v1.0'; // versão vigente dos termos/política de privacidade (US-002)

async function fetchProfile(userId){
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if(error) return null;
  return {
    id: data.id, role: data.role, name: data.name, email: data.email,
    termsAcceptedAt: data.terms_accepted_at, termsVersion: data.terms_version,
  };
}
function hasValidConsent(user){
  return !!(user && user.termsAcceptedAt && user.termsVersion === TERMS_VERSION);
}
function formatDate(iso){
  try{
    return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }catch(e){ return iso; }
}
function formatDateOnly(iso){
  if(!iso) return '';
  try{
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }catch(e){ return iso; }
}

/* ---------- Patients storage (US-003) — mock, sem backend ---------- */
async function loadPatients(){
  try{
    const r = await storage.get('patients');
    let list = r && r.value ? JSON.parse(r.value) : [];
    if(list.length === 0){
      list = seedDemoPatients(list);
      savePatients(list); // fire-and-forget: garante que a semente exista independente da tela que carregou primeiro
    }
    return list;
  }catch(e){ return seedDemoPatients([]); }
}
async function savePatients(patients){
  try{
    await storage.set('patients', JSON.stringify(patients));
  }catch(e){ /* falha de storage não deve travar a tela */ }
}
function seedDemoPatients(patients){
  // Desativado: a partir da integração com Supabase Auth, os pacientes de demonstração (João/Ana)
  // já existem de verdade no banco, vinculados ao UUID real da Marina — não faz mais sentido
  // semear registros presos ao id fictício antigo ('demo-psi'), que nenhuma conta real usa.
  return patients;
}
const patientId = () => 'p_' + Math.random().toString(36).slice(2, 10);

/* ---------- Availability, blocks & sessions (US-006) — motor de conflitos ---------- */
const WEEKDAYS = [
  { key:'dom', label:'Domingo' }, { key:'seg', label:'Segunda' }, { key:'ter', label:'Terça' },
  { key:'qua', label:'Quarta' }, { key:'qui', label:'Quinta' }, { key:'sex', label:'Sexta' }, { key:'sab', label:'Sábado' },
];
function defaultAvailability(){
  const weeklyHours = {};
  WEEKDAYS.forEach(d => {
    weeklyHours[d.key] = (d.key==='dom' || d.key==='sab')
      ? { enabled:false, start:'08:00', end:'18:00' }
      : { enabled:true, start:'08:00', end:'18:00' };
  });
  return { weeklyHours, defaultDurationMin:50, bufferMin:10, minAdvanceHours:24, maxAdvanceDays:60, bookingMode:'auto' };
}
async function loadAvailability(psicologoId){
  try{
    const r = await storage.get('availability:'+psicologoId);
    return r && r.value ? JSON.parse(r.value) : defaultAvailability();
  }catch(e){ return defaultAvailability(); }
}
async function saveAvailability(psicologoId, availability){
  try{ await storage.set('availability:'+psicologoId, JSON.stringify(availability)); }catch(e){}
}
async function loadBlocks(){
  try{
    const r = await storage.get('blocks');
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveBlocks(blocks){
  try{ await storage.set('blocks', JSON.stringify(blocks)); }catch(e){}
}
async function loadSessions(){
  try{
    const r = await storage.get('sessions');
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveSessions(sessions){
  try{ await storage.set('sessions', JSON.stringify(sessions)); }catch(e){}
}
const blockId = () => 'b_' + Math.random().toString(36).slice(2, 10);
const sessionId = () => 's_' + Math.random().toString(36).slice(2, 10);
const DEFAULT_SESSION_PRICE = 150; // fallback absoluto se nenhuma configuração existir ainda
function formatCurrency(v){
  const n = Number(v)||0;
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

/* ---------- Theme color (US-031) ---------- */
const THEME_PALETTES = {
  green:  { label:'Verde',   swatch:'#3B6255', primary:'#3B6255', primaryDark:'#274238', primarySoft:'#DCE8E1' },
  pink:   { label:'Rosa',    swatch:'#A34B6B', primary:'#A34B6B', primaryDark:'#7A3350', primarySoft:'#F3DCE6' },
  blue:   { label:'Azul',    swatch:'#385A8C', primary:'#385A8C', primaryDark:'#24406A', primarySoft:'#DCE6F3' },
  yellow: { label:'Amarelo', swatch:'#9C7A1F', primary:'#9C7A1F', primaryDark:'#6E5714', primarySoft:'#F3ECD2' },
};
async function loadThemeColor(psicologoId){
  try{
    const r = await storage.get('themeColor:'+psicologoId);
    return (r && r.value && THEME_PALETTES[r.value]) ? r.value : 'green';
  }catch(e){ return 'green'; }
}
async function saveThemeColor(psicologoId, key){
  try{ await storage.set('themeColor:'+psicologoId, key); }catch(e){}
}
function applyTheme(key){
  const p = THEME_PALETTES[key] || THEME_PALETTES.green;
  const root = document.documentElement.style;
  root.setProperty('--primary', p.primary);
  root.setProperty('--primary-dark', p.primaryDark);
  root.setProperty('--primary-soft', p.primarySoft);
}

/* ---------- Pricing (US-014) ---------- */
function defaultPricing(){ return { presencial: DEFAULT_SESSION_PRICE, online: DEFAULT_SESSION_PRICE }; }
async function loadPricing(psicologoId){
  try{
    const r = await storage.get('pricing:'+psicologoId);
    return r && r.value ? JSON.parse(r.value) : defaultPricing();
  }catch(e){ return defaultPricing(); }
}
async function savePricing(psicologoId, pricing){
  try{ await storage.set('pricing:'+psicologoId, JSON.stringify(pricing)); }catch(e){}
}
function getDefaultPrice(pricing, patient, modalidade){
  if(patient && patient.customPrice !== undefined && patient.customPrice !== null && patient.customPrice !== ''){
    const n = Number(patient.customPrice);
    if(!isNaN(n)) return n;
  }
  const p = pricing || defaultPricing();
  return modalidade === 'Online' ? (p.online ?? DEFAULT_SESSION_PRICE) : (p.presencial ?? DEFAULT_SESSION_PRICE);
}

const toMinutes = (hhmm) => { const [h,m] = hhmm.split(':').map(Number); return h*60+m; };
const weekdayKeyOf = (dateStr) => WEEKDAYS[new Date(dateStr+'T00:00:00').getDay()].key;
const rangesOverlap = (aStart,aEnd,bStart,bEnd) => aStart < bEnd && bStart < aEnd;

function findBlockConflict(blocks, psicologoId, date, startTime, durationMin){
  const slotStart = toMinutes(startTime), slotEnd = slotStart + durationMin;
  return blocks.find(b => {
    if(b.psicologoId !== psicologoId) return false;
    if(b.type === 'horario_especifico'){
      if(b.date !== date) return false;
      return rangesOverlap(slotStart, slotEnd, toMinutes(b.startTime), toMinutes(b.endTime));
    }
    // feriado / ferias: bloqueio de dia inteiro dentro do intervalo
    return date >= b.startDate && date <= b.endDate;
  }) || null;
}
function findSessionConflict(sessions, psicologoId, date, startTime, durationMin, bufferMin, excludeId){
  const slotStart = toMinutes(startTime), slotEnd = slotStart + durationMin;
  return sessions.find(s => {
    if(s.psicologoId !== psicologoId || s.date !== date) return false;
    if(s.id === excludeId) return false;
    if(s.status === 'reagendada') return false; // reagendamentos sempre liberam o horário anterior
    if(s.status === 'cancelada' && !s.pendingRelease) return false; // cancelamento libera, salvo política de liberação manual
    const exStart = toMinutes(s.startTime) - bufferMin;
    const exEnd = toMinutes(s.startTime) + s.durationMin + bufferMin;
    return rangesOverlap(slotStart, slotEnd, exStart, exEnd);
  }) || null;
}
function isWithinWorkingHours(availability, date, startTime, durationMin){
  const day = availability.weeklyHours[weekdayKeyOf(date)];
  if(!day || !day.enabled) return false;
  const slotStart = toMinutes(startTime), slotEnd = slotStart + durationMin;
  return slotStart >= toMinutes(day.start) && slotEnd <= toMinutes(day.end);
}
function checkSlotAvailability({ availability, blocks, sessions, psicologoId, date, startTime, durationMin, excludeId }){
  if(!isWithinWorkingHours(availability, date, startTime, durationMin)){
    return { available:false, reason:'Fora do expediente configurado para este dia.' };
  }
  const block = findBlockConflict(blocks, psicologoId, date, startTime, durationMin);
  if(block){
    return { available:false, reason:`Horário bloqueado: ${block.label || (block.type==='feriado'?'feriado':'férias')}.` };
  }
  const conflict = findSessionConflict(sessions, psicologoId, date, startTime, durationMin, availability.bufferMin, excludeId);
  if(conflict){
    return { available:false, reason:`Conflito com outra sessão já confirmada às ${conflict.startTime} (considerando o intervalo de ${availability.bufferMin} min).` };
  }
  return { available:true, reason:null };
}
function isWithinAdvanceWindow(date, time, availability){
  const now = new Date();
  const slotDateTime = new Date(date+'T'+time+':00');
  const minAllowed = new Date(now.getTime() + availability.minAdvanceHours*3600*1000);
  const maxAllowed = new Date(now.getTime() + availability.maxAdvanceDays*24*3600*1000);
  return slotDateTime >= minAllowed && slotDateTime <= maxAllowed;
}
function listAvailableSlotsForDate(date, { availability, blocks, sessions, psicologoId }){
  const day = availability.weeklyHours[weekdayKeyOf(date)];
  if(!day || !day.enabled) return [];
  const dur = availability.defaultDurationMin;
  const out = [];
  for(let t = toMinutes(day.start); t + dur <= toMinutes(day.end); t += dur){
    const time = String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
    if(!isWithinAdvanceWindow(date, time, availability)) continue;
    const check = checkSlotAvailability({ availability, blocks, sessions, psicologoId, date, startTime:time, durationMin:dur });
    if(check.available) out.push(time);
  }
  return out;
}

/* ---------- Cancellation policy (US-029) ---------- */
function defaultCancelPolicy(){
  return { minHoursForFree:24, lateCancelCharge:'integral', lateCancelPercent:50, autoReleaseSlot:true };
}
async function loadCancelPolicy(psicologoId){
  try{
    const r = await storage.get('cancelPolicy:'+psicologoId);
    return r && r.value ? JSON.parse(r.value) : defaultCancelPolicy();
  }catch(e){ return defaultCancelPolicy(); }
}
async function saveCancelPolicy(psicologoId, policy){
  try{ await storage.set('cancelPolicy:'+psicologoId, JSON.stringify(policy)); }catch(e){}
}
function cancelPolicyText(policy){
  const chargeText = policy.lateCancelCharge === 'integral'
    ? 'cobrança integral da sessão'
    : policy.lateCancelCharge === 'parcial'
      ? `cobrança de ${policy.lateCancelPercent}% do valor da sessão`
      : 'nenhuma cobrança';
  return `Cancelamentos feitos com pelo menos ${policy.minHoursForFree}h de antecedência não geram cobrança. Cancelamentos fora desse prazo geram ${chargeText}. ${policy.autoReleaseSlot ? 'O horário é liberado automaticamente na agenda assim que o cancelamento é confirmado.' : 'O horário só é liberado na agenda após revisão do psicólogo.'}`;
}

/* ---------- In-app notifications (US-008, generalizado em US-011) ---------- */
async function loadNotificationsFor(ns, id){
  try{
    const r = await storage.get(ns+':'+id);
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveNotificationsFor(ns, id, list){
  try{ await storage.set(ns+':'+id, JSON.stringify(list)); }catch(e){}
}
async function pushNotificationFor(ns, id, notif){
  const list = await loadNotificationsFor(ns, id);
  list.unshift({ id:'n_'+Math.random().toString(36).slice(2,10), read:false, createdAt:new Date().toISOString(), ...notif });
  await saveNotificationsFor(ns, id, list);
}
// Compatibilidade com chamadas já existentes (psicólogo)
async function loadNotifications(psicologoId){ return loadNotificationsFor('notifications', psicologoId); }
async function saveNotifications(psicologoId, list){ return saveNotificationsFor('notifications', psicologoId, list); }
async function pushNotification(psicologoId, notif){ return pushNotificationFor('notifications', psicologoId, notif); }
// Notificações do paciente, indexadas pelo e-mail (disponível de imediato no login, sem precisar resolver o registro de paciente)
async function pushPatientNotification(email, notif){ return pushNotificationFor('patientNotifications', email.toLowerCase(), notif); }

/* ---------- Private notes & audit trail (US-010) ---------- */
async function loadNotes(){
  try{
    const r = await storage.get('notes');
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveNotes(notes){
  try{ await storage.set('notes', JSON.stringify(notes)); }catch(e){}
}
const noteId = () => 'note_' + Math.random().toString(36).slice(2, 10);

/* ---------- Homework tasks (US-011) ---------- */
async function loadTasks(){
  try{
    const r = await storage.get('tasks');
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveTasks(tasks){
  try{ await storage.set('tasks', JSON.stringify(tasks)); }catch(e){}
}
const taskId = () => 'task_' + Math.random().toString(36).slice(2, 10);

/* ---------- Charges / receivables (US-015) ---------- */
async function loadCharges(){
  try{
    const r = await storage.get('charges');
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveCharges(charges){
  try{ await storage.set('charges', JSON.stringify(charges)); }catch(e){}
}
const chargeId = () => 'ch_' + Math.random().toString(36).slice(2, 10);
const PAYMENT_METHODS = ['Pix', 'Cartão', 'Dinheiro', 'Transferência', 'Boleto', 'Outro'];

/* ---------- Receipts (US-018) ---------- */
async function loadReceipts(){
  try{
    const r = await storage.get('receipts');
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveReceipts(receipts){
  try{ await storage.set('receipts', JSON.stringify(receipts)); }catch(e){}
}
const receiptId = () => 'rcpt_' + Math.random().toString(36).slice(2, 10);

function downloadTextFallbackReceipt(receipt){
  const lines = [
    'RECIBO DE PAGAMENTO',
    `Nº ${receipt.number}${receipt.status==='cancelado' ? ' — CANCELADO' : ''}`,
    '',
    `Profissional: ${receipt.professionalName}`,
    `Paciente: ${receipt.patientName}`,
    `Serviço: ${receipt.service}`,
    `Data do atendimento: ${formatDateOnly(receipt.date)}`,
    `Valor: ${formatCurrency(receipt.amount)}`,
    `Status: ${receipt.status === 'cancelado' ? 'Cancelado' : 'Pago'}`,
    receipt.supersedes ? `Substitui recibo: ${receipt.supersedes}` : '',
    '',
    `Emitido em ${formatDate(receipt.issuedAt)} — documento de demonstração gerado no MVP (TerapIA).`,
  ].filter(Boolean);
  const blob = new Blob([lines.join('\n')], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `recibo-${receipt.number}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateReceiptPDF(receipt){
  try{
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Recibo de Pagamento', 20, 22);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Nº ${receipt.number}${receipt.status==='cancelado' ? '  —  CANCELADO' : ''}`, 20, 30);
    doc.setTextColor(20);
    doc.setFontSize(11);
    let y = 46;
    const line = (label, value) => { doc.text(`${label}: ${value}`, 20, y); y += 9; };
    line('Profissional', receipt.professionalName);
    line('Paciente', receipt.patientName);
    line('Serviço', receipt.service);
    line('Data do atendimento', formatDateOnly(receipt.date));
    line('Valor', formatCurrency(receipt.amount));
    line('Status', receipt.status === 'cancelado' ? 'Cancelado' : 'Pago');
    if(receipt.supersedes) line('Substitui recibo', receipt.supersedes);
    doc.setFontSize(8.5);
    doc.setTextColor(140);
    doc.text(`Emitido em ${formatDate(receipt.issuedAt)} — documento de demonstração gerado no MVP (TerapIA).`, 20, y + 8);

    // Download manual via Blob (mesmo mecanismo já comprovado na exportação de prontuário, US-010).
    // Evita o método .save() interno do jsPDF, que em alguns navegadores tenta abrir nova aba
    // e pode falhar dentro do iframe restrito do artefato.
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recibo-${receipt.number}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }catch(e){
    try{ downloadTextFallbackReceipt(receipt); return true; }catch(e2){ return false; }
  }
}

async function loadAuditLog(){
  try{
    const r = await storage.get('auditLog');
    return r && r.value ? JSON.parse(r.value) : [];
  }catch(e){ return []; }
}
async function saveAuditLog(list){
  try{ await storage.set('auditLog', JSON.stringify(list)); }catch(e){}
}
// IMPORTANTE: nunca gravar texto/conteúdo da nota aqui — só metadados (ação, quem, quando, paciente).
async function pushAudit(entry){
  const list = await loadAuditLog();
  list.unshift({ id:'a_'+Math.random().toString(36).slice(2,10), timestamp:new Date().toISOString(), ...entry });
  await saveAuditLog(list);
}

/* ---------- Date helpers (US-005) ---------- */
const DOW_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function toDateStr(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fromDateStr(s){ return new Date(s+'T00:00:00'); }
function addDays(dateStr, n){ const d = fromDateStr(dateStr); d.setDate(d.getDate()+n); return toDateStr(d); }
function startOfWeek(dateStr){ const d = fromDateStr(dateStr); d.setDate(d.getDate()-d.getDay()); return toDateStr(d); }
function todayStr(){ return toDateStr(new Date()); }
function generateSlots(startH, endH, stepMin){
  const out = [];
  for(let m = startH*60; m < endH*60; m += stepMin){
    out.push(String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'));
  }
  return out;
}
function computeSlotStatus(date, time, ctx){
  const { availability, blocks, sessions, psicologoId, stepMin } = ctx;
  const covering = sessions.find(s => {
    if(s.psicologoId !== psicologoId || s.date !== date) return false;
    const st = toMinutes(s.startTime), en = st + s.durationMin, t = toMinutes(time);
    return t >= st && t < en;
  });
  if(covering) return { kind:'sessao', session: covering };
  if(!isWithinWorkingHours(availability, date, time, stepMin)) return { kind:'fora' };
  const block = findBlockConflict(blocks, psicologoId, date, time, stepMin);
  if(block) return { kind:'bloqueado', label: block.label };
  return { kind:'livre' };
}

/* ---------- Terms modal ---------- */

export {
  SESSION_TIMEOUT_MS, EMAIL_RE, TERMS_VERSION,
  fetchProfile, hasValidConsent, formatDate, formatDateOnly,
  loadPatients, savePatients, seedDemoPatients, patientId,
  WEEKDAYS, defaultAvailability, loadAvailability, saveAvailability,
  loadBlocks, saveBlocks, blockId, loadSessions, saveSessions, sessionId,
  DEFAULT_SESSION_PRICE, formatCurrency,
  THEME_PALETTES, loadThemeColor, saveThemeColor, applyTheme,
  defaultPricing, loadPricing, savePricing, getDefaultPrice,
  findBlockConflict, findSessionConflict, isWithinWorkingHours, checkSlotAvailability,
  isWithinAdvanceWindow, listAvailableSlotsForDate, toMinutes, weekdayKeyOf, rangesOverlap,
  defaultCancelPolicy, loadCancelPolicy, saveCancelPolicy, cancelPolicyText,
  loadNotificationsFor, saveNotificationsFor, pushNotificationFor,
  loadNotifications, saveNotifications, pushNotification, pushPatientNotification,
  loadNotes, saveNotes, noteId, loadTasks, saveTasks, taskId,
  loadCharges, saveCharges, chargeId, PAYMENT_METHODS, loadReceipts, saveReceipts, receiptId,
  downloadTextFallbackReceipt, generateReceiptPDF,
  loadAuditLog, saveAuditLog, pushAudit,
  DOW_SHORT, MONTH_NAMES, toDateStr, fromDateStr, addDays, startOfWeek, todayStr,
  generateSlots, computeSlotStatus,
};
