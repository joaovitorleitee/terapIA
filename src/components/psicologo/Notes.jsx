import React, { useState, useEffect, useCallback } from 'react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { jsPDF } from 'jspdf';
import { loadSessions, loadNotes, saveNotes, noteId, pushAudit, formatDate, formatDateOnly, loadPatients } from '../../lib/dataStore.js';
import { TagInput } from '../shared.jsx';
import { IconLock, IconPlus, IconChevronLeft, IconChevronRight, IconNote, IconUsers } from '../icons.jsx';

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function buildProntuarioDocx(patient, selectedSessions, selectedNotes){
  const children = [
    new Paragraph({ text: `Prontuário — ${patient.socialName || patient.name}`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `Exportado em ${formatDate(new Date().toISOString())}`, spacing:{ after:240 } }),
    new Paragraph({ text: 'Sessões', heading: HeadingLevel.HEADING_2, spacing:{ after:120 } }),
  ];
  if(selectedSessions.length === 0){
    children.push(new Paragraph('Nenhuma sessão selecionada para esta exportação.'));
  } else {
    selectedSessions.forEach(s => {
      children.push(new Paragraph(`${formatDateOnly(s.date)} ${s.startTime} — ${s.status} — ${s.modalidade || 'Presencial'}`));
    });
  }
  children.push(new Paragraph({ text: 'Notas privadas', heading: HeadingLevel.HEADING_2, spacing:{ before:320, after:120 } }));
  if(selectedNotes.length === 0){
    children.push(new Paragraph('Nenhuma nota selecionada para esta exportação.'));
  } else {
    selectedNotes.forEach(n => {
      children.push(new Paragraph({
        spacing:{ before:220, after:60 },
        children: [
          new TextRun({ text: formatDate(n.createdAt), bold: true }),
          ...(n.tags && n.tags.length ? [new TextRun({ text: '  (' + n.tags.join(', ') + ')', italics:true, color:'888888' })] : []),
        ],
      }));
      children.push(new Paragraph({ text: n.text, spacing:{ after:120 } }));
    });
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

function buildProntuarioPdf(patient, selectedSessions, selectedNotes){
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginBottom = 20;
  let y = 20;
  const ensureSpace = (needed) => { if(y + needed > pageHeight - marginBottom){ doc.addPage(); y = 20; } };

  doc.setFontSize(16);
  doc.text(`Prontuário — ${patient.socialName || patient.name}`, 15, y); y += 8;
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Exportado em ${formatDate(new Date().toISOString())}`, 15, y); y += 10;
  doc.setTextColor(20);

  doc.setFontSize(13); doc.text('Sessões', 15, y); y += 7;
  doc.setFontSize(10);
  if(selectedSessions.length === 0){ ensureSpace(6); doc.text('Nenhuma sessão selecionada para esta exportação.', 15, y); y += 6; }
  selectedSessions.forEach(s => {
    ensureSpace(6);
    doc.text(`${formatDateOnly(s.date)} ${s.startTime} — ${s.status} — ${s.modalidade || 'Presencial'}`, 15, y);
    y += 6;
  });
  y += 6;

  doc.setFontSize(13); ensureSpace(10); doc.text('Notas privadas', 15, y); y += 7;
  doc.setFontSize(10);
  if(selectedNotes.length === 0){ ensureSpace(6); doc.text('Nenhuma nota selecionada para esta exportação.', 15, y); y += 6; }
  selectedNotes.forEach(n => {
    ensureSpace(8);
    doc.setFont(undefined, 'bold');
    doc.text(`${formatDate(n.createdAt)}${n.tags && n.tags.length ? '  (' + n.tags.join(', ') + ')' : ''}`, 15, y);
    doc.setFont(undefined, 'normal');
    y += 6;
    const lines = doc.splitTextToSize(n.text, 180);
    lines.forEach(line => { ensureSpace(6); doc.text(line, 15, y); y += 6; });
    y += 4;
  });
  return doc.output('blob');
}

function ExportRecordModal({ patient, sessions, notes, onClose, onExported }){
  const [selectedNoteIds, setSelectedNoteIds] = useState(() => new Set(notes.map(n => n.id)));
  const [format, setFormat] = useState('docx');
  const [busy, setBusy] = useState(false);

  const toggleNote = (id) => setSelectedNoteIds(prev => {
    const next = new Set(prev);
    if(next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const doExport = async () => {
    setBusy(true);
    try{
      const selectedNotes = notes.filter(n => selectedNoteIds.has(n.id));
      await onExported(format, sessions, selectedNotes);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" style={{maxHeight:'85vh', overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <h3>Exportar prontuário</h3>
        <div className="field full" style={{marginBottom:14}}>
          <label>Formato</label>
          <div className="filter-pills">
            <button type="button" className={'filter-pill '+(format==='docx'?'active':'')} onClick={()=>setFormat('docx')}>Word (.docx)</button>
            <button type="button" className={'filter-pill '+(format==='pdf'?'active':'')} onClick={()=>setFormat('pdf')}>PDF</button>
          </div>
        </div>
        <div className="field hint" style={{marginBottom:16}}>Todas as {sessions.length} sessão(ões) do paciente serão incluídas automaticamente no resumo.</div>

        <div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
            <div style={{fontSize:12.5, fontWeight:600}}>Notas a incluir ({selectedNoteIds.size} de {notes.length})</div>
            <div style={{display:'flex', gap:12}}>
              <button type="button" className="btn-link" onClick={()=>setSelectedNoteIds(new Set(notes.map(n=>n.id)))}>Selecionar todas</button>
              <button type="button" className="btn-link" onClick={()=>setSelectedNoteIds(new Set())}>Limpar</button>
            </div>
          </div>
          {notes.length === 0 ? (
            <div className="field hint">Nenhuma nota registrada para este paciente.</div>
          ) : (
            <div style={{maxHeight:280, overflowY:'auto', border:'1px solid var(--border)', borderRadius:10, padding:4}}>
              {notes.map(n => (
                <label key={n.id} style={{display:'flex', gap:8, alignItems:'flex-start', padding:'8px 8px', borderBottom:'1px solid var(--border)', cursor:'pointer'}}>
                  <input type="checkbox" checked={selectedNoteIds.has(n.id)} onChange={()=>toggleNote(n.id)}
                         style={{width:'auto', padding:0, border:'none', background:'none', marginTop:3, flexShrink:0}} />
                  <div>
                    <div style={{fontSize:12.5, fontWeight:700}}>{formatDate(n.createdAt)}{n.tags && n.tags.length ? ' · '+n.tags.join(', ') : ''}</div>
                    <div style={{fontSize:12, color:'var(--ink-muted)'}}>{(n.text || '').length > 90 ? n.text.slice(0,90)+'…' : (n.text || '')}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{marginTop:16}}>
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={doExport} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Gerando…' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  // Registra o acesso ao prontuário (US-025) — uma vez por abertura da tela, nunca o conteúdo.
  useEffect(() => {
    pushAudit({ userId: currentUserId, action: 'prontuario_acessado', patientId: patient.id }).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

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

  const [showExportModal, setShowExportModal] = useState(false);

  const handleExport = async (format, selectedSessions, selectedNotes) => {
    const slug = (patient.name || 'paciente').replace(/\s+/g, '-').toLowerCase();
    if(format === 'docx'){
      const blob = await buildProntuarioDocx(patient, selectedSessions, selectedNotes);
      downloadBlob(blob, `prontuario-${slug}.docx`);
    } else {
      const blob = buildProntuarioPdf(patient, selectedSessions, selectedNotes);
      downloadBlob(blob, `prontuario-${slug}.pdf`);
    }
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
          <button className="btn-secondary" style={{width:'auto', padding:'8px 14px'}} onClick={()=>setShowExportModal(true)}>Exportar prontuário</button>
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

      {showExportModal && (
        <ExportRecordModal patient={patient} sessions={sessions} notes={notes} onClose={()=>setShowExportModal(false)} onExported={handleExport} />
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
