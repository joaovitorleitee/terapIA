import { supabase } from './supabaseClient.js';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

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

// Convite pendente: linha de patients com esse e-mail ainda sem linked_user_id (US-032).
async function findPendingPatientLink(email){
  const { data, error } = await supabase.from('patients').select('*')
    .is('linked_user_id', null).ilike('email', email).order('created_at', { ascending:false }).limit(1).maybeSingle();
  logDbError('findPendingPatientLink', error);
  return data ? rowToPatient(data) : null;
}
async function confirmPatientLink(patientRowId, userId){
  const { error } = await supabase.from('patients').update({ linked_user_id: userId }).eq('id', patientRowId);
  logDbError('confirmPatientLink', error);
  return !error;
}

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

/* ================= Perfil profissional (visível ao paciente) e dados fiscais (só o psicólogo) ================= */
const TAX_REGIMES = ['Autônomo (RPA)', 'MEI', 'Simples Nacional', 'Lucro Presumido', 'Outro'];
function defaultProfessionalProfile(){
  return { crp:'', specialty:'', bio:'', cpfCnpj:'', taxRegime:'', city:'', bankName:'', bankAgency:'', bankAccount:'', pixKey:'' };
}
async function loadProfessionalProfile(psicologoId){
  const [infoRes, fiscalRes] = await Promise.all([
    supabase.from('professional_info').select('*').eq('psicologo_id', psicologoId).maybeSingle(),
    supabase.from('professional_profile').select('*').eq('psicologo_id', psicologoId).maybeSingle(),
  ]);
  logDbError('loadProfessionalProfile (info)', infoRes.error);
  logDbError('loadProfessionalProfile (fiscal)', fiscalRes.error);
  const info = infoRes.data || {};
  const fiscal = fiscalRes.data || {};
  return {
    crp: info.crp || '', specialty: info.specialty || '', bio: info.bio || '',
    city: info.city || '', pixKey: info.pix_key || '',
    cpfCnpj: fiscal.cpf_cnpj || '', taxRegime: fiscal.tax_regime || '',
    bankName: fiscal.bank_name || '', bankAgency: fiscal.bank_agency || '', bankAccount: fiscal.bank_account || '',
  };
}
async function saveProfessionalProfile(psicologoId, profile){
  const infoRow = {
    psicologo_id: psicologoId, crp: profile.crp || null, specialty: profile.specialty || null, bio: profile.bio || null,
    city: profile.city || null, pix_key: profile.pixKey || null, updated_at: new Date().toISOString(),
  };
  const fiscalRow = {
    psicologo_id: psicologoId, cpf_cnpj: profile.cpfCnpj || null, tax_regime: profile.taxRegime || null,
    bank_name: profile.bankName || null, bank_agency: profile.bankAgency || null,
    bank_account: profile.bankAccount || null, updated_at: new Date().toISOString(),
  };
  const [infoRes, fiscalRes] = await Promise.all([
    supabase.from('professional_info').upsert(infoRow, { onConflict:'psicologo_id' }),
    supabase.from('professional_profile').upsert(fiscalRow, { onConflict:'psicologo_id' }),
  ]);
  logDbError('saveProfessionalProfile (info)', infoRes.error);
  logDbError('saveProfessionalProfile (fiscal)', fiscalRes.error);
}
// Usado pelo paciente — especialidade/apresentação/cidade/chave Pix, nunca CPF/CNPJ ou dados bancários
// (essas ficam só em professional_profile, tabela sem nenhuma policy de paciente).
async function loadProfessionalInfoPublic(psicologoId){
  const { data, error } = await supabase.from('professional_info').select('crp, specialty, bio, city, pix_key').eq('psicologo_id', psicologoId).maybeSingle();
  logDbError('loadProfessionalInfoPublic', error);
  return data ? { crp: data.crp || '', specialty: data.specialty || '', bio: data.bio || '', city: data.city || '', pixKey: data.pix_key || '' } : null;
}
// Usado para liberar cobrança digital (US-017) e nota fiscal (US-019) no futuro — ambas ainda não construídas.
function hasCompleteFiscalData(profile){
  return !!(profile && profile.cpfCnpj && profile.taxRegime && profile.city);
}

