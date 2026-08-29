import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { loadPatients, savePatients, patientId, EMAIL_RE, TERMS_VERSION, formatDateOnly } from '../../lib/dataStore.js';
import { IconPlus, IconSearch, IconEdit, IconArchive, IconUserPlus } from '../icons.jsx';

function PatientFormModal({ patient, onClose, onSave }){
  const isEdit = !!patient;
  const [form, setForm] = useState(() => ({
    name: patient?.name || '',
    socialName: patient?.socialName || '',
    email: patient?.email || '',
    phone: patient?.phone || '',
    birthDate: patient?.birthDate || '',
    cpf: patient?.cpf || '',
    emergencyContact: patient?.emergencyContact || '',
    address: patient?.address || '',
    notes: patient?.notes || '',
    customPrice: patient?.customPrice ?? '',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError('');
    if(!form.name.trim()){ setError('Informe o nome do paciente.'); return; }
    if(!EMAIL_RE.test(form.email)){ setError('Informe um e-mail válido.'); return; }
    setBusy(true);
    try{
      await onSave(form);
    }catch(e){
      setError('Não foi possível salvar agora. Tente novamente.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        <h3>{isEdit ? 'Editar paciente' : 'Novo paciente'}</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>Nome</label>
            <input value={form.name} onChange={set('name')} placeholder="Nome completo" />
          </div>
          <div className="field full">
            <label>Nome social <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <input value={form.socialName} onChange={set('socialName')} placeholder="Como prefere ser chamado(a)" />
          </div>
          <div className="field">
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="paciente@exemplo.com" />
          </div>
          <div className="field">
            <label>Telefone</label>
            <input value={form.phone} onChange={set('phone')} placeholder="(11) 90000-0000" />
          </div>
          <div className="field">
            <label>Data de nascimento</label>
            <input type="date" value={form.birthDate} onChange={set('birthDate')} />
          </div>
          <div className="field">
            <label>CPF <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <input value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" />
          </div>
          <div className="field full">
            <label>Contato de emergência</label>
            <input value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Nome e telefone" />
          </div>
          <div className="field full">
            <label>Endereço</label>
            <input value={form.address} onChange={set('address')} placeholder="Rua, número, cidade" />
          </div>
          <div className="field">
            <label>Valor personalizado por sessão (R$) <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <input type="number" min="0" step="10" value={form.customPrice} onChange={set('customPrice')} placeholder="Usar valor padrão" />
          </div>
          <div className="field full">
            <label>Observações administrativas</label>
            <textarea value={form.notes} onChange={set('notes')} placeholder="Informações administrativas — não use este campo para notas clínicas" />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Salvando…' : (isEdit ? 'Salvar alterações' : 'Cadastrar paciente')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Patients list & management (US-003) ---------- */


function PacientesPsicologo({ psicologoId }){
  const [patients, setPatients] = useState(null); // null = carregando
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ativo'); // ativo | arquivado | todos
  const [editing, setEditing] = useState(null); // patient object or 'new' or null
  const [linkedProfiles, setLinkedProfiles] = useState([]);

  const refresh = useCallback(async () => {
    const p = await loadPatients();
    const mine = p.filter(x => x.psicologoId === psicologoId);
    setPatients(mine);
    try{
      const emails = mine.map(x => x.email.toLowerCase());
      if(emails.length){
        const { data } = await supabase.from('profiles').select('email, terms_accepted_at, terms_version').eq('role','paciente').in('email', emails);
        setLinkedProfiles(data || []);
      } else {
        setLinkedProfiles([]);
      }
    }catch(e){ setLinkedProfiles([]); }
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const consentFor = (patient) => {
    const linked = linkedProfiles.find(u => u.email.toLowerCase() === patient.email.toLowerCase());
    if(!linked) return null; // ainda não criou conta própria (ou ainda não migrado para o banco real)
    return !!(linked.terms_accepted_at && linked.terms_version === TERMS_VERSION);
  };

  const save = async (form) => {
    const all = await loadPatients();
    if(editing && editing !== 'new'){
      const updated = all.map(p => p.id === editing.id ? { ...p, ...form } : p);
      await savePatients(updated);
    } else {
      const newPatient = { id: patientId(), psicologoId, status:'ativo', createdAt:new Date().toISOString(), ...form };
      await savePatients([...all, newPatient]);
    }
    setEditing(null);
    await refresh();
  };

  const toggleStatus = async (patient) => {
    const all = await loadPatients();
    const updated = all.map(p => p.id === patient.id ? { ...p, status: p.status === 'ativo' ? 'arquivado' : 'ativo' } : p);
    await savePatients(updated);
    await refresh();
  };

  if(patients === null){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando pacientes…</div>;
  }

  const filtered = patients.filter(p => {
    if(statusFilter !== 'todos' && p.status !== statusFilter) return false;
    if(query.trim()){
      const q = query.toLowerCase();
      if(!p.name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="toolbar">
        <div style={{position:'relative', flex:1, minWidth:180}}>
          <IconSearch size={15} color="var(--ink-faint)" style={{position:'absolute', left:11, top:'50%', transform:'translateY(-50%)'}} />
          <input className="search-input" style={{paddingLeft:34}} placeholder="Buscar por nome ou e-mail"
                 value={query} onChange={e=>setQuery(e.target.value)} />
        </div>
        <div className="filter-pills">
          <button className={'filter-pill '+(statusFilter==='ativo'?'active':'')} onClick={()=>setStatusFilter('ativo')}>Ativos</button>
          <button className={'filter-pill '+(statusFilter==='arquivado'?'active':'')} onClick={()=>setStatusFilter('arquivado')}>Arquivados</button>
          <button className={'filter-pill '+(statusFilter==='todos'?'active':'')} onClick={()=>setStatusFilter('todos')}>Todos</button>
        </div>
        <button className="btn-new" onClick={()=>setEditing('new')}><IconPlus size={15}/> Novo paciente</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconUserPlus size={24} /></div>
          <h2>{patients.length === 0 ? 'Nenhum paciente cadastrado' : 'Nada por aqui'}</h2>
          <p>{patients.length === 0
            ? 'Cadastre seu primeiro paciente para começar a organizar agenda, sessões e financeiro.'
            : 'Nenhum paciente corresponde à busca ou ao filtro selecionado.'}</p>
          {patients.length === 0 && (
            <button className="btn-primary" style={{marginTop:16, width:'auto', padding:'10px 20px'}} onClick={()=>setEditing('new')}>
              <IconPlus size={15}/> Cadastrar paciente
            </button>
          )}
        </div>
      ) : (
        <div className="patient-list">
          {filtered.map(p => {
            const consent = consentFor(p);
            const initials = p.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
            return (
              <div className="patient-row" key={p.id}>
                <div className="p-avatar">{initials}</div>
                <div className="p-main">
                  <div className="p-name">
                    {p.socialName || p.name}
                    <span className={'badge '+(p.status==='ativo'?'badge-ativo':'badge-arquivado')}>{p.status==='ativo'?'Ativo':'Arquivado'}</span>
                    {consent === true && <span className="badge badge-consent-ok">Consentimento OK</span>}
                    {consent === false && <span className="badge badge-consent-pending">Consentimento pendente</span>}
                    {consent === null && <span className="badge badge-consent-pending">Sem conta vinculada</span>}
                  </div>
                  <div className="p-sub">{p.email}{p.phone ? ' · '+p.phone : ''}{p.birthDate ? ' · nasc. '+formatDateOnly(p.birthDate) : ''}</div>
                </div>
                <div className="p-actions">
                  <button className="icon-btn" title="Editar" onClick={()=>setEditing(p)}><IconEdit size={15}/></button>
                  <button className="icon-btn" title={p.status==='ativo'?'Arquivar':'Reativar'} onClick={()=>toggleStatus(p)}><IconArchive size={15}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PatientFormModal
          patient={editing === 'new' ? null : editing}
          onClose={()=>setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

/* ---------- Agenda: Disponibilidade (US-006) ---------- */


export { PatientFormModal, PacientesPsicologo };
