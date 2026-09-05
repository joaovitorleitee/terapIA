import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadPatients, loadSessions, loadTasks, loadCharges, loadAvailability, loadProfessionalInfoPublic,
  getProfessionalPhotoUrl, uploadOwnPhoto, fetchProfile, formatDate, formatDateOnly, todayStr,
  loadPatientDocuments, loadJournalEntries, loadReceipts, checkConsentTermBlocking,
  WIDGET_CATALOG_PACIENTE, loadDashboardWidgets, addDashboardWidget, removeDashboardWidget,
} from '../../lib/dataStore.js';
import { TermsModal, WidgetPickerModal } from '../shared.jsx';
import { IconUsers } from '../icons.jsx';

// Pra onde cada widget leva quando clicado.
const WIDGET_TARGETS = {
  documentos_enviados: 'documentos',
  diario_sequencia: 'diario',
  tarefas_concluidas_total: 'minhas-tarefas',
  pagamentos_realizados: 'pagamentos',
};

function InicioPaciente({ user, onNavigate }){
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nextSession, setNextSession] = useState(null);
  const [activeTasks, setActiveTasks] = useState(0);
  const [singleActiveTaskId, setSingleActiveTaskId] = useState(null);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [overdueCharges, setOverdueCharges] = useState(0);
  const [professional, setProfessional] = useState(null);
  const [professionalName, setProfessionalName] = useState('');
  const [myPhotoPath, setMyPhotoPath] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [meetingLink, setMeetingLink] = useState('');
  const [extra, setExtra] = useState({});
  const [widgetKeys, setWidgetKeys] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [consentBlocking, setConsentBlocking] = useState(null);
  const photoInputRef = useRef(null);

  const go = (section, taskId) => { if(onNavigate) onNavigate(section, taskId); };

  const refresh = useCallback(async () => {
    const allPatients = await loadPatients();
    const record = allPatients.find(p => p.email.toLowerCase() === user.email.toLowerCase());
    const me = await fetchProfile(user.id);
    if(me) setMyPhotoPath(me.photoPath);
    const widgets = await loadDashboardWidgets(user.id);
    setWidgetKeys(widgets);
    if(record){
      const [sessions, tasks, charges, prof, psi, availability, documents, journal, receipts] = await Promise.all([
        loadSessions(), loadTasks(), loadCharges(), loadProfessionalInfoPublic(record.psicologoId), fetchProfile(record.psicologoId),
        loadAvailability(record.psicologoId), loadPatientDocuments(record.id), loadJournalEntries(record.id), loadReceipts(),
      ]);
      setMeetingLink(availability.meetingLink || '');
      const cb = await checkConsentTermBlocking(record.psicologoId, record.id);
      setConsentBlocking(cb);
      const today = todayStr();
      const mySessions = sessions
        .filter(s => s.patientId === record.id && s.date >= today && ['confirmada','pendente','agendada'].includes(s.status))
        .sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime));
      setNextSession(mySessions[0] || null);
      const myTasks = tasks.filter(t => t.patientId === record.id);
      const myActiveTasks = myTasks.filter(t => t.status === 'pendente' || t.status === 'em_andamento');
      setActiveTasks(myActiveTasks.length);
      setSingleActiveTaskId(myActiveTasks.length === 1 ? myActiveTasks[0].id : null);
      setCompletedTasks(myTasks.filter(t => t.status === 'concluida').length);
      const myCharges = charges.filter(c => c.patientId === record.id);
      setOverdueCharges(myCharges.filter(c => (c.status === 'pendente' || c.status === 'parcial') && c.dueDate && c.dueDate < today).length);
      if(psi) setProfessionalName(psi.name);
      if(prof) setProfessional(prof);

      const sortedJournal = [...journal].sort((a,b) => b.entryDate.localeCompare(a.entryDate));
      let streak = 0;
      if(sortedJournal.length){
        let cursor = new Date(sortedJournal[0].entryDate+'T00:00:00');
        const dates = new Set(sortedJournal.map(e => e.entryDate));
        while(dates.has(cursor.toISOString().slice(0,10))){
          streak++;
          cursor.setDate(cursor.getDate()-1);
        }
      }

      setExtra({
        documentos_enviados: documents.filter(d => d.uploadedByRole === 'paciente').length,
        diario_sequencia: streak,
        tarefas_concluidas_total: myTasks.filter(t => t.status === 'concluida').length,
        pagamentos_realizados: receipts.filter(r => r.patientId === record.id && r.status === 'emitido').length,
      });
    }
    setLoading(false);
  }, [user.email, user.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePhotoChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if(!file) return;
    setPhotoUploading(true);
    const result = await uploadOwnPhoto(user.id, file);
    setPhotoUploading(false);
    if(!result.error) setMyPhotoPath(result.photoPath);
  };

  const handleAddWidget = async (key) => {
    await addDashboardWidget(user.id, key);
    setShowPicker(false);
    await refresh();
  };
  const handleRemoveWidget = async (key, e) => {
    e.stopPropagation();
    await removeDashboardWidget(user.id, key);
    await refresh();
  };

  const renderExtraWidget = (key) => {
    const catalogItem = WIDGET_CATALOG_PACIENTE.find(w => w.key === key);
    if(!catalogItem) return null;
    return (
      <div className="widget-square" key={key} style={{cursor:'pointer'}} onClick={()=>go(WIDGET_TARGETS[key] || 'inicio')}>
        <button className="widget-remove-btn" onClick={(e)=>handleRemoveWidget(key,e)} title="Remover">×</button>
        <div className="widget-label">{catalogItem.label}</div>
        <div className="widget-value">{extra[key] ?? 0}</div>
      </div>
    );
  };

  return (
    <div>
      <div className="welcome-card" style={{display:'flex', alignItems:'center', gap:16}}>
        <div style={{position:'relative', flexShrink:0}}>
          <div style={{width:56, height:56, borderRadius:'50%', overflow:'hidden', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            {myPhotoPath
              ? <img src={getProfessionalPhotoUrl(myPhotoPath)} alt="Minha foto" style={{width:'100%', height:'100%', objectFit:'cover'}} />
              : <IconUsers size={26} color="#fff" />}
          </div>
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}} onChange={handlePhotoChosen} />
          <button type="button" onClick={()=>photoInputRef.current.click()} disabled={photoUploading}
                  style={{position:'absolute', bottom:-2, right:-2, width:22, height:22, borderRadius:'50%', border:'2px solid var(--primary-dark)', background:'#fff', color:'var(--primary-dark)', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}
                  title="Trocar minha foto">
            {photoUploading ? '…' : '+'}
          </button>
        </div>
        <div>
          <h2>Olá, {user.name.split(' ')[0]}.</h2>
          <p>Aqui você acompanha suas próximas sessões, tarefas e pagamentos, tudo em um único lugar.</p>
        </div>
      </div>

      {loading ? (
        <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>
      ) : (
        <React.Fragment>
          {consentBlocking && consentBlocking.blocked && (
            <div className="alert alert-danger" style={{marginTop:16, cursor:'pointer'}} onClick={()=>go('documentos')}>
              Você tem um Termo de Consentimento Terapêutico aguardando assinatura. Toque aqui para assinar antes de agendar novas sessões.
            </div>
          )}
          <div className="grid-cards" style={{marginTop:16}}>
            <div className="stat-card" style={{cursor:'pointer'}} onClick={()=>go('minhas-sessoes')}>
              <div className="stat-label">Próxima sessão</div>
              <div className="stat-value" style={{fontSize: nextSession ? 17 : 28}}>
                {nextSession ? `${formatDateOnly(nextSession.date)} · ${nextSession.startTime}` : 'Nenhuma agendada'}
              </div>
              {nextSession && meetingLink && (
                <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="btn-link" style={{fontWeight:700, display:'inline-block', marginTop:6}} onClick={e=>e.stopPropagation()}>
                  Entrar na sessão →
                </a>
              )}
            </div>
            <div className="stat-card" style={{cursor:'pointer'}} onClick={()=>go('minhas-tarefas', singleActiveTaskId)}>
              <div className="stat-label">Tarefas ativas</div>
              <div className="stat-value">{activeTasks}</div>
            </div>
            <div className="stat-card" style={{cursor:'pointer'}} onClick={()=>go('minhas-tarefas')}>
              <div className="stat-label">Tarefas concluídas</div>
              <div className="stat-value">{completedTasks}</div>
            </div>
            {overdueCharges > 0 && (
              <div className="stat-card danger" style={{cursor:'pointer'}} onClick={()=>go('pagamentos')}>
                <div className="stat-label">Cobranças vencidas</div>
                <div className="stat-value">{overdueCharges}</div>
              </div>
            )}
          </div>

          {professional && (
            <div className="stat-card" style={{marginTop:16}}>
              <div className="stat-label" style={{marginBottom:10}}>Sobre seu psicólogo(a)</div>
              <div style={{display:'flex', alignItems:'center', gap:14}}>
                <div style={{width:56, height:56, borderRadius:'50%', overflow:'hidden', background:'var(--primary-soft)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  {professional.photoPath
                    ? <img src={getProfessionalPhotoUrl(professional.photoPath)} alt={professionalName} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                    : <IconUsers size={24} color="var(--primary-dark)" />}
                </div>
                <div>
                  {professionalName && <div style={{fontSize:15, fontWeight:700, color:'var(--ink)'}}>{professionalName}</div>}
                  <div style={{fontSize:12, color:'var(--ink-faint)'}}>
                    {professional.crp && <span>CRP {professional.crp}</span>}
                    {professional.crp && professional.specialty && <span> · </span>}
                    {professional.specialty && <span>{professional.specialty}</span>}
                  </div>
                </div>
              </div>
              {professional.bio && <div style={{fontSize:13, color:'var(--ink-muted)', lineHeight:1.6, marginTop:10}}>{professional.bio}</div>}
            </div>
          )}

          <div className="stat-card" style={{marginTop:16, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
            <div>
              <div className="stat-label" style={{marginBottom:4}}>Meu consentimento</div>
              <div style={{fontSize:13, color:'var(--ink-muted)'}}>
                Aceito em {formatDate(user.termsAcceptedAt)} · versão {user.termsVersion}
              </div>
            </div>
            <button className="btn-link" onClick={()=>setShowTerms(true)}>Ver termos</button>
          </div>

          {widgetKeys.length > 0 && (
            <div className="widget-grid" style={{marginTop:20}}>
              {widgetKeys.map(renderExtraWidget)}
            </div>
          )}
        </React.Fragment>
      )}

      {showTerms && <TermsModal onClose={()=>setShowTerms(false)} />}
      <button className="widget-fab" onClick={()=>setShowPicker(true)} title="Adicionar widget">+</button>
      {showPicker && (
        <WidgetPickerModal catalog={WIDGET_CATALOG_PACIENTE} activeKeys={widgetKeys} onAdd={handleAddWidget} onClose={()=>setShowPicker(false)} />
      )}
    </div>
  );
}

export default InicioPaciente;
