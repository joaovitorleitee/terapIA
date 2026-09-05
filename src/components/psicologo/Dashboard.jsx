import React, { useState, useEffect, useCallback } from 'react';
import {
  loadSessions, loadTasks, loadCharges, loadPatients, loadAvailability, loadExpenses, loadNotes,
  formatCurrency, formatDateOnly, todayStr, monthRange, expenseAppliesToPeriod,
  WIDGET_CATALOG_PSICOLOGO, loadDashboardWidgets, addDashboardWidget, removeDashboardWidget,
} from '../../lib/dataStore.js';
import { WidgetPickerModal } from '../shared.jsx';

function PainelPsicologo({ psicologoId, name }){
  const [loading, setLoading] = useState(true);
  const [todaySessions, setTodaySessions] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const [overdueCharges, setOverdueCharges] = useState([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [monthExpenses, setMonthExpenses] = useState(0);
  const [patients, setPatients] = useState([]);
  const [meetingLink, setMeetingLink] = useState('');
  const [extra, setExtra] = useState({});
  const [widgetKeys, setWidgetKeys] = useState([]);
  const [showPicker, setShowPicker] = useState(false);

  const refresh = useCallback(async () => {
    const [sessions, tasks, charges, pats, availability, expenses, notes, widgets] = await Promise.all([
      loadSessions(), loadTasks(), loadCharges(), loadPatients(), loadAvailability(psicologoId),
      loadExpenses(), loadNotes(), loadDashboardWidgets(psicologoId),
    ]);
    const mySessions = sessions.filter(s => s.psicologoId === psicologoId);
    const myTasks = tasks.filter(t => t.psicologoId === psicologoId);
    const myCharges = charges.filter(c => c.psicologoId === psicologoId);
    const myPatients = pats.filter(p => p.psicologoId === psicologoId);
    const myExpenses = expenses.filter(e => e.psicologoId === psicologoId);
    const myNotes = notes.filter(n => n.psicologoId === psicologoId && !n.deleted);
    setPatients(myPatients);
    setMeetingLink(availability.meetingLink || '');
    setWidgetKeys(widgets);

    const today = todayStr();
    setTodaySessions(
      mySessions.filter(s => s.date === today && ['confirmada','pendente','agendada'].includes(s.status))
                 .sort((a,b) => a.startTime.localeCompare(b.startTime))
    );
    setPendingCount(mySessions.filter(s => s.status === 'pendente').length);
    setActiveTasksCount(myTasks.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length);
    setOverdueCharges(
      myCharges.filter(c => (c.status === 'pendente' || c.status === 'parcial') && c.dueDate && c.dueDate < today)
                .sort((a,b) => a.dueDate.localeCompare(b.dueDate))
    );

    const { start: monthStart, end: monthEnd } = monthRange(0);
    let revenue = 0;
    myCharges.forEach(c => (c.payments||[]).forEach(p => { if(p.date && p.date >= monthStart && p.date <= monthEnd) revenue += Number(p.amount)||0; }));
    setMonthRevenue(revenue);
    const despesasMes = myExpenses.filter(e => expenseAppliesToPeriod(e, monthStart, monthEnd)).reduce((s,e) => s+e.amount, 0);
    setMonthExpenses(despesasMes);

    // Dados extras usados só pelos widgets opcionais.
    const recebimentosPendentes = myCharges.filter(c => c.status==='pendente' || c.status==='parcial');
    const inadimplenciaTotal = myCharges
      .filter(c => (c.status==='pendente'||c.status==='parcial') && c.dueDate && c.dueDate < today)
      .reduce((s,c) => s + (c.amount - (c.paidAmount||0)), 0);
    const sessoesRealizadasMes = mySessions.filter(s => s.status==='realizada' && s.date >= monthStart && s.date <= monthEnd).length;
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
    const notasRecentes = myNotes.filter(n => new Date(n.createdAt) >= sevenDaysAgo).length;
    const tarefasAtrasadas = myTasks.filter(t => t.dueDate && t.dueDate < today && (t.status==='pendente'||t.status==='em_andamento')).length;
    const tarefasConcluidasMes = myTasks.filter(t => (t.history||[]).some(h => h.status==='concluida' && h.changedAt >= monthStart && h.changedAt.slice(0,10) <= monthEnd)).length;

    setExtra({
      despesas_mes: despesasMes,
      recebimentos_pendentes: recebimentosPendentes.length,
      inadimplencia_total: inadimplenciaTotal,
      sessoes_realizadas_mes: sessoesRealizadasMes,
      notas_recentes: notasRecentes,
      tarefas_atrasadas: tarefasAtrasadas,
      tarefas_concluidas_mes: tarefasConcluidasMes,
    });

    setLoading(false);
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const patientName = (id) => { const p = patients.find(x => x.id === id); return p ? (p.socialName||p.name) : 'Paciente'; };
  const sessionStatusLabel = { pendente:'Pendente', agendada:'Agendada', confirmada:'Confirmada' };
  const netProfit = monthRevenue - monthExpenses;

  const handleAddWidget = async (key) => {
    await addDashboardWidget(psicologoId, key);
    setShowPicker(false);
    await refresh();
  };
  const handleRemoveWidget = async (key) => {
    await removeDashboardWidget(psicologoId, key);
    await refresh();
  };

  const renderExtraWidget = (key) => {
    const catalogItem = WIDGET_CATALOG_PSICOLOGO.find(w => w.key === key);
    if(!catalogItem) return null;
    const isMoney = ['despesas_mes','inadimplencia_total'].includes(key);
    const value = extra[key];
    return (
      <div className="widget-square" key={key}>
        <button className="widget-remove-btn" onClick={()=>handleRemoveWidget(key)} title="Remover">×</button>
        <div className="widget-label">{catalogItem.label}</div>
        <div className={'widget-value'+(isMoney?' small':'')}>{isMoney ? formatCurrency(value||0) : (value ?? 0)}</div>
      </div>
    );
  };

  if(loading){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando painel…</div>;
  }

  return (
    <div>
      <div className="welcome-card">
        <h2>Bem-vindo(a), {name}.</h2>
        <p>Este é o resumo do seu consultório — indicadores calculados só a partir dos seus próprios dados.</p>
      </div>

      <div className="grid-cards">
        <div className="stat-card"><div className="stat-label">Sessões hoje</div><div className="stat-value">{todaySessions.length}</div></div>
        <div className="stat-card"><div className="stat-label">Pendentes de confirmação</div><div className="stat-value">{pendingCount}</div></div>
        <div className="stat-card"><div className="stat-label">Tarefas para acompanhar</div><div className="stat-value">{activeTasksCount}</div></div>
        {overdueCharges.length > 0 && (
          <div className="stat-card danger"><div className="stat-label">Cobranças vencidas</div><div className="stat-value">{overdueCharges.length}</div></div>
        )}
      </div>

      <div className="grid-cards" style={{marginTop:16}}>
        <div className="stat-card"><div className="stat-label">Receita do mês</div><div className="stat-value" style={{fontSize:22}}>{formatCurrency(monthRevenue)}</div></div>
        <div className="stat-card">
          <div className="stat-label">Lucro líquido</div>
          <div className="stat-value" style={{fontSize:22, color: netProfit>=0 ? 'var(--primary-dark)' : '#7A362C'}}>{formatCurrency(netProfit)}</div>
        </div>
      </div>

      <div className="panel" style={{marginTop:20}}>
        <h3>Sessões de hoje</h3>
        <div className="panel-sub">Sua agenda para as próximas horas.</div>
        {todaySessions.length === 0 ? (
          <div className="field hint">Nenhuma sessão para hoje.</div>
        ) : todaySessions.map(s => (
          <div className="mini-session-row" key={s.id}>
            <span>{s.startTime} · {patientName(s.patientId)}</span>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              {s.modalidade === 'Online' && meetingLink && (
                <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="btn-link" style={{fontWeight:700}}>Entrar na sessão</a>
              )}
              <span className={'badge status-'+s.status}>{sessionStatusLabel[s.status]}</span>
            </div>
          </div>
        ))}
      </div>

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

      {widgetKeys.length > 0 && (
        <div className="widget-grid" style={{marginTop:20}}>
          {widgetKeys.map(renderExtraWidget)}
        </div>
      )}

      <button className="widget-fab" onClick={()=>setShowPicker(true)} title="Adicionar widget">+</button>
      {showPicker && (
        <WidgetPickerModal catalog={WIDGET_CATALOG_PSICOLOGO} activeKeys={widgetKeys} onAdd={handleAddWidget} onClose={()=>setShowPicker(false)} />
      )}
    </div>
  );
}

export default PainelPsicologo;
