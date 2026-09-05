import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { loadAuditLog, loadPatients, formatDate, todayStr } from '../../lib/dataStore.js';
import { IconHistory } from '../icons.jsx';

const ACTION_LABELS = {
  login: 'Login realizado',
  nota_criada: 'Nota clínica criada',
  nota_editada: 'Nota clínica editada',
  nota_excluida: 'Nota clínica excluída',
  prontuario_acessado: 'Prontuário acessado',
  prontuario_exportado: 'Prontuário exportado',
  solicitacao_exclusao_dados: 'Solicitação de exclusão de dados',
  cobranca_criada: 'Cobrança criada',
  cobranca_cancelada: 'Cobrança cancelada',
  cobranca_reembolsada: 'Cobrança reembolsada',
  pagamento_registrado: 'Pagamento registrado',
  recibo_emitido: 'Recibo emitido',
  recibo_cancelado: 'Recibo cancelado',
};

function AuditoriaPsicologo({ psicologoId }){
  const [logs, setLogs] = useState(null);
  const [patients, setPatients] = useState([]);
  const [actionFilter, setActionFilter] = useState('all');

  const refresh = useCallback(async () => {
    const [l, p] = await Promise.all([loadAuditLog(), loadPatients()]);
    // A RLS já restringe a apenas os próprios eventos (user_id = auth.uid()); o filtro abaixo
    // é reforço, útil se essa tela for reaproveitada em outro contexto no futuro.
    setLogs(l.filter(x => x.userId === psicologoId));
    setPatients(p);
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  if(logs === null){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando auditoria…</div>;
  }

  const actionTypes = Array.from(new Set(logs.map(l => l.action)));
  const filtered = logs.filter(l => actionFilter === 'all' || l.action === actionFilter);

  const exportToExcel = () => {
    const rows = filtered
      .slice()
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(l => {
        const patient = l.patientId ? patients.find(p => p.id === l.patientId) : null;
        return {
          'Data e hora': formatDate(l.timestamp),
          'Ação': ACTION_LABELS[l.action] || l.action,
          'Paciente': patient ? (patient.socialName || patient.name) : '—',
        };
      });
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Data e hora':'', 'Ação':'', 'Paciente':'' }]);
    sheet['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Auditoria');
    XLSX.writeFile(workbook, `auditoria-terapia-${todayStr()}.xlsx`);
  };

  return (
    <div>
      <div className="alert alert-success" style={{marginBottom:16}}>
        Este registro nunca contém o conteúdo de notas clínicas — apenas quem fez o quê, quando, e sobre qual paciente.
      </div>

      <div className="toolbar">
        <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)}>
          <option value="all">Todas as ações</option>
          {actionTypes.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
        </select>
        <button className="btn-new" onClick={exportToExcel} disabled={filtered.length === 0}>
          Exportar para Excel
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconHistory size={24}/></div>
          <h2>Nenhum registro ainda</h2>
          <p>Ações sensíveis como login, acesso a prontuário e movimentações financeiras aparecerão aqui.</p>
        </div>
      ) : (
        filtered.map(l => {
          const patient = l.patientId ? patients.find(p => p.id === l.patientId) : null;
          return (
            <div className="mini-session-row" key={l.id}>
              <span>
                <strong>{ACTION_LABELS[l.action] || l.action}</strong>
                {patient ? ` — ${patient.socialName || patient.name}` : ''}
              </span>
              <span style={{color:'var(--ink-faint)', fontSize:12}}>{formatDate(l.timestamp)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

export { AuditoriaPsicologo };
