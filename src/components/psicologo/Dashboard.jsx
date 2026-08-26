import React, { useState, useEffect } from 'react';
import { loadSessions, loadTasks, loadCharges, loadPatients, formatCurrency, formatDateOnly, todayStr } from '../../lib/dataStore.js';

function PainelPsicologo({ psicologoId, name }){
  const [loading, setLoading] = useState(true);
  const [todaySessions, setTodaySessions] = useState([]);
  const [pendingSessions, setPendingSessions] = useState([]);
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const [overdueCharges, setOverdueCharges] = useState([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    (async () => {
      const [sessions, tasks, charges, pats] = await Promise.all([loadSessions(), loadTasks(), loadCharges(), loadPatients()]);
      const mySessions = sessions.filter(s => s.psicologoId === psicologoId);
      const myTasks = tasks.filter(t => t.psicologoId === psicologoId);
      const myCharges = charges.filter(c => c.psicologoId === psicologoId);
      const myPatients = pats.filter(p => p.psicologoId === psicologoId);
      setPatients(myPatients);

      const today = todayStr();
      setTodaySessions(
        mySessions.filter(s => s.date === today && ['confirmada','pendente','agendada'].includes(s.status))
                   .sort((a,b) => a.startTime.localeCompare(b.startTime))
      );
      setPendingSessions(
        mySessions.filter(s => s.status === 'pendente')
                   .sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime))
      );
      setActiveTasksCount(myTasks.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length);
      setOverdueCharges(
        myCharges.filter(c => c.status === 'pendente' && c.dueDate && c.dueDate < today)
                  .sort((a,b) => a.dueDate.localeCompare(b.dueDate))
      );

      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      let revenue = 0;
      myCharges.forEach(c => (c.payments||[]).forEach(p => { if(p.date && p.date.startsWith(monthKey)) revenue += Number(p.amount)||0; }));
      setMonthRevenue(revenue);

      setLoading(false);
    })();
  }, [psicologoId]);

  const patientName = (id) => { const p = patients.find(x => x.id === id); return p ? (p.socialName||p.name) : 'Paciente'; };
  const sessionStatusLabel = { pendente:'Pendente', agendada:'Agendada', confirmada:'Confirmada' };

  return (
    <div>
      <div className="welcome-card">
        <h2>Bem-vindo(a), {name}.</h2>
        <p>Este é o resumo do seu consultório — indicadores calculados só a partir dos seus próprios dados.</p>
      </div>
      <div className="grid-cards">
        <div className="stat-card"><div className="stat-label">Sessões hoje</div><div className="stat-value">{loading ? '—' : todaySessions.length}</div></div>
        <div className="stat-card"><div className="stat-label">Pendentes de confirmação</div><div className="stat-value">{loading ? '—' : pendingSessions.length}</div></div>
        <div className="stat-card"><div className="stat-label">Tarefas para acompanhar</div><div className="stat-value">{loading ? '—' : activeTasksCount}</div></div>
        <div className="stat-card"><div className="stat-label">Cobranças vencidas</div><div className="stat-value">{loading ? '—' : overdueCharges.length}</div></div>
        <div className="stat-card"><div className="stat-label">Receita do mês</div><div className="stat-value" style={{fontSize:20}}>{loading ? '—' : formatCurrency(monthRevenue)}</div></div>
      </div>

      {!loading && (
        <React.Fragment>
          <div className="panel">
            <h3>Sessões de hoje</h3>
            <div className="panel-sub">Sua agenda para as próximas horas.</div>
            {todaySessions.length === 0 ? (
              <div className="field hint">Nenhuma sessão para hoje.</div>
            ) : todaySessions.map(s => (
              <div className="mini-session-row" key={s.id}>
                <span>{s.startTime} · {patientName(s.patientId)}</span>
                <span className={'badge status-'+s.status}>{sessionStatusLabel[s.status]}</span>
              </div>
            ))}
          </div>

          {pendingSessions.length > 0 && (
            <div className="panel">
              <h3>Pendentes de confirmação</h3>
              <div className="panel-sub">Solicitações de agendamento aguardando sua aprovação — acesse a Agenda para aprovar ou recusar.</div>
              {pendingSessions.map(s => (
                <div className="mini-session-row" key={s.id}>
                  <span>{formatDateOnly(s.date)} às {s.startTime} · {patientName(s.patientId)}</span>
                </div>
              ))}
            </div>
          )}

          {overdueCharges.length > 0 && (
            <div className="panel">
              <h3>Cobranças vencidas</h3>
              <div className="panel-sub">Resolva em Financeiro › Recebimentos.</div>
              {overdueCharges.map(c => (
                <div className="mini-session-row" key={c.id}>
                  <span>{patientName(c.patientId)} · {c.description} · {formatCurrency(c.amount)} · venceu em {formatDateOnly(c.dueDate)}</span>
                </div>
              ))}
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
/* ---------- Patient booking (US-007) ---------- */


export default PainelPsicologo;
