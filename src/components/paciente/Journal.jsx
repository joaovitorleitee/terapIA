import React, { useState, useEffect, useCallback } from 'react';
import { loadPatients, loadJournalEntries, saveJournalEntry, formatDateOnly, todayStr, MOOD_OPTIONS } from '../../lib/dataStore.js';
import { IconUserPlus, IconNote } from '../icons.jsx';

function DiarioPaciente({ user }){
  const [loading, setLoading] = useState(true);
  const [patientRecord, setPatientRecord] = useState(null);
  const [entries, setEntries] = useState([]);
  const [mood, setMood] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    const allPatients = await loadPatients();
    const record = allPatients.find(p => p.email.toLowerCase() === user.email.toLowerCase());
    setPatientRecord(record || null);
    if(record){
      const list = await loadJournalEntries(record.id);
      setEntries(list);
      const today = list.find(e => e.entryDate === todayStr());
      if(today){ setMood(today.mood); setContent(today.content); }
    }
    setLoading(false);
  }, [user.email]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    if(!content.trim() || !patientRecord) return;
    setSaving(true);
    await saveJournalEntry({ psicologoId: patientRecord.psicologoId, patientId: patientRecord.id, entryDate: todayStr(), mood, content: content.trim() });
    setSaving(false);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
    await refresh();
  };

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

  const pastEntries = entries.filter(e => e.entryDate !== todayStr());
  const moodEmoji = (m) => (MOOD_OPTIONS.find(o => o.value === m) || {}).emoji || '';

  return (
    <div>
      <div className="panel" style={{marginBottom:20}}>
        <h3>Como você está hoje?</h3>
        <div className="panel-sub">Registre sua rotina, sentimentos ou sintomas. Você pode editar a entrada de hoje quantas vezes quiser — depois de virar o dia, ela fica só como histórico.</div>
        <div style={{display:'flex', gap:8, margin:'14px 0', flexWrap:'wrap'}}>
          {MOOD_OPTIONS.map(o => (
            <button key={o.value} type="button"
                    className={'filter-pill '+(mood===o.value?'active':'')}
                    onClick={()=>setMood(o.value)}>
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
        <textarea value={content} onChange={e=>setContent(e.target.value)} rows={5}
                  placeholder="Como foi seu dia? O que você sentiu? Alguma coisa que queira registrar para sua próxima sessão?"
                  style={{width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, fontFamily:'inherit', fontSize:14, resize:'vertical'}} />
        <button className="btn-primary" style={{width:'auto', padding:'10px 20px', marginTop:12}} onClick={save} disabled={saving || !content.trim()}>
          {saving && <span className="spinner"/>}
          {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar entrada de hoje'}
        </button>
      </div>

      <h3 style={{fontSize:15, marginBottom:10}}>Histórico</h3>
      {pastEntries.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconNote size={24}/></div>
          <h2>Nenhuma entrada anterior</h2>
          <p>Seu histórico de diário vai aparecer aqui, dia após dia.</p>
        </div>
      ) : pastEntries.map(e => (
        <div className="task-card" key={e.id}>
          <div className="tc-top">
            <div className="tc-title">{formatDateOnly(e.entryDate)} {moodEmoji(e.mood)}</div>
          </div>
          <div className="tc-instructions">{e.content}</div>
        </div>
      ))}
    </div>
  );
}

export { DiarioPaciente };
