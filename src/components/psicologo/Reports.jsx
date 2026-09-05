import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  loadSessions, loadCharges, loadExpenses, loadPatients,
  formatCurrency, formatDateOnly, todayStr, monthRange, expenseAppliesToPeriod,
} from '../../lib/dataStore.js';
import { IconBarChart } from '../icons.jsx';

const SESSION_STATUS_LABEL = {
  agendada:'Agendada', confirmada:'Confirmada', pendente:'Pendente', realizada:'Realizada',
  cancelada:'Cancelada', falta:'Falta', reagendada:'Reagendada',
};

function RelatoriosPsicologo({ psicologoId }){
  const [sessions, setSessions] = useState(null);
  const [charges, setCharges] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [patients, setPatients] = useState([]);
  const [periodPreset, setPeriodPreset] = useState('mes-atual');
  const [customStart, setCustomStart] = useState(monthRange(0).start);
  const [customEnd, setCustomEnd] = useState(monthRange(0).end);

  const refresh = useCallback(async () => {
    const [s, c, e, p] = await Promise.all([loadSessions(), loadCharges(), loadExpenses(), loadPatients()]);
    setSessions(s.filter(x => x.psicologoId === psicologoId));
    setCharges(c.filter(x => x.psicologoId === psicologoId));
    setExpenses(e.filter(x => x.psicologoId === psicologoId));
    setPatients(p.filter(x => x.psicologoId === psicologoId));
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  if(sessions === null){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando relatórios…</div>;
  }

  let periodStart, periodEnd;
  if(periodPreset === 'mes-atual'){ ({ start:periodStart, end:periodEnd } = monthRange(0)); }
  else if(periodPreset === 'mes-anterior'){ ({ start:periodStart, end:periodEnd } = monthRange(-1)); }
  else { periodStart = customStart; periodEnd = customEnd; }

  // Sessões por status, dentro do período
  const sessionsInPeriod = sessions.filter(s => s.date >= periodStart && s.date <= periodEnd);
  const statusCounts = {};
  sessionsInPeriod.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });

  // Receita por período
  let receita = 0;
  charges.forEach(c => (c.payments || []).forEach(p => {
    if(p.date && p.date >= periodStart && p.date <= periodEnd) receita += Number(p.amount) || 0;
  }));

  // Despesas e lucro por período
  const despesas = expenses.filter(e => expenseAppliesToPeriod(e, periodStart, periodEnd)).reduce((sum, e) => sum + e.amount, 0);
  const lucro = receita - despesas;

  // Inadimplência por paciente: cobranças pendentes/parciais vencidas (dueDate no passado)
  const inadimplentes = {};
  charges.filter(c => (c.status === 'pendente' || c.status === 'parcial') && c.dueDate && c.dueDate < todayStr())
    .forEach(c => {
      const key = c.patientId;
      const remaining = c.amount - (c.paidAmount || 0);
      inadimplentes[key] = (inadimplentes[key] || 0) + remaining;
    });
  const inadimplenciaList = Object.entries(inadimplentes)
    .map(([patientId, total]) => ({ patientId, total, patient: patients.find(p => p.id === patientId) }))
    .sort((a,b) => b.total - a.total);
  const totalInadimplencia = inadimplenciaList.reduce((sum, i) => sum + i.total, 0);

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet([
      { 'Indicador':'Receita no período', 'Valor': receita },
      { 'Indicador':'Despesas no período', 'Valor': despesas },
      { 'Indicador':'Lucro líquido', 'Valor': lucro },
      { 'Indicador':'Inadimplência total', 'Valor': totalInadimplencia },
    ]);
    summarySheet['!cols'] = [{ wch: 26 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

    const statusRows = Object.entries(statusCounts).map(([status, count]) => ({
      'Status': SESSION_STATUS_LABEL[status] || status, 'Quantidade': count,
    }));
    const statusSheet = XLSX.utils.json_to_sheet(statusRows.length ? statusRows : [{ 'Status':'', 'Quantidade':'' }]);
    statusSheet['!cols'] = [{ wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, statusSheet, 'Sessões por status');

    const inadimplenciaRows = inadimplenciaList.map(i => ({
      'Paciente': i.patient ? (i.patient.socialName || i.patient.name) : 'Paciente removido',
      'Valor em aberto': i.total,
    }));
    const inadimplenciaSheet = XLSX.utils.json_to_sheet(inadimplenciaRows.length ? inadimplenciaRows : [{ 'Paciente':'', 'Valor em aberto':'' }]);
    inadimplenciaSheet['!cols'] = [{ wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, inadimplenciaSheet, 'Inadimplência');

    XLSX.writeFile(workbook, `relatorio-terapia-${todayStr()}.xlsx`);
  };

  return (
    <div>
      <div className="toolbar">
        <div className="filter-pills">
          <button className={'filter-pill '+(periodPreset==='mes-atual'?'active':'')} onClick={()=>setPeriodPreset('mes-atual')}>Mês atual</button>
          <button className={'filter-pill '+(periodPreset==='mes-anterior'?'active':'')} onClick={()=>setPeriodPreset('mes-anterior')}>Mês anterior</button>
          <button className={'filter-pill '+(periodPreset==='personalizado'?'active':'')} onClick={()=>setPeriodPreset('personalizado')}>Personalizado</button>
        </div>
        <button className="btn-new" onClick={exportToExcel}>Exportar para Excel</button>
      </div>

      {periodPreset === 'personalizado' && (
        <div className="inline-fields" style={{marginBottom:16}}>
          <div className="field">
            <label>De</label>
            <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Até</label>
            <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} />
          </div>
        </div>
      )}

      <div className="grid-cards" style={{marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">Receita no período</div><div className="stat-value" style={{fontSize:20}}>{formatCurrency(receita)}</div></div>
        <div className="stat-card"><div className="stat-label">Despesas no período</div><div className="stat-value" style={{fontSize:20}}>{formatCurrency(despesas)}</div></div>
        <div className="stat-card"><div className="stat-label">Lucro líquido</div><div className="stat-value" style={{fontSize:20, color: lucro>=0 ? 'var(--primary-dark)' : 'var(--danger)'}}>{formatCurrency(lucro)}</div></div>
        <div className="stat-card"><div className="stat-label">Inadimplência total</div><div className="stat-value" style={{fontSize:20, color: totalInadimplencia>0 ? 'var(--danger)' : 'var(--ink)'}}>{formatCurrency(totalInadimplencia)}</div></div>
      </div>

      <div className="panel">
        <h3>Sessões por status</h3>
        <div className="panel-sub">Dentro do período selecionado, com base na data da sessão.</div>
        {sessionsInPeriod.length === 0 ? (
          <div className="field hint">Nenhuma sessão neste período.</div>
        ) : (
          <div className="grid-cards">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div className="stat-card" key={status}>
                <div className="stat-label">{SESSION_STATUS_LABEL[status] || status}</div>
                <div className="stat-value">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Inadimplência por paciente</h3>
        <div className="panel-sub">Cobranças pendentes ou parcialmente pagas, com vencimento já passado (independente do período selecionado acima).</div>
        {inadimplenciaList.length === 0 ? (
          <div className="field hint">Nenhuma inadimplência no momento.</div>
        ) : inadimplenciaList.map(i => (
          <div className="quick-charge-row" key={i.patientId}>
            <span>{i.patient ? (i.patient.socialName||i.patient.name) : 'Paciente removido'}</span>
            <span style={{fontWeight:700, color:'var(--danger)'}}>{formatCurrency(i.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { RelatoriosPsicologo };
