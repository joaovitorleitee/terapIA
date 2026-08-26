import React, { useState, useEffect, useCallback } from 'react';
import { loadPatients, loadCharges, loadReceipts, generateReceiptPDF, formatCurrency, formatDateOnly, todayStr } from '../../lib/dataStore.js';
import { IconUserPlus, IconWallet } from '../icons.jsx';

function PagamentosPaciente({ user }){
  const [loading, setLoading] = useState(true);
  const [patientRecord, setPatientRecord] = useState(null);
  const [charges, setCharges] = useState([]);
  const [receipts, setReceipts] = useState([]);

  const refresh = useCallback(async () => {
    const allPatients = await loadPatients();
    const record = allPatients.find(p => p.email.toLowerCase() === user.email.toLowerCase());
    setPatientRecord(record || null);
    if(record){
      const [c, r] = await Promise.all([loadCharges(), loadReceipts()]);
      setCharges(c.filter(x => x.patientId === record.id).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setReceipts(r.filter(x => x.patientId === record.id));
    }
    setLoading(false);
  }, [user.email]);

  useEffect(() => { refresh(); }, [refresh]);

  if(loading) return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>;

  if(!patientRecord){
    return (
      <div className="empty-state">
        <div className="icon-wrap"><IconUserPlus size={24}/></div>
        <h2>Cadastro ainda não vinculado</h2>
        <p>Seu psicólogo ainda não te cadastrou no sistema com este e-mail ({user.email}).</p>
      </div>
    );
  }

  if(charges.length === 0){
    return (
      <div className="empty-state">
        <div className="icon-wrap"><IconWallet size={24}/></div>
        <h2>Nenhuma cobrança ainda</h2>
        <p>Quando seu psicólogo gerar uma cobrança, ela aparece aqui, junto do comprovante quando disponível.</p>
      </div>
    );
  }

  const statusLabel = { pendente:'Pendente', pago:'Pago', vencido:'Vencido', cancelado:'Cancelado', reembolsado:'Reembolsado', parcial:'Parcialmente pago' };

  return (
    <div>
      {charges.map(c => {
        const isOverdue = c.status === 'pendente' && c.dueDate && c.dueDate < todayStr();
        const displayStatus = isOverdue ? 'vencido' : c.status;
        const receipt = receipts.find(r => r.chargeId === c.id && r.status === 'emitido');
        return (
          <div className="charge-card" key={c.id}>
            <div className="cc-top">
              <div>
                <div className="cc-title">{c.description}</div>
                {c.dueDate && <div className="cc-sub">Vencimento: {formatDateOnly(c.dueDate)}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                <div className="cc-amount">{formatCurrency(c.amount)}</div>
                <span className={'badge status-'+displayStatus}>{statusLabel[displayStatus]}</span>
              </div>
            </div>
            {c.paidAmount > 0 && (
              <div className="cc-meta-row"><span>Pago até agora: {formatCurrency(c.paidAmount)}</span></div>
            )}
            {receipt && (
              <div className="cc-actions">
                <button className="btn-link" onClick={()=>generateReceiptPDF(receipt)}>Baixar comprovante</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


export default PagamentosPaciente;
