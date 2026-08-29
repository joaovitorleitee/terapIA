import React, { useState, useEffect } from 'react';
import { loadPatients, loadSessions, loadTasks, loadCharges, loadProfessionalInfoPublic, formatDate, formatDateOnly, todayStr } from '../../lib/dataStore.js';
import { TermsModal } from '../shared.jsx';

function InicioPaciente({ user }){
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nextSession, setNextSession] = useState(null);
  const [activeTasks, setActiveTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [openCharges, setOpenCharges] = useState(0);
  const [professional, setProfessional] = useState(null);

  useEffect(() => {
    (async () => {
      const allPatients = await loadPatients();
      const record = allPatients.find(p => p.email.toLowerCase() === user.email.toLowerCase());
      if(record){
        const [sessions, tasks, charges, prof] = await Promise.all([
          loadSessions(), loadTasks(), loadCharges(), loadProfessionalInfoPublic(record.psicologoId),
        ]);
        const mySessions = sessions
          .filter(s => s.patientId === record.id && s.date >= todayStr() && ['confirmada','pendente','agendada'].includes(s.status))
          .sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime));
        setNextSession(mySessions[0] || null);
        const myTasks = tasks.filter(t => t.patientId === record.id);
        setActiveTasks(myTasks.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length);
        setCompletedTasks(myTasks.filter(t => t.status === 'concluida').length);
        const myCharges = charges.filter(c => c.patientId === record.id && (c.status === 'pendente' || c.status === 'parcial'));
        setOpenCharges(myCharges.length);
        if(prof && (prof.specialty || prof.bio)) setProfessional(prof);
      }
      setLoading(false);
    })();
  }, [user.email]);

  return (
    <div>
      <div className="welcome-card">
        <h2>Olá, {user.name.split(' ')[0]}.</h2>
        <p>Aqui você acompanha suas próximas sessões, tarefas e pagamentos, tudo em um único lugar.</p>
      </div>
      <div className="grid-cards">
        <div className="stat-card">
          <div className="stat-label">Próxima sessão</div>
          <div className="stat-value" style={{fontSize: nextSession ? 17 : 28}}>
            {loading ? '—' : (nextSession ? `${formatDateOnly(nextSession.date)} · ${nextSession.startTime}` : 'Nenhuma agendada')}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tarefas ativas</div>
          <div className="stat-value">{loading ? '—' : activeTasks}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tarefas concluídas</div>
          <div className="stat-value">{loading ? '—' : completedTasks}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cobranças em aberto</div>
          <div className="stat-value">{loading ? '—' : openCharges}</div>
        </div>
      </div>
      {professional && (
        <div className="stat-card" style={{marginTop:16}}>
          <div className="stat-label" style={{marginBottom:6}}>Sobre seu psicólogo(a)</div>
          {professional.specialty && <div style={{fontSize:13, fontWeight:600, marginBottom:4}}>{professional.specialty}</div>}
          {professional.bio && <div style={{fontSize:13, color:'var(--ink-muted)', lineHeight:1.6}}>{professional.bio}</div>}
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
      {showTerms && <TermsModal onClose={()=>setShowTerms(false)} />}
    </div>
  );
}

export default InicioPaciente;
