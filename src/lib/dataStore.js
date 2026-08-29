import { supabase } from './supabaseClient.js';
import { jsPDF } from 'jspdf';

const SESSION_TIMEOUT_MS = 20 * 60 * 1000; // 20 min — inatividade (camada extra de segurança no cliente)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMS_VERSION = 'v1.0'; // versão vigente dos termos/política de privacidade

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
}));

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
function logDbError(where, error){
  if(error) console.error(`[dataStore] ${where}:`, error.message || error);
}

/* ================= Pacientes ================= */
function rowToPatient(r){
  return {
    id: r.id, psicologoId: r.psicologo_id, linkedUserId: r.linked_user_id,
    name: r.name, socialName: r.social_name || '', email: r.email, phone: r.phone || '',
    birthDate: r.birth_date || '', cpf: r.cpf || '', emergencyContact: r.emergency_contact || '',
    address: r.address || '', notes: r.notes || '',
    customPrice: r.custom_price === null ? '' : r.custom_price,
    status: r.status, createdAt: r.created_at,
  };
}
function patientToRow(p){
  return {
    id: p.id, psicologo_id: p.psicologoId, name: p.name, social_name: p.socialName || null,
    email: p.email, phone: p.phone || null, birth_date: p.birthDate || null, cpf: p.cpf || null,
    emergency_contact: p.emergencyContact || null, address: p.address || null, notes: p.notes || null,
    custom_price: (p.customPrice === '' || p.customPrice === undefined || p.customPrice === null) ? null : Number(p.customPrice),
    status: p.status || 'ativo',
  };
}
async function loadPatients(){
  const { data, error } = await supabase.from('patients').select('*').order('created_at', { ascending:false });
  logDbError('loadPatients', error);
  return data ? data.map(rowToPatient) : [];
}
async function savePatients(patients){
  if(!patients.length) return;
  const { error } = await supabase.from('patients').upsert(patients.map(patientToRow), { onConflict:'id' });
  logDbError('savePatients', error);
}
const patientId = uuid;

