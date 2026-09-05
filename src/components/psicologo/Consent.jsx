import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadPatients, loadCurrentConsentTerm, loadConsentTermsHistory, uploadConsentTerm, getConsentTermUrl,
  loadConsentSignaturesForTerm, formatDate,
} from '../../lib/dataStore.js';
import { showToast } from '../../lib/toast.js';
import { IconPlus, IconShield } from '../icons.jsx';

function ConsentimentoPsicologo({ psicologoId }){
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [patients, setPatients] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    const [term, hist, pats] = await Promise.all([
      loadCurrentConsentTerm(psicologoId), loadConsentTermsHistory(psicologoId), loadPatients(),
    ]);
    setCurrent(term);
    setHistory(hist);
    setPatients(pats.filter(p => p.psicologoId === psicologoId && p.status === 'ativo'));
    if(term){
      setSignatures(await loadConsentSignaturesForTerm(term.id));
    } else {
      setSignatures([]);
    }
    setLoading(false);
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleFileChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if(!file) return;
    setError('');
    setUploading(true);
    const result = await uploadConsentTerm({ psicologoId, file, title: title.trim() });
    setUploading(false);
    if(result.error){ setError(result.error); return; }
    setTitle('');
    await refresh();
    showToast('Termo de consentimento enviado com sucesso.');
  };

  const openDocument = async (term) => {
    const url = await getConsentTermUrl(term.storagePath);
    if(url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  if(loading){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>;
  }

  const statusLabel = { pendente:'Pendente', assinado:'Assinado', recusado:'Recusado' };
  const patientName = (id) => { const p = patients.find(x => x.id === id); return p ? (p.socialName||p.name) : 'Paciente'; };
  const signatureFor = (patientId) => signatures.find(s => s.patientId === patientId);

  return (
    <div>
      <div className="alert alert-success" style={{marginBottom:16}}>
        Este Termo de Consentimento Terapêutico é diferente do Termo de Uso do TerapIA (esse fica em outra tela) — são dois documentos e dois status independentes.
      </div>

      <div className="panel">
        <h3>{current ? 'Substituir termo vigente' : 'Cadastrar Termo de Consentimento Terapêutico'}</h3>
        <div className="panel-sub">Word, PDF ou imagem — até 20MB. Fica disponível automaticamente para todos os seus pacientes ativos assinarem.</div>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="field full" style={{marginTop:10}}>
          <label>Título do termo <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Termo de Consentimento Terapêutico 2026" />
        </div>
        <input ref={fileInputRef} type="file" onChange={handleFileChosen} style={{display:'none'}}
               accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
        <button className="btn-primary" style={{width:'auto', padding:'10px 20px', marginTop:6}}
                onClick={()=>fileInputRef.current.click()} disabled={uploading}>
          {uploading && <span className="spinner"/>}
          <IconPlus size={15}/> {uploading ? 'Enviando…' : current ? 'Enviar nova versão' : 'Enviar termo'}
        </button>
        {current && (
          <div className="field hint" style={{marginTop:10}}>
            Enviar uma nova versão torna a anterior obsoleta — todos os pacientes precisarão assinar a nova, mesmo quem já tinha assinado a antiga.
          </div>
        )}
      </div>

      {current && (
        <div className="panel">
          <h3>Termo vigente</h3>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10}}>
            <div>
              <button className="btn-link" style={{fontWeight:700}} onClick={()=>openDocument(current)}>{current.title}</button>
              <div style={{fontSize:11.5, color:'var(--ink-faint)', marginTop:2}}>Enviado em {formatDate(current.createdAt)}</div>
            </div>
          </div>

          <div className="field hint" style={{marginTop:16, marginBottom:8}}>Status de assinatura por paciente:</div>
          {patients.length === 0 ? (
            <div className="field hint">Nenhum paciente ativo.</div>
          ) : patients.map(p => {
            const sig = signatureFor(p.id);
            const status = sig ? sig.status : 'pendente';
            return (
              <div className="mini-session-row" key={p.id}>
                <span>{p.socialName || p.name}</span>
                <span className={'badge '+(status==='assinado' ? 'status-confirmada' : status==='recusado' ? 'status-cancelada' : 'status-pendente')}>
                  {statusLabel[status]}{sig && sig.signedAt ? ' · '+formatDate(sig.signedAt) : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {history.length > 1 && (
        <div className="panel">
          <h3>Versões anteriores</h3>
          {history.filter(h => !h.isCurrent).map(h => (
            <div className="mini-session-row" key={h.id}>
              <button className="btn-link" onClick={()=>openDocument(h)}>{h.title}</button>
              <span style={{color:'var(--ink-faint)', fontSize:12}}>{formatDate(h.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ConsentimentoPsicologo };
