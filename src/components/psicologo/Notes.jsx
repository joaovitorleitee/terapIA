import React, { useState, useEffect, useCallback } from 'react';
import { loadSessions, loadNotes, saveNotes, noteId, pushAudit, formatDate, formatDateOnly, loadPatients } from '../../lib/dataStore.js';
import { TagInput } from '../shared.jsx';
import { IconLock, IconPlus, IconChevronLeft, IconChevronRight, IconNote, IconUsers } from '../icons.jsx';

function NoteForm({ sessions, editingNote, onCancel, onSave }){
  const [text, setText] = useState(editingNote?.text || '');
  const [tags, setTags] = useState(editingNote?.tags || []);
  const [sessionIdSel, setSessionIdSel] = useState(editingNote?.sessionId || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if(!text.trim()){ setError('Escreva o conteúdo da nota.'); return; }
    setBusy(true);
    try{
      await onSave({ text: text.trim(), tags, sessionId: sessionIdSel || null });
    }catch(e){
      setError('Não foi possível salvar a nota agora.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{borderColor:'var(--ink)', borderWidth:1.5}}>
      <div className="confidential-banner">
        <IconLock size={14}/> <span>Conteúdo confidencial — nunca é exibido ao paciente.</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="field">
        <label>Nota</label>
        <textarea value={text} onChange={e=>setText(e.target.value)} style={{minHeight:120}} placeholder="Registre observações clínicas sobre o acompanhamento..." />
      </div>
      <div className="field">
        <label>Vincular a uma sessão <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
        <select value={sessionIdSel} onChange={e=>setSessionIdSel(e.target.value)}>
          <option value="">Nenhuma sessão específica</option>
          {sessions.map(s => <option key={s.id} value={s.id}>{formatDateOnly(s.date)} às {s.startTime}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Tags <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
        <TagInput tags={tags} onChange={setTags} />
      </div>
      <div className="modal-actions">
        <button className="btn-secondary" type="button" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
          {busy && <span className="spinner"/>}
          {busy ? 'Salvando…' : (editingNote ? 'Salvar alterações' : 'Adicionar nota')}
        </button>
      </div>
    </div>
  );
}


function PatientRecordView({ patient, psicologoId, currentUserId, onBack }){
  const [sessions, setSessions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [s, n] = await Promise.all([loadSessions(), loadNotes()]);
    setSessions(
      s.filter(x => x.psicologoId === psicologoId && x.patientId === patient.id)
       .sort((a,b) => (b.date+b.startTime).localeCompare(a.date+a.startTime))
    );
    setNotes(
      n.filter(x => x.psicologoId === psicologoId && x.patientId === patient.id && !x.deleted)
       .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
    setLoading(false);
  }, [psicologoId, patient.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveNote = async (data) => {
    const all = await loadNotes();
    if(editingNote){
      const updated = all.map(n => n.id === editingNote.id ? { ...n, ...data, updatedAt:new Date().toISOString() } : n);
      await saveNotes(updated);
      await pushAudit({ userId:currentUserId, action:'nota_editada', patientId:patient.id, noteId:editingNote.id });
    } else {
      const newNote = { id: noteId(), psicologoId, patientId: patient.id, ...data, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), deleted:false };
      await saveNotes([...all, newNote]);
      await pushAudit({ userId:currentUserId, action:'nota_criada', patientId:patient.id, noteId:newNote.id });
    }
    setShowForm(false);
    setEditingNote(null);
    await refresh();
  };

  const deleteNote = async (n) => {
    const all = await loadNotes();
    const updated = all.map(x => x.id === n.id ? { ...x, deleted:true, deletedAt:new Date().toISOString() } : x);
    await saveNotes(updated); // soft-delete: preserva a nota e a trilha de auditoria
    await pushAudit({ userId:currentUserId, action:'nota_excluida', patientId:patient.id, noteId:n.id });
    await refresh();
  };

  const exportRecord = async () => {
    const lines = [];
    lines.push(`Prontuário — ${patient.socialName || patient.name}`);
    lines.push(`Exportado em ${formatDate(new Date().toISOString())}`);
    lines.push('');
    lines.push('== Sessões ==');
    if(sessions.length === 0) lines.push('Nenhuma sessão registrada.');
    sessions.forEach(s => lines.push(`${formatDateOnly(s.date)} ${s.startTime} — ${s.status} — ${s.modalidade || 'Presencial'}`));
    lines.push('');
    lines.push('== Notas privadas ==');
    if(notes.length === 0) lines.push('Nenhuma nota registrada.');
    notes.forEach(n => {
      lines.push(`[${formatDate(n.createdAt)}]${n.tags.length ? ' ('+n.tags.join(', ')+')' : ''}`);
      lines.push(n.text);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type:'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `prontuario-${(patient.name||'paciente').replace(/\s+/g,'-').toLowerCase()}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await pushAudit({ userId: currentUserId, action:'prontuario_exportado', patientId: patient.id });
  };

  if(loading) return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando prontuário…</div>;

  return (
    <div>
      <button className="btn-link" onClick={onBack} style={{marginBottom:14, display:'inline-flex', alignItems:'center', gap:4}}>
        <IconChevronLeft size={14}/> Voltar para pacientes
      </button>
      <div className="confidential-banner">
        <IconLock size={15}/> <span>Notas privadas — visíveis apenas para você. Nunca aparecem para o paciente.</span>
      </div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10}}>
        <h2 style={{margin:0, fontSize:19}}>{patient.socialName || patient.name}</h2>
        <div style={{display:'flex', gap:8}}>
          <button className="btn-secondary" style={{width:'auto', padding:'8px 14px'}} onClick={exportRecord}>Exportar prontuário</button>
          {!showForm && (
            <button className="btn-new" onClick={()=>{ setEditingNote(null); setShowForm(true); }}><IconPlus size={15}/> Nova nota</button>
          )}
        </div>
      </div>

      {showForm && (
        <NoteForm sessions={sessions} editingNote={editingNote}
                  onCancel={()=>{ setShowForm(false); setEditingNote(null); }} onSave={saveNote} />
      )}

      {notes.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconNote size={24}/></div>
          <h2>Nenhuma nota ainda</h2>
          <p>Registre observações confidenciais sobre o acompanhamento deste paciente.</p>
        </div>
      ) : (
        notes.map(n => {
          const linkedSession = n.sessionId ? sessions.find(s => s.id === n.sessionId) : null;
          return (
            <div className="note-card" key={n.id}>
              <div className="note-date">
                {formatDate(n.createdAt)}{n.updatedAt && n.updatedAt !== n.createdAt ? ' · editado' : ''}
                {linkedSession ? ` · sessão de ${formatDateOnly(linkedSession.date)}` : ''}
              </div>
              <div className="note-text">{n.text}</div>
              {n.tags.length > 0 && (
                <div className="note-tags">{n.tags.map(t => <span className="note-tag" key={t}>{t}</span>)}</div>
              )}
              <div className="note-actions">
                <button className="btn-link" onClick={()=>{ setEditingNote(n); setShowForm(true); }}>Editar</button>
                <button className="btn-link" style={{color:'var(--danger)'}} onClick={()=>deleteNote(n)}>Excluir</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}


function SessoesNotasPsicologo({ psicologoId, currentUserId }){
  const [patients, setPatients] = useState(null);
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(async () => {
    const p = await loadPatients();
    setPatients(p.filter(x => x.psicologoId === psicologoId && x.status === 'ativo'));
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  if(selected){
    return <PatientRecordView patient={selected} psicologoId={psicologoId} currentUserId={currentUserId} onBack={()=>setSelected(null)} />;
  }

  if(patients === null){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>;
  }

  return (
    <div>
      <div className="confidential-banner">
        <IconLock size={15}/> <span>Prontuários e notas privadas — acesso restrito a você.</span>
      </div>
      {patients.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconUsers size={24}/></div>
          <h2>Nenhum paciente ativo</h2>
          <p>Cadastre pacientes em "Pacientes" para começar a registrar sessões e notas.</p>
        </div>
      ) : (
        <div className="patient-list">
          {patients.map(p => {
            const initials = p.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
            return (
              <div className="patient-row" key={p.id} style={{cursor:'pointer'}} onClick={()=>setSelected(p)}>
                <div className="p-avatar">{initials}</div>
                <div className="p-main">
                  <div className="p-name">{p.socialName || p.name}</div>
                  <div className="p-sub">{p.email}</div>
                </div>
                <IconChevronRight size={16} color="var(--ink-faint)" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Homework tasks — psicólogo (US-011) ---------- */


export { SessoesNotasPsicologo };