/* ================= Disponibilidade, bloqueios e sessões — motor de conflitos ================= */
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
  const { data, error } = await supabase.from('availability').select('*').eq('psicologo_id', psicologoId).maybeSingle();
  logDbError('loadAvailability', error);
  if(!data) return defaultAvailability();
  return {
    weeklyHours: data.weekly_hours, defaultDurationMin: data.default_duration_min, bufferMin: data.buffer_min,
    minAdvanceHours: data.min_advance_hours, maxAdvanceDays: data.max_advance_days, bookingMode: data.booking_mode,
  };
}
async function saveAvailability(psicologoId, availability){
  const row = {
    psicologo_id: psicologoId, weekly_hours: availability.weeklyHours,
    default_duration_min: availability.defaultDurationMin, buffer_min: availability.bufferMin,
    min_advance_hours: availability.minAdvanceHours, max_advance_days: availability.maxAdvanceDays,
    booking_mode: availability.bookingMode, updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('availability').upsert(row, { onConflict:'psicologo_id' });
  logDbError('saveAvailability', error);
}

function rowToBlock(r){
  return { id:r.id, psicologoId:r.psicologo_id, type:r.type, date:r.date, startDate:r.start_date, endDate:r.end_date, startTime:r.start_time, endTime:r.end_time, label:r.label };
}
function blockToRow(b){
  return {
    id:b.id, psicologo_id:b.psicologoId, type:b.type, date:b.date || null,
    start_date:b.startDate || null, end_date:b.endDate || null,
    start_time:b.startTime || null, end_time:b.endTime || null, label:b.label || null,
  };
}
async function loadBlocks(){
  const { data, error } = await supabase.from('blocks').select('*');
  logDbError('loadBlocks', error);
  return data ? data.map(rowToBlock) : [];
}
async function saveBlocks(blocks){
  // Sincroniza a lista inteira: cria/atualiza os que existem, remove do banco os que saíram da lista
  // (é a única entidade do sistema com remoção real, por isso o diff explícito).
  const existing = await loadBlocks();
  const keepIds = new Set(blocks.map(b => b.id));
  const toDelete = existing.filter(e => !keepIds.has(e.id)).map(e => e.id);
  if(blocks.length){
    const { error } = await supabase.from('blocks').upsert(blocks.map(blockToRow), { onConflict:'id' });
    logDbError('saveBlocks upsert', error);
  }
  if(toDelete.length){
    const { error } = await supabase.from('blocks').delete().in('id', toDelete);
    logDbError('saveBlocks delete', error);
  }
}

function rowToSession(r){
  return {
    id:r.id, psicologoId:r.psicologo_id, patientId:r.patient_id, date:r.date, startTime:r.start_time,
    durationMin:r.duration_min, modalidade:r.modalidade, status:r.status, valor: Number(r.valor),
    reason:r.reason, cancelledAt:r.cancelled_at, cancelledBy:r.cancelled_by, pendingRelease:r.pending_release,
    isLateCancel: r.is_late_cancel, chargeType:r.charge_type, chargePercent:r.charge_percent,
    rescheduledAt:r.rescheduled_at, rescheduledBy:r.rescheduled_by, rescheduledToId:r.rescheduled_to_id,
    rescheduledFromId:r.rescheduled_from_id, createdAt:r.created_at,
  };
}
function sessionToRow(s){
  return {
    id:s.id, psicologo_id:s.psicologoId, patient_id:s.patientId, date:s.date, start_time:s.startTime,
    duration_min:s.durationMin, modalidade:s.modalidade || 'Presencial', status:s.status || 'confirmada',
    valor:s.valor || 0, reason:s.reason || null, cancelled_at:s.cancelledAt || null, cancelled_by:s.cancelledBy || null,
    pending_release: !!s.pendingRelease, is_late_cancel: s.isLateCancel ?? null,
    charge_type: s.chargeType || null, charge_percent: s.chargePercent ?? null,
    rescheduled_at:s.rescheduledAt || null, rescheduled_by:s.rescheduledBy || null,
    rescheduled_to_id:s.rescheduledToId || null, rescheduled_from_id:s.rescheduledFromId || null,
  };
}
async function loadSessions(){
  const { data, error } = await supabase.from('sessions').select('*');
  logDbError('loadSessions', error);
  return data ? data.map(rowToSession) : [];
}
async function saveSessions(sessions){
  if(!sessions.length) return;
  const { error } = await supabase.from('sessions').upsert(sessions.map(sessionToRow), { onConflict:'id' });
  logDbError('saveSessions', error);
}
const blockId = uuid;
const sessionId = uuid;
const DEFAULT_SESSION_PRICE = 150; // fallback absoluto se nenhuma configuração existir ainda
function formatCurrency(v){
  const n = Number(v)||0;
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

/* ================= Cor de tema do consultório ================= */
const THEME_PALETTES = {
  green:  { label:'Verde',   swatch:'#3B6255', primary:'#3B6255', primaryDark:'#274238', primarySoft:'#DCE8E1' },
  pink:   { label:'Rosa',    swatch:'#A34B6B', primary:'#A34B6B', primaryDark:'#7A3350', primarySoft:'#F3DCE6' },
  blue:   { label:'Azul',    swatch:'#385A8C', primary:'#385A8C', primaryDark:'#24406A', primarySoft:'#DCE6F3' },
  yellow: { label:'Amarelo', swatch:'#9C7A1F', primary:'#9C7A1F', primaryDark:'#6E5714', primarySoft:'#F3ECD2' },
};
async function loadThemeColor(psicologoId){
  const { data, error } = await supabase.from('theme_color').select('color_key').eq('psicologo_id', psicologoId).maybeSingle();
  logDbError('loadThemeColor', error);
  return (data && THEME_PALETTES[data.color_key]) ? data.color_key : 'green';
}
async function saveThemeColor(psicologoId, key){
  const { error } = await supabase.from('theme_color').upsert(
    { psicologo_id:psicologoId, color_key:key, updated_at:new Date().toISOString() }, { onConflict:'psicologo_id' }
  );
  logDbError('saveThemeColor', error);
}
function applyTheme(key){
  const p = THEME_PALETTES[key] || THEME_PALETTES.green;
  const root = document.documentElement.style;
  root.setProperty('--primary', p.primary);
  root.setProperty('--primary-dark', p.primaryDark);
  root.setProperty('--primary-soft', p.primarySoft);
}

/* ================= Perfil profissional e dados fiscais ================= */
const TAX_REGIMES = ['Autônomo (RPA)', 'MEI', 'Simples Nacional', 'Lucro Presumido', 'Outro'];
function defaultProfessionalProfile(){
  return { crp:'', specialty:'', bio:'', cpfCnpj:'', taxRegime:'', city:'', bankName:'', bankAgency:'', bankAccount:'', pixKey:'' };
}
function rowToProfessionalProfile(r){
  return {
    crp: r.crp || '', specialty: r.specialty || '', bio: r.bio || '',
    cpfCnpj: r.cpf_cnpj || '', taxRegime: r.tax_regime || '', city: r.city || '',
    bankName: r.bank_name || '', bankAgency: r.bank_agency || '', bankAccount: r.bank_account || '', pixKey: r.pix_key || '',
  };
}
async function loadProfessionalProfile(psicologoId){
  const { data, error } = await supabase.from('professional_profile').select('*').eq('psicologo_id', psicologoId).maybeSingle();
  logDbError('loadProfessionalProfile', error);
  if(!data) return defaultProfessionalProfile();
  return rowToProfessionalProfile(data);
}
async function saveProfessionalProfile(psicologoId, profile){
  const row = {
    psicologo_id: psicologoId, crp: profile.crp || null, specialty: profile.specialty || null, bio: profile.bio || null,
    cpf_cnpj: profile.cpfCnpj || null, tax_regime: profile.taxRegime || null, city: profile.city || null,
    bank_name: profile.bankName || null, bank_agency: profile.bankAgency || null,
    bank_account: profile.bankAccount || null, pix_key: profile.pixKey || null, updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('professional_profile').upsert(row, { onConflict:'psicologo_id' });
  logDbError('saveProfessionalProfile', error);
}
// Usado para liberar cobrança digital (US-017) e nota fiscal (US-019) no futuro — ambas ainda não construídas.
function hasCompleteFiscalData(profile){
  return !!(profile && profile.cpfCnpj && profile.taxRegime && profile.city);
}

/* ================= Preços ================= */
function defaultPricing(){ return { presencial: DEFAULT_SESSION_PRICE, online: DEFAULT_SESSION_PRICE }; }
async function loadPricing(psicologoId){
  const { data, error } = await supabase.from('pricing').select('*').eq('psicologo_id', psicologoId).maybeSingle();
  logDbError('loadPricing', error);
  if(!data) return defaultPricing();
  return { presencial: Number(data.presencial), online: Number(data.online) };
}
async function savePricing(psicologoId, pricing){
  const { error } = await supabase.from('pricing').upsert(
    { psicologo_id:psicologoId, presencial:pricing.presencial, online:pricing.online, updated_at:new Date().toISOString() },
    { onConflict:'psicologo_id' }
  );
  logDbError('savePricing', error);
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
    return date >= b.startDate && date <= b.endDate;
  }) || null;
}
function findSessionConflict(sessions, psicologoId, date, startTime, durationMin, bufferMin, excludeId){
  const slotStart = toMinutes(startTime), slotEnd = slotStart + durationMin;
  return sessions.find(s => {
    if(s.psicologoId !== psicologoId || s.date !== date) return false;
    if(s.id === excludeId) return false;
    if(s.status === 'reagendada') return false;
    if(s.status === 'cancelada' && !s.pendingRelease) return false;
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

/* ================= Política de cancelamento ================= */
function defaultCancelPolicy(){
  return { minHoursForFree:24, lateCancelCharge:'integral', lateCancelPercent:50, autoReleaseSlot:true };
}
async function loadCancelPolicy(psicologoId){
  const { data, error } = await supabase.from('cancel_policy').select('*').eq('psicologo_id', psicologoId).maybeSingle();
  logDbError('loadCancelPolicy', error);
  if(!data) return defaultCancelPolicy();
  return {
    minHoursForFree:data.min_hours_for_free, lateCancelCharge:data.late_cancel_charge,
    lateCancelPercent:data.late_cancel_percent, autoReleaseSlot:data.auto_release_slot,
  };
}
async function saveCancelPolicy(psicologoId, policy){
  const { error } = await supabase.from('cancel_policy').upsert({
    psicologo_id:psicologoId, min_hours_for_free:policy.minHoursForFree, late_cancel_charge:policy.lateCancelCharge,
    late_cancel_percent:policy.lateCancelPercent, auto_release_slot:policy.autoReleaseSlot, updated_at:new Date().toISOString(),
  }, { onConflict:'psicologo_id' });
  logDbError('saveCancelPolicy', error);
}
function cancelPolicyText(policy){
  const chargeText = policy.lateCancelCharge === 'integral'
    ? 'cobrança integral da sessão'
    : policy.lateCancelCharge === 'parcial'
      ? `cobrança de ${policy.lateCancelPercent}% do valor da sessão`
      : 'nenhuma cobrança';
  return `Cancelamentos feitos com pelo menos ${policy.minHoursForFree}h de antecedência não geram cobrança. Cancelamentos fora desse prazo geram ${chargeText}. ${policy.autoReleaseSlot ? 'O horário é liberado automaticamente na agenda assim que o cancelamento é confirmado.' : 'O horário só é liberado na agenda após revisão do psicólogo.'}`;
}

/* ================= Notificações in-app ================= */
function rowToNotification(r){
  return { id:r.id, read:r.read, createdAt:r.created_at, type:r.type, message:r.message };
}
async function loadNotificationsFor(_ns, ownerId){
  const { data, error } = await supabase.from('notifications').select('*').eq('owner_id', ownerId).order('created_at', { ascending:false }).limit(50);
  logDbError('loadNotificationsFor', error);
  return data ? data.map(rowToNotification) : [];
}
async function saveNotificationsFor(_ns, ownerId, list){
  // Usado para marcar como lidas: propaga qualquer item já marcado read=true na lista local.
  const readIds = list.filter(n => n.read).map(n => n.id);
  if(!readIds.length) return;
  const { error } = await supabase.from('notifications').update({ read:true }).in('id', readIds).eq('owner_id', ownerId);
  logDbError('saveNotificationsFor', error);
}
async function pushNotificationFor(_ns, ownerId, notif){
  const { error } = await supabase.from('notifications').insert({ owner_id: ownerId, type: notif.type, message: notif.message, read:false });
  logDbError('pushNotificationFor', error);
}
async function loadNotifications(psicologoId){ return loadNotificationsFor('notifications', psicologoId); }
async function saveNotifications(psicologoId, list){ return saveNotificationsFor('notifications', psicologoId, list); }
async function pushNotification(psicologoId, notif){ return pushNotificationFor('notifications', psicologoId, notif); }
// Paciente é notificado pelo próprio id de usuário; resolvemos o e-mail para o id vinculado (linked_user_id).
async function pushPatientNotification(email, notif){
  const { data, error } = await supabase.from('patients').select('linked_user_id').eq('email', email.toLowerCase()).maybeSingle();
  logDbError('pushPatientNotification lookup', error);
  if(!data || !data.linked_user_id) return; // paciente ainda não tem conta própria vinculada
  return pushNotificationFor('patientNotifications', data.linked_user_id, notif);
}

/* ================= Notas privadas ================= */
function rowToNote(r){
  return { id:r.id, psicologoId:r.psicologo_id, patientId:r.patient_id, sessionId:r.session_id, text:r.text, tags:r.tags||[], deleted:r.deleted, deletedAt:r.deleted_at, createdAt:r.created_at, updatedAt:r.updated_at };
}
function noteToRow(n){
  return {
    id:n.id, psicologo_id:n.psicologoId, patient_id:n.patientId, session_id:n.sessionId || null,
    text:n.text, tags:n.tags || [], deleted: !!n.deleted, deleted_at:n.deletedAt || null,
    updated_at: n.updatedAt || new Date().toISOString(),
  };
}
async function loadNotes(){
  const { data, error } = await supabase.from('notes').select('*');
  logDbError('loadNotes', error);
  return data ? data.map(rowToNote) : [];
}
async function saveNotes(notes){
  if(!notes.length) return;
  const { error } = await supabase.from('notes').upsert(notes.map(noteToRow), { onConflict:'id' });
  logDbError('saveNotes', error);
}
const noteId = uuid;

/* ================= Tarefas de casa ================= */
function rowToTask(r){
  return {
    id:r.id, psicologoId:r.psicologo_id, patientId:r.patient_id, sessionId:r.session_id,
    title:r.title, instructions:r.instructions, dueDate:r.due_date, frequency:r.frequency,
    links:r.links||[], status:r.status, patientResponse:r.patient_response||'', patientLinks:r.patient_links||[],
    history:r.history||[], createdAt:r.created_at,
  };
}
function taskToRow(t){
  return {
    id:t.id, psicologo_id:t.psicologoId, patient_id:t.patientId, session_id:t.sessionId || null,
    title:t.title, instructions:t.instructions, due_date:t.dueDate || null, frequency:t.frequency || 'unica',
    links:t.links || [], status:t.status || 'pendente', patient_response:t.patientResponse || '',
    patient_links:t.patientLinks || [], history:t.history || [],
  };
}
async function loadTasks(){
  const { data, error } = await supabase.from('tasks').select('*');
  logDbError('loadTasks', error);
  return data ? data.map(rowToTask) : [];
}
async function saveTasks(tasks){
  if(!tasks.length) return;
  const { error } = await supabase.from('tasks').upsert(tasks.map(taskToRow), { onConflict:'id' });
  logDbError('saveTasks', error);
}
const taskId = uuid;

/* ================= Cobranças ================= */
function rowToCharge(r){
  return {
    id:r.id, psicologoId:r.psicologo_id, patientId:r.patient_id, sessionId:r.session_id,
    description:r.description, amount: Number(r.amount), dueDate:r.due_date, status:r.status,
    paidAmount: Number(r.paid_amount || 0), payments:r.payments||[], createdAt:r.created_at,
  };
}
function chargeToRow(c){
  return {
    id:c.id, psicologo_id:c.psicologoId, patient_id:c.patientId, session_id:c.sessionId || null,
    description:c.description, amount:c.amount, due_date:c.dueDate || null, status:c.status || 'pendente',
    paid_amount:c.paidAmount || 0, payments:c.payments || [],
  };
}
async function loadCharges(){
  const { data, error } = await supabase.from('charges').select('*');
  logDbError('loadCharges', error);
  return data ? data.map(rowToCharge) : [];
}
async function saveCharges(charges){
  if(!charges.length) return;
  const { error } = await supabase.from('charges').upsert(charges.map(chargeToRow), { onConflict:'id' });
  logDbError('saveCharges', error);
}
const chargeId = uuid;
const PAYMENT_METHODS = ['Pix', 'Cartão', 'Dinheiro', 'Transferência', 'Boleto', 'Outro'];

/* ================= Recibos ================= */
function rowToReceipt(r){
  return {
    id:r.id, psicologoId:r.psicologo_id, patientId:r.patient_id, chargeId:r.charge_id,
    number:r.number, professionalName:r.professional_name, patientName:r.patient_name, service:r.service,
    date:r.date, amount: Number(r.amount), status:r.status, supersedes:r.supersedes, issuedAt:r.issued_at,
  };
}
function receiptToRow(rc){
  return {
    id:rc.id, psicologo_id:rc.psicologoId, patient_id:rc.patientId, charge_id:rc.chargeId || null,
    number:rc.number, professional_name:rc.professionalName, patient_name:rc.patientName, service:rc.service,
    date:rc.date, amount:rc.amount, status:rc.status || 'emitido', supersedes:rc.supersedes || null,
  };
}
async function loadReceipts(){
  const { data, error } = await supabase.from('receipts').select('*');
  logDbError('loadReceipts', error);
  return data ? data.map(rowToReceipt) : [];
}
async function saveReceipts(receipts){
  if(!receipts.length) return;
  const { error } = await supabase.from('receipts').upsert(receipts.map(receiptToRow), { onConflict:'id' });
  logDbError('saveReceipts', error);
}
const receiptId = uuid;

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
    `Emitido em ${formatDate(receipt.issuedAt)} — documento gerado pelo sistema TerapIA.`,
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
    doc.text(`Emitido em ${formatDate(receipt.issuedAt)} — documento gerado pelo sistema TerapIA.`, 20, y + 8);

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

/* ================= Auditoria ================= */
async function loadAuditLog(){
  const { data, error } = await supabase.from('audit_log').select('*').order('timestamp', { ascending:false });
  logDbError('loadAuditLog', error);
  return data ? data.map(r => ({ id:r.id, userId:r.user_id, action:r.action, patientId:r.patient_id, noteId:r.note_id, timestamp:r.timestamp })) : [];
}
// IMPORTANTE: nunca gravar texto/conteúdo da nota aqui — só metadados (ação, quem, quando, paciente).
async function pushAudit(entry){
  const { error } = await supabase.from('audit_log').insert({
    user_id: entry.userId, action: entry.action, patient_id: entry.patientId || null, note_id: entry.noteId || null,
  });
  logDbError('pushAudit', error);
}

/* ================= Datas e horários (utilidades puras) ================= */
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

export {
  SESSION_TIMEOUT_MS, EMAIL_RE, TERMS_VERSION,
  fetchProfile, hasValidConsent, formatDate, formatDateOnly,
  loadPatients, savePatients, patientId,
  WEEKDAYS, defaultAvailability, loadAvailability, saveAvailability,
  loadBlocks, saveBlocks, blockId, loadSessions, saveSessions, sessionId,
  DEFAULT_SESSION_PRICE, formatCurrency,
  THEME_PALETTES, loadThemeColor, saveThemeColor, applyTheme,
  TAX_REGIMES, defaultProfessionalProfile, loadProfessionalProfile, saveProfessionalProfile, hasCompleteFiscalData,
  defaultPricing, loadPricing, savePricing, getDefaultPrice,
  findBlockConflict, findSessionConflict, isWithinWorkingHours, checkSlotAvailability,
  isWithinAdvanceWindow, listAvailableSlotsForDate, toMinutes, weekdayKeyOf, rangesOverlap,
  defaultCancelPolicy, loadCancelPolicy, saveCancelPolicy, cancelPolicyText,
  loadNotificationsFor, saveNotificationsFor, pushNotificationFor,
  loadNotifications, saveNotifications, pushNotification, pushPatientNotification,
  loadNotes, saveNotes, noteId, loadTasks, saveTasks, taskId,
  loadCharges, saveCharges, chargeId, PAYMENT_METHODS, loadReceipts, saveReceipts, receiptId,
  downloadTextFallbackReceipt, generateReceiptPDF,
  loadAuditLog, pushAudit,
  DOW_SHORT, MONTH_NAMES, toDateStr, fromDateStr, addDays, startOfWeek, todayStr,
  generateSlots, computeSlotStatus,
};
