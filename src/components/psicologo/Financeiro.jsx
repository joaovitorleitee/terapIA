import React, { useState, useEffect, useCallback } from 'react';
import {
  loadPricing, savePricing, defaultPricing, DEFAULT_SESSION_PRICE,
  loadCharges, saveCharges, chargeId, PAYMENT_METHODS,
  loadReceipts, saveReceipts, receiptId, generateReceiptPDF,
  loadPatients, loadSessions, formatCurrency, formatDateOnly, todayStr,
  EXPENSE_CATEGORIES, loadExpenses, saveExpenses, deleteExpense, expenseId, expenseAppliesToPeriod, monthRange,
} from '../../lib/dataStore.js';
import { IconPlus, IconWallet, IconTrash } from '../icons.jsx';

function PrecosPanel({ psicologoId }){
  const [pricing, setPricing] = useState(null);
  const [saveState, setSaveState] = useState('idle');

  useEffect(() => { (async () => setPricing(await loadPricing(psicologoId)))(); }, [psicologoId]);

  const update = async (next) => {
    setPricing(next);
    setSaveState('saving');
    await savePricing(psicologoId, next);
    setSaveState('saved');
    setTimeout(()=>setSaveState('idle'), 1500);
  };

  if(!pricing) return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>;

  return (
    <div className="panel">
      <h3>Valor padrão por tipo de sessão</h3>
      <div className="panel-sub">Usado automaticamente ao criar novas sessões. Alterar aqui não modifica sessões já criadas.</div>
      {saveState !== 'idle' && (
        <div className="alert alert-success" style={{display:'inline-flex', marginBottom:14}}>
          {saveState==='saving' ? 'Salvando…' : 'Salvo.'}
        </div>
      )}
      <div className="inline-fields">
        <div className="field">
          <label>Sessão presencial (R$)</label>
          <input type="number" min="0" step="10" value={pricing.presencial} onChange={e=>update({ ...pricing, presencial:Number(e.target.value)||0 })} />
        </div>
        <div className="field">
          <label>Sessão online (R$)</label>
          <input type="number" min="0" step="10" value={pricing.online} onChange={e=>update({ ...pricing, online:Number(e.target.value)||0 })} />
        </div>
      </div>
      <div className="field hint">Para um valor específico de um paciente, edite o cadastro dele em "Pacientes" — ele sempre sobrepõe o padrão acima.</div>
    </div>
  );
}


function ReceiptsPanel({ psicologoId }){
  const [receipts, setReceipts] = useState(null);
  const [patients, setPatients] = useState([]);

  const refresh = useCallback(async () => {
    const [r, p] = await Promise.all([loadReceipts(), loadPatients()]);
    setReceipts(r.filter(x => x.psicologoId === psicologoId).sort((a,b) => new Date(b.issuedAt) - new Date(a.issuedAt)));
    setPatients(p.filter(x => x.psicologoId === psicologoId));
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const cancelReceipt = async (receipt) => {
    const all = await loadReceipts();
    const updated = all.map(r => r.id === receipt.id ? { ...r, status:'cancelado' } : r);
    await saveReceipts(updated);
    await refresh();
  };

  const reissue = async (receipt) => {
    const all = await loadReceipts();
    const number = 'REC-' + String(all.filter(r=>r.psicologoId===psicologoId).length + 1).padStart(4, '0');
    const newReceipt = { ...receipt, id: receiptId(), number, status:'emitido', issuedAt:new Date().toISOString(), supersedes:receipt.number };
    await saveReceipts([...all, newReceipt]);
    generateReceiptPDF(newReceipt);
    await refresh();
  };

  if(receipts === null) return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando recibos…</div>;

  if(receipts.length === 0){
    return (
      <div className="empty-state">
        <div className="icon-wrap"><IconWallet size={24}/></div>
        <h2>Nenhum recibo emitido ainda</h2>
        <p>Emita recibos a partir de cobranças pagas, na aba "Recebimentos".</p>
      </div>
    );
  }

  return (
    <div>
      {receipts.map(r => {
        const patient = patients.find(p => p.id === r.patientId);
        return (
          <div className="receipt-card" key={r.id}>
            <div>
              <div className="rc-num">{r.number}</div>
              <div className="rc-meta">
                {patient ? (patient.socialName||patient.name) : r.patientName} · {formatCurrency(r.amount)} · {formatDateOnly(r.date)}
                {r.supersedes ? ` · substitui ${r.supersedes}` : ''}
              </div>
            </div>
            <div className="rc-actions">
              <span className={'badge status-'+r.status}>{r.status === 'cancelado' ? 'Cancelado' : 'Emitido'}</span>
              <button className="btn-link" onClick={()=>generateReceiptPDF(r)}>Baixar PDF</button>
              {r.status === 'emitido' && (
                <button className="btn-link" style={{color:'var(--danger)'}} onClick={()=>cancelReceipt(r)}>Cancelar</button>
              )}
              {r.status === 'cancelado' && (
                <button className="btn-link" onClick={()=>reissue(r)}>Emitir substituto</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function ExpenseFormModal({ onClose, onSave }){
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [recurrence, setRecurrence] = useState('unica');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if(!category.trim()){ setError('Informe a categoria da despesa.'); return; }
    if(!(Number(amount) > 0)){ setError('Informe um valor válido.'); return; }
    setBusy(true);
    try{
      await onSave({ category: category.trim(), description: description.trim(), amount: Number(amount), date, recurrence });
      onClose();
    }catch(e){
      setError('Não foi possível salvar a despesa agora.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        <h3>Nova despesa</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Categoria</label>
            <input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Ex.: Aluguel" list="expense-categories" />
            <datalist id="expense-categories">
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Valor (R$)</label>
            <input type="number" min="0" step="10" value={amount} onChange={e=>setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Data</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Recorrência</label>
            <select value={recurrence} onChange={e=>setRecurrence(e.target.value)}>
              <option value="unica">Única</option>
              <option value="mensal">Mensal</option>
            </select>
          </div>
          <div className="field full">
            <label>Descrição <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Detalhes da despesa" />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Salvando…' : 'Adicionar despesa'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RelatorioPanel({ psicologoId }){
  const [charges, setCharges] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [patients, setPatients] = useState([]);
  const [periodPreset, setPeriodPreset] = useState('mes-atual'); // mes-atual | mes-anterior | personalizado
  const [customStart, setCustomStart] = useState(monthRange(0).start);
  const [customEnd, setCustomEnd] = useState(monthRange(0).end);
  const [patientFilter, setPatientFilter] = useState('all');
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const refresh = useCallback(async () => {
    const [c, e, p] = await Promise.all([loadCharges(), loadExpenses(), loadPatients()]);
    setCharges(c.filter(x => x.psicologoId === psicologoId));
    setExpenses(e.filter(x => x.psicologoId === psicologoId));
    setPatients(p.filter(x => x.psicologoId === psicologoId));
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addExpense = async (data) => {
    const all = await loadExpenses();
    const newExpense = { id: expenseId(), psicologoId, createdAt:new Date().toISOString(), ...data };
    await saveExpenses([...all, newExpense]);
    await refresh();
  };

  const removeExpense = async (id) => {
    await deleteExpense(id);
    await refresh();
  };

  if(charges === null){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>;
  }

  let periodStart, periodEnd;
  if(periodPreset === 'mes-atual'){ ({ start:periodStart, end:periodEnd } = monthRange(0)); }
  else if(periodPreset === 'mes-anterior'){ ({ start:periodStart, end:periodEnd } = monthRange(-1)); }
  else { periodStart = customStart; periodEnd = customEnd; }

  const chargesInScope = charges.filter(c => patientFilter === 'all' || c.patientId === patientFilter);

  let receitaRecebida = 0;
  chargesInScope.forEach(c => {
    (c.payments || []).forEach(p => {
      if(p.date && p.date >= periodStart && p.date <= periodEnd) receitaRecebida += Number(p.amount) || 0;
    });
  });

  const receitaPrevista = chargesInScope
    .filter(c => (c.status === 'pendente' || c.status === 'parcial'))
    .filter(c => !c.dueDate || (c.dueDate >= periodStart && c.dueDate <= periodEnd))
    .reduce((sum, c) => sum + (c.amount - (c.paidAmount || 0)), 0);

  const expensesInPeriod = expenses.filter(e => expenseAppliesToPeriod(e, periodStart, periodEnd));
  const totalDespesas = expensesInPeriod.reduce((sum, e) => sum + e.amount, 0);

  const lucroLiquido = receitaRecebida - totalDespesas;

  return (
    <div>
      <div className="toolbar">
        <div className="filter-pills">
          <button className={'filter-pill '+(periodPreset==='mes-atual'?'active':'')} onClick={()=>setPeriodPreset('mes-atual')}>Mês atual</button>
          <button className={'filter-pill '+(periodPreset==='mes-anterior'?'active':'')} onClick={()=>setPeriodPreset('mes-anterior')}>Mês anterior</button>
          <button className={'filter-pill '+(periodPreset==='personalizado'?'active':'')} onClick={()=>setPeriodPreset('personalizado')}>Personalizado</button>
        </div>
        <select value={patientFilter} onChange={e=>setPatientFilter(e.target.value)}>
          <option value="all">Todos os pacientes</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.socialName||p.name}</option>)}
        </select>
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
        <div className="stat-card"><div className="stat-label">Receita recebida</div><div className="stat-value" style={{fontSize:20}}>{formatCurrency(receitaRecebida)}</div></div>
        <div className="stat-card"><div className="stat-label">Receita prevista</div><div className="stat-value" style={{fontSize:20}}>{formatCurrency(receitaPrevista)}</div></div>
        <div className="stat-card"><div className="stat-label">Despesas</div><div className="stat-value" style={{fontSize:20}}>{formatCurrency(totalDespesas)}</div></div>
        <div className="stat-card"><div className="stat-label">Lucro líquido</div><div className="stat-value" style={{fontSize:20, color: lucroLiquido>=0 ? 'var(--primary-dark)' : 'var(--danger)'}}>{formatCurrency(lucroLiquido)}</div></div>
      </div>

      <div className="panel">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
          <h3 style={{margin:0}}>Despesas</h3>
          <button className="btn-new" onClick={()=>setShowExpenseForm(true)}><IconPlus size={15}/> Nova despesa</button>
        </div>
        <div className="panel-sub">Despesas mensais contam automaticamente em todo período igual ou posterior à data de cadastro.</div>
        {expensesInPeriod.length === 0 ? (
          <div className="field hint">Nenhuma despesa neste período.</div>
        ) : expensesInPeriod.map(e => (
          <div className="quick-charge-row" key={e.id}>
            <span>{e.category}{e.description ? ' — '+e.description : ''} · {formatDateOnly(e.date)} · {formatCurrency(e.amount)}{e.recurrence==='mensal' ? ' (mensal)' : ''}</span>
            <button className="icon-btn" title="Excluir" onClick={()=>removeExpense(e.id)}><IconTrash size={14}/></button>
          </div>
        ))}
      </div>

      {showExpenseForm && (
        <ExpenseFormModal onClose={()=>setShowExpenseForm(false)} onSave={addExpense} />
      )}
    </div>
  );
}

function FinanceiroPsicologo({ psicologoId, professionalName }){
  const [tab, setTab] = useState('recebimentos');
  return (
    <div>
      <div className="subtabs">
        <button className={tab==='recebimentos'?'active':''} onClick={()=>setTab('recebimentos')}>Recebimentos</button>
        <button className={tab==='recibos'?'active':''} onClick={()=>setTab('recibos')}>Recibos</button>
        <button className={tab==='relatorio'?'active':''} onClick={()=>setTab('relatorio')}>Relatório</button>
        <button className={tab==='precos'?'active':''} onClick={()=>setTab('precos')}>Preços</button>
      </div>
      {tab === 'precos' && <PrecosPanel psicologoId={psicologoId} />}
      {tab === 'recebimentos' && <RecebimentosPanel psicologoId={psicologoId} professionalName={professionalName} />}
      {tab === 'recibos' && <ReceiptsPanel psicologoId={psicologoId} />}
      {tab === 'relatorio' && <RelatorioPanel psicologoId={psicologoId} />}
    </div>
  );
}

/* ---------- Receivables — psicólogo (US-015) ---------- */


function ChargeFormModal({ patients, presetSession, onClose, onSave }){
  const [patientIdSel, setPatientIdSel] = useState(presetSession ? presetSession.patientId : (patients[0]?.id || ''));
  const [description, setDescription] = useState(presetSession ? `Sessão de ${formatDateOnly(presetSession.date)}` : '');
  const [amount, setAmount] = useState(presetSession ? presetSession.valor : DEFAULT_SESSION_PRICE);
  const [dueDate, setDueDate] = useState(presetSession ? presetSession.date : todayStr());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if(!patientIdSel){ setError('Selecione um paciente.'); return; }
    if(!description.trim()){ setError('Descreva a cobrança.'); return; }
    if(!(Number(amount) > 0)){ setError('Informe um valor válido.'); return; }
    setBusy(true);
    try{
      await onSave({
        patientId: patientIdSel, sessionId: presetSession ? presetSession.id : null,
        description: description.trim(), amount: Number(amount), dueDate: dueDate || null,
      });
      onClose();
    }catch(e){
      setError('Não foi possível criar a cobrança agora.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        <h3>{presetSession ? 'Gerar cobrança da sessão' : 'Nova cobrança avulsa'}</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>Paciente</label>
            <select value={patientIdSel} onChange={e=>setPatientIdSel(e.target.value)} disabled={!!presetSession}>
              <option value="">Selecione</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.socialName || p.name}</option>)}
            </select>
          </div>
          <div className="field full">
            <label>Descrição</label>
            <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: Sessão avulsa, pacote de 4 sessões..." />
          </div>
          <div className="field">
            <label>Valor (R$)</label>
            <input type="number" min="0" step="10" value={amount} onChange={e=>setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Vencimento <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Salvando…' : 'Criar cobrança'}
          </button>
        </div>
      </div>
    </div>
  );
}


function PaymentFormModal({ charge, onClose, onSave }){
  const remaining = Math.max(0, charge.amount - (charge.paidAmount || 0));
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [amount, setAmount] = useState(remaining);
  const [date, setDate] = useState(todayStr());
  const [proof, setProof] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if(!(Number(amount) > 0)){ setError('Informe um valor pago válido.'); return; }
    setBusy(true);
    try{
      await onSave({ method, amount:Number(amount), date, proof: proof.trim() || null });
      onClose();
    }catch(e){
      setError('Não foi possível registrar o pagamento agora.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <h3>Registrar pagamento</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="field hint" style={{marginBottom:12}}>Saldo em aberto: {formatCurrency(remaining)}</div>
        <div className="field">
          <label>Forma de pagamento</label>
          <select value={method} onChange={e=>setMethod(e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Valor pago (R$)</label>
          <input type="number" min="0" step="10" value={amount} onChange={e=>setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Data do pagamento</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Comprovante <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(link ou referência, opcional)</span></label>
          <input value={proof} onChange={e=>setProof(e.target.value)} placeholder="Link do comprovante ou nº da transação" />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Registrando…' : 'Registrar pagamento (baixa manual)'}
          </button>
        </div>
      </div>
    </div>
  );
}


function RecebimentosPanel({ psicologoId, professionalName }){
  const [charges, setCharges] = useState(null);
  const [patients, setPatients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [patientFilter, setPatientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [presetSession, setPresetSession] = useState(null);
  const [payingCharge, setPayingCharge] = useState(null);

  const refresh = useCallback(async () => {
    const [c, p, s, r] = await Promise.all([loadCharges(), loadPatients(), loadSessions(), loadReceipts()]);
    setCharges(c.filter(x => x.psicologoId === psicologoId));
    setPatients(p.filter(x => x.psicologoId === psicologoId));
    setSessions(s.filter(x => x.psicologoId === psicologoId));
    setReceipts(r.filter(x => x.psicologoId === psicologoId));
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveCharge = async (data) => {
    const all = await loadCharges();
    const newCharge = { id: chargeId(), psicologoId, status:'pendente', paidAmount:0, payments:[], createdAt:new Date().toISOString(), ...data };
    await saveCharges([...all, newCharge]);
    setShowChargeForm(false);
    setPresetSession(null);
    await refresh();
  };

  const issueReceipt = async (charge) => {
    const patient = patients.find(p => p.id === charge.patientId);
    const allReceipts = await loadReceipts();
    const number = 'REC-' + String(allReceipts.filter(r=>r.psicologoId===psicologoId).length + 1).padStart(4, '0');
    const newReceipt = {
      id: receiptId(), psicologoId, chargeId: charge.id, patientId: charge.patientId, number,
      professionalName, patientName: patient ? (patient.socialName||patient.name) : 'Paciente',
      service: charge.description, date: charge.dueDate || todayStr(), amount: charge.paidAmount || charge.amount,
      status:'emitido', issuedAt:new Date().toISOString(), supersedes:null,
    };
    await saveReceipts([...allReceipts, newReceipt]);
    generateReceiptPDF(newReceipt);
    await refresh();
  };

  const registerPayment = async (data) => {
    const all = await loadCharges();
    const updated = all.map(c => {
      if(c.id !== payingCharge.id) return c;
      const newPaid = Math.min(c.amount, (c.paidAmount || 0) + data.amount);
      const status = newPaid >= c.amount ? 'pago' : 'parcial';
      return { ...c, paidAmount:newPaid, status, payments:[...(c.payments||[]), data] };
    });
    await saveCharges(updated);
    setPayingCharge(null);
    await refresh();
  };

  const cancelCharge = async (charge) => {
    const all = await loadCharges();
    const updated = all.map(c => c.id === charge.id ? { ...c, status:'cancelado' } : c);
    await saveCharges(updated);
    await refresh();
  };

  const refundCharge = async (charge) => {
    const all = await loadCharges();
    const updated = all.map(c => c.id === charge.id ? { ...c, status:'reembolsado' } : c);
    await saveCharges(updated);
    await refresh();
  };

  if(charges === null){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando recebimentos…</div>;
  }

  const chargedSessionIds = new Set(charges.map(c => c.sessionId).filter(Boolean));
  const readySessions = sessions.filter(s => s.status === 'realizada' && !chargedSessionIds.has(s.id))
                                 .sort((a,b) => (b.date+b.startTime).localeCompare(a.date+a.startTime));

  const statusLabel = { pendente:'Pendente', pago:'Pago', vencido:'Vencido', cancelado:'Cancelado', reembolsado:'Reembolsado', parcial:'Parcialmente pago' };

  const filtered = charges.filter(c => {
    if(patientFilter !== 'all' && c.patientId !== patientFilter) return false;
    const isOverdue = c.status === 'pendente' && c.dueDate && c.dueDate < todayStr();
    const effectiveStatus = isOverdue ? 'vencido' : c.status;
    if(statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;
    return true;
  }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div>
      {readySessions.length > 0 && (
        <div className="panel">
          <h3>Sessões realizadas sem cobrança</h3>
          <div className="panel-sub">Gere a cobrança em um clique — o valor vem da sessão.</div>
          {readySessions.map(s => {
            const patient = patients.find(p => p.id === s.patientId);
            return (
              <div className="quick-charge-row" key={s.id}>
                <span>{patient ? (patient.socialName||patient.name) : 'Paciente removido'} — {formatDateOnly(s.date)} às {s.startTime} — {formatCurrency(s.valor)}</span>
                <button className="btn-link" onClick={()=>{ setPresetSession(s); setShowChargeForm(true); }}>Gerar cobrança</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="toolbar">
        <select value={patientFilter} onChange={e=>setPatientFilter(e.target.value)}>
          <option value="all">Todos os pacientes</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.socialName||p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="parcial">Parcialmente pago</option>
          <option value="pago">Pago</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
          <option value="reembolsado">Reembolsado</option>
        </select>
        <button className="btn-new" onClick={()=>{ setPresetSession(null); setShowChargeForm(true); }}><IconPlus size={15}/> Nova cobrança avulsa</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconWallet size={24}/></div>
          <h2>{charges.length === 0 ? 'Nenhuma cobrança ainda' : 'Nada por aqui'}</h2>
          <p>{charges.length === 0
            ? 'Gere uma cobrança a partir de uma sessão realizada ou crie uma avulsa.'
            : 'Nenhuma cobrança corresponde aos filtros selecionados.'}</p>
        </div>
      ) : (
        filtered.map(c => {
          const patient = patients.find(p => p.id === c.patientId);
          const isOverdue = c.status === 'pendente' && c.dueDate && c.dueDate < todayStr();
          const displayStatus = isOverdue ? 'vencido' : c.status;
          const canPay = c.status === 'pendente' || c.status === 'parcial';
          const canCancel = c.status === 'pendente' || c.status === 'parcial';
          const canRefund = c.status === 'pago' || c.status === 'parcial';
          const hasActiveReceipt = receipts.some(r => r.chargeId === c.id && r.status === 'emitido');
          const canIssueReceipt = (c.status === 'pago' || c.status === 'parcial') && !hasActiveReceipt;
          return (
            <div className="charge-card" key={c.id}>
              <div className="cc-top">
                <div>
                  <div className="cc-title">{c.description}</div>
                  <div className="cc-sub">{patient ? (patient.socialName||patient.name) : 'Paciente removido'}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="cc-amount">{formatCurrency(c.amount)}</div>
                  <span className={'badge status-'+displayStatus}>{statusLabel[displayStatus]}</span>
                </div>
              </div>
              <div className="cc-meta-row">
                {c.dueDate && <span>Vencimento: {formatDateOnly(c.dueDate)}</span>}
                {c.sessionId && <span>Vinculada a uma sessão</span>}
                {c.paidAmount > 0 && <span>Pago até agora: {formatCurrency(c.paidAmount)}</span>}
                {hasActiveReceipt && <span>Recibo já emitido</span>}
              </div>
              {c.payments && c.payments.length > 0 && (
                <div className="cc-payments">
                  {c.payments.map((p,i) => (
                    <div key={i}>{formatDateOnly(p.date)} · {p.method} · {formatCurrency(p.amount)}{p.proof ? ' · comprovante: '+p.proof : ''}</div>
                  ))}
                </div>
              )}
              <div className="cc-actions">
                {canPay && <button className="btn-link" onClick={()=>setPayingCharge(c)}>Registrar pagamento</button>}
                {canIssueReceipt && <button className="btn-link" style={{fontWeight:700}} onClick={()=>issueReceipt(c)}>Emitir recibo (PDF)</button>}
                {canCancel && <button className="btn-link" style={{color:'var(--danger)'}} onClick={()=>cancelCharge(c)}>Cancelar</button>}
                {canRefund && <button className="btn-link" style={{color:'var(--danger)'}} onClick={()=>refundCharge(c)}>Marcar como reembolsado</button>}
              </div>
            </div>
          );
        })
      )}

      {showChargeForm && (
        <ChargeFormModal patients={patients} presetSession={presetSession}
                          onClose={()=>{ setShowChargeForm(false); setPresetSession(null); }} onSave={saveCharge} />
      )}
      {payingCharge && (
        <PaymentFormModal charge={payingCharge} onClose={()=>setPayingCharge(null)} onSave={registerPayment} />
      )}
    </div>
  );
}

/* ---------- App ---------- */


export { FinanceiroPsicologo };