/* ================= Pix estático (US-017, escopo reduzido — sem gateway) ================= */
function stripDiacriticsUpper(str){
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
function pixTlv(id, value){
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}
function pixCrc16(payload){
  let crc = 0xFFFF;
  for(let i = 0; i < payload.length; i++){
    crc ^= payload.charCodeAt(i) << 8;
    for(let j = 0; j < 8; j++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
// Gera o payload "Pix Copia e Cola" (BR Code), padrão aberto do Banco Central — não depende de
// nenhum gateway ou conta externa, só da própria chave Pix já cadastrada pelo psicólogo.
function buildPixPayload({ pixKey, merchantName, merchantCity, amount, txid, description }){
  if(!pixKey) return null;
  const merchantAccountInfo = pixTlv('00','BR.GOV.BCB.PIX') + pixTlv('01', pixKey) + (description ? pixTlv('02', stripDiacriticsUpper(description).slice(0,50)) : '');
  let payload = '';
  payload += pixTlv('00','01');
  payload += pixTlv('26', merchantAccountInfo);
  payload += pixTlv('52','0000');
  payload += pixTlv('53','986');
  if(amount) payload += pixTlv('54', Number(amount).toFixed(2));
  payload += pixTlv('58','BR');
  payload += pixTlv('59', stripDiacriticsUpper(merchantName || 'PSICOLOGO').slice(0,25) || 'PSICOLOGO');
  payload += pixTlv('60', stripDiacriticsUpper(merchantCity || 'BRASIL').slice(0,15) || 'BRASIL');
  const txidClean = (txid || '').replace(/[^a-zA-Z0-9]/g,'').slice(0,25) || '***';
  payload += pixTlv('62', pixTlv('05', txidClean));
  payload += '6304';
  return payload + pixCrc16(payload);
}
async function generatePixQrDataUrl(payload){
  return QRCode.toDataURL(payload, { margin: 1, width: 260 });
}

/* ================= Direitos do titular (LGPD) — exportação e exclusão ================= */
async function loadDataRightsConfig(psicologoId){
  const { data, error } = await supabase.from('data_rights_config').select('*').eq('psicologo_id', psicologoId).maybeSingle();
  logDbError('loadDataRightsConfig', error);
  return { responseSlaDays: data ? data.response_sla_days : 15 };
}
async function saveDataRightsConfig(psicologoId, config){
  const { error } = await supabase.from('data_rights_config').upsert(
    { psicologo_id: psicologoId, response_sla_days: config.responseSlaDays, updated_at: new Date().toISOString() },
    { onConflict:'psicologo_id' }
  );
  logDbError('saveDataRightsConfig', error);
}

// Exporta só os dados administrativos do próprio titular — nunca notas privadas do psicólogo
// (a RLS de notes já bloqueia paciente por completo, então isso é reforçado em dois níveis).
async function exportMyData(currentUser, patientRecord){
  const lines = [
    `Exportação de dados — TerapIA`,
    `Titular: ${currentUser.name} (${currentUser.email})`,
    `Papel: ${currentUser.role === 'psicologo' ? 'Psicólogo(a)' : 'Paciente'}`,
    `Gerado em: ${formatDate(new Date().toISOString())}`,
    '',
  ];
  if(currentUser.role === 'paciente' && patientRecord){
    const [sessions, tasks, charges, receipts] = await Promise.all([loadSessions(), loadTasks(), loadCharges(), loadReceipts()]);
    const mySessions = sessions.filter(s => s.patientId === patientRecord.id);
    const myTasks = tasks.filter(t => t.patientId === patientRecord.id);
    const myCharges = charges.filter(c => c.patientId === patientRecord.id);
    const myReceipts = receipts.filter(r => r.patientId === patientRecord.id);
    lines.push('== Meus dados cadastrais ==');
    lines.push(`Nome: ${patientRecord.name}`, `E-mail: ${patientRecord.email}`, `Telefone: ${patientRecord.phone || '—'}`, '');
    lines.push('== Minhas sessões ==');
    mySessions.forEach(s => lines.push(`${formatDateOnly(s.date)} ${s.startTime} — ${s.status} — ${s.modalidade} — ${formatCurrency(s.valor)}`));
    if(!mySessions.length) lines.push('Nenhuma.');
    lines.push('', '== Minhas tarefas ==');
    myTasks.forEach(t => lines.push(`${t.title} — ${t.status}`));
    if(!myTasks.length) lines.push('Nenhuma.');
    lines.push('', '== Minhas cobranças ==');
    myCharges.forEach(c => lines.push(`${c.description} — ${formatCurrency(c.amount)} — ${c.status}`));
    if(!myCharges.length) lines.push('Nenhuma.');
    lines.push('', '== Meus recibos ==');
    myReceipts.forEach(r => lines.push(`${r.number} — ${formatCurrency(r.amount)} — ${formatDateOnly(r.date)}`));
    if(!myReceipts.length) lines.push('Nenhum.');
    lines.push('', 'Observação: notas clínicas privadas do seu psicólogo não fazem parte desta exportação — são de uso exclusivo profissional, conforme a LGPD.');
  } else {
    lines.push('Dados cadastrais do psicólogo(a):');
    lines.push(`Nome: ${currentUser.name}`, `E-mail: ${currentUser.email}`);
    lines.push('', 'Para o histórico completo de pacientes, sessões e financeiro, utilize as telas do sistema — esta exportação cobre apenas seus dados de conta.');
  }
  const blob = new Blob([lines.join('\n')], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `meus-dados-terapia-${todayStr()}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rowToDeletionRequest(r){
  return {
    id:r.id, requesterId:r.requester_id, requesterRole:r.requester_role, psicologoId:r.psicologo_id,
    patientId:r.patient_id, status:r.status, requestedAt:r.requested_at, resolvedAt:r.resolved_at, resolutionNote:r.resolution_note,
  };
}
async function loadMyDeletionRequests(userId){
  const { data, error } = await supabase.from('deletion_requests').select('*').eq('requester_id', userId).order('requested_at', { ascending:false });
  logDbError('loadMyDeletionRequests', error);
  return data ? data.map(rowToDeletionRequest) : [];
}
async function loadDeletionRequestsForPsicologo(psicologoId){
  const { data, error } = await supabase.from('deletion_requests').select('*').eq('psicologo_id', psicologoId).order('requested_at', { ascending:false });
  logDbError('loadDeletionRequestsForPsicologo', error);
  return data ? data.map(rowToDeletionRequest) : [];
}
async function createDeletionRequest({ requesterId, requesterRole, psicologoId, patientId }){
  const { data, error } = await supabase.from('deletion_requests').insert({
    requester_id: requesterId, requester_role: requesterRole, psicologo_id: psicologoId || null, patient_id: patientId || null,
  }).select().single();
  logDbError('createDeletionRequest', error);
  await pushAudit({ userId: requesterId, action: 'solicitacao_exclusao_dados', patientId: patientId || null });
  if(psicologoId && requesterRole === 'paciente'){
    await pushNotificationFor('notifications', psicologoId, {
      type: 'exclusao_dados', message: 'Um paciente solicitou a exclusão/anonimização dos próprios dados.',
    });
  }
  return data ? rowToDeletionRequest(data) : null;
}
// Anonimiza o cadastro do paciente, preservando sessões/cobranças/recibos (retenção fiscal) e a auditoria.
async function anonymizePatientData(patientId){
  const { error } = await supabase.from('patients').update({
    name: 'Paciente removido', social_name: null, email: `removido-${patientId.slice(0,8)}@anonimizado.terapia`,
    phone: null, cpf: null, emergency_contact: null, address: null, notes: null, birth_date: null,
  }).eq('id', patientId);
  logDbError('anonymizePatientData', error);
}
async function resolveDeletionRequest(requestId, patientId, note){
  if(patientId) await anonymizePatientData(patientId);
  const { error } = await supabase.from('deletion_requests').update({
    status: 'concluida', resolved_at: new Date().toISOString(), resolution_note: note || 'Dados anonimizados.',
  }).eq('id', requestId);
  logDbError('resolveDeletionRequest', error);
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
async function deleteTask(id){
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  logDbError('deleteTask', error);
}
const taskId = uuid;

/* ================= Biblioteca de modelos de tarefa ================= */
function rowToTemplate(r){
  return {
    id:r.id, psicologoId:r.psicologo_id, title:r.title, instructions:r.instructions,
    frequency:r.frequency, category:r.category || '', links:r.links || [], status:r.status,
    createdAt:r.created_at, updatedAt:r.updated_at,
  };
}
function templateToRow(t){
  return {
    id:t.id, psicologo_id:t.psicologoId, title:t.title, instructions:t.instructions,
    frequency:t.frequency || 'unica', category:t.category || null, links:t.links || [],
    status:t.status || 'ativo', updated_at:new Date().toISOString(),
  };
}
async function loadTaskTemplates(){
  const { data, error } = await supabase.from('task_templates').select('*').order('created_at', { ascending:false });
  logDbError('loadTaskTemplates', error);
  return data ? data.map(rowToTemplate) : [];
}
async function saveTaskTemplates(templates){
  if(!templates.length) return;
  const { error } = await supabase.from('task_templates').upsert(templates.map(templateToRow), { onConflict:'id' });
  logDbError('saveTaskTemplates', error);
}
const templateId = uuid;
const TEMPLATE_CATEGORIES = ['Ansiedade', 'Sono', 'Autoestima', 'Relacionamentos', 'Rotina', 'Geral'];

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

/* ================= Despesas e lucro ================= */
const EXPENSE_CATEGORIES = ['Aluguel', 'Material', 'Marketing', 'Software', 'Impostos', 'Supervisão', 'Outros'];
function rowToExpense(r){
  return { id:r.id, psicologoId:r.psicologo_id, category:r.category, description:r.description||'', amount:Number(r.amount), date:r.date, recurrence:r.recurrence, createdAt:r.created_at };
}
function expenseToRow(e){
  return { id:e.id, psicologo_id:e.psicologoId, category:e.category, description:e.description||null, amount:e.amount, date:e.date, recurrence:e.recurrence||'unica' };
}
async function loadExpenses(){
  const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending:false });
  logDbError('loadExpenses', error);
  return data ? data.map(rowToExpense) : [];
}
async function saveExpenses(expenses){
  if(!expenses.length) return;
  const { error } = await supabase.from('expenses').upsert(expenses.map(expenseToRow), { onConflict:'id' });
  logDbError('saveExpenses', error);
}
async function deleteExpense(id){
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  logDbError('deleteExpense', error);
}
const expenseId = uuid;
// Despesa "mensal" não gera linhas futuras — conta dinamicamente em qualquer período igual/posterior à data original.
function expenseAppliesToPeriod(expense, periodStart, periodEnd){
  if(expense.recurrence === 'mensal') return expense.date <= periodEnd;
  return expense.date >= periodStart && expense.date <= periodEnd;
}
function monthRange(offset = 0){
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const end = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return { start, end };
}
const PAYMENT_METHODS = ['Pix', 'Cartão', 'Dinheiro', 'Transferência', 'Boleto', 'Outro'];

/* ================= Recibos ================= */
function rowToReceipt(r){
  return {
    id:r.id, psicologoId:r.psicologo_id, patientId:r.patient_id, chargeId:r.charge_id,
    number:r.number, professionalName:r.professional_name, patientName:r.patient_name, service:r.service,
    professionalCrp: r.professional_crp || '', professionalDocument: r.professional_document || '',
    date:r.date, amount: Number(r.amount), status:r.status, supersedes:r.supersedes, issuedAt:r.issued_at,
  };
}
function receiptToRow(rc){
  return {
    id:rc.id, psicologo_id:rc.psicologoId, patient_id:rc.patientId, charge_id:rc.chargeId || null,
    number:rc.number, professional_name:rc.professionalName, patient_name:rc.patientName, service:rc.service,
    professional_crp: rc.professionalCrp || null, professional_document: rc.professionalDocument || null,
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
    receipt.professionalCrp ? `CRP: ${receipt.professionalCrp}` : '',
    receipt.professionalDocument ? `CPF/CNPJ: ${receipt.professionalDocument}` : '',
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
    if(receipt.professionalCrp) line('CRP', receipt.professionalCrp);
    if(receipt.professionalDocument) line('CPF/CNPJ', receipt.professionalDocument);
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
  loadPatients, savePatients, patientId, findPendingPatientLink, confirmPatientLink,
  WEEKDAYS, defaultAvailability, loadAvailability, saveAvailability,
  loadBlocks, saveBlocks, blockId, loadSessions, saveSessions, sessionId,
  DEFAULT_SESSION_PRICE, formatCurrency,
  THEME_PALETTES, loadThemeColor, saveThemeColor, applyTheme,
  TAX_REGIMES, defaultProfessionalProfile, loadProfessionalProfile, saveProfessionalProfile,
  loadProfessionalInfoPublic, hasCompleteFiscalData,
  buildPixPayload, generatePixQrDataUrl,
  loadDataRightsConfig, saveDataRightsConfig, exportMyData,
  loadMyDeletionRequests, loadDeletionRequestsForPsicologo, createDeletionRequest, resolveDeletionRequest,
  defaultPricing, loadPricing, savePricing, getDefaultPrice,
  findBlockConflict, findSessionConflict, isWithinWorkingHours, checkSlotAvailability,
  isWithinAdvanceWindow, listAvailableSlotsForDate, toMinutes, weekdayKeyOf, rangesOverlap,
  defaultCancelPolicy, loadCancelPolicy, saveCancelPolicy, cancelPolicyText,
  loadNotificationsFor, saveNotificationsFor, pushNotificationFor,
  loadNotifications, saveNotifications, pushNotification, pushPatientNotification,
  loadNotes, saveNotes, noteId, loadTasks, saveTasks, deleteTask, taskId,
  loadTaskTemplates, saveTaskTemplates, templateId, TEMPLATE_CATEGORIES,
  loadCharges, saveCharges, chargeId, PAYMENT_METHODS, loadReceipts, saveReceipts, receiptId,
  EXPENSE_CATEGORIES, loadExpenses, saveExpenses, deleteExpense, expenseId, expenseAppliesToPeriod, monthRange,
  downloadTextFallbackReceipt, generateReceiptPDF,
  loadAuditLog, pushAudit,
  DOW_SHORT, MONTH_NAMES, toDateStr, fromDateStr, addDays, startOfWeek, todayStr,
  generateSlots, computeSlotStatus,
};
