import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadPatients, loadPatientDocuments, uploadPatientDocument, getPatientDocumentUrl, deletePatientDocument,
  loadCurrentConsentTerm, getConsentTermUrl, loadConsentSignature, signConsentTerm, refuseConsentTerm,
  formatDate, DOCUMENT_CATEGORIES,
} from '../../lib/dataStore.js';
import { showToast } from '../../lib/toast.js';
import { TermsModal } from '../shared.jsx';
import { IconUserPlus, IconPlus, IconTrash, IconNote, IconShield, IconCheckCircle } from '../icons.jsx';

function ConsentSignModal({ term, onClose, onSigned, onRefused }){
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const openDoc = async () => {
    const url = await getConsentTermUrl(term.storagePath);
    if(url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  const doSign = async () => { setBusy(true); try{ await onSigned(); } finally{ setBusy(false); } };
  const doRefuse = async () => {
    const ok = window.confirm('Tem certeza que quer recusar este termo? Você não conseguirá agendar sessões enquanto ele não for assinado.');
    if(!ok) return;
    setBusy(true); try{ await onRefused(); } finally{ setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <h3>{term.title}</h3>
        <div className="field hint" style={{marginBottom:14}}>Leia o documento com atenção antes de assinar.</div>
        <button className="btn-secondary" style={{width:'auto', padding:'9px 16px', marginBottom:16}} onClick={openDoc}>Abrir documento para leitura</button>
        <label className="checkbox-row" style={{display:'flex', gap:8, alignItems:'flex-start', marginBottom:16, cursor:'pointer'}}>
          <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} />
          <span style={{fontSize:13}}>Li e concordo com os termos descritos no documento acima.</span>
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={doRefuse} disabled={busy} style={{color:'var(--danger)'}}>Recusar</button>
          <button className="btn-primary" type="button" onClick={doSign} disabled={busy || !checked}>
            {busy && <span className="spinner"/>}
            {busy ? 'Assinando…' : 'Assinar digitalmente'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsentimentosPanel({ user, patientRecord }){
  const [term, setTerm] = useState(null);
  const [signature, setSignature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSign, setShowSign] = useState(false);
  const [showTerapiaTerms, setShowTerapiaTerms] = useState(false);

  const refresh = useCallback(async () => {
    const t = await loadCurrentConsentTerm(patientRecord.psicologoId);
    setTerm(t);
    setSignature(t ? await loadConsentSignature(t.id, patientRecord.id) : null);
    setLoading(false);
  }, [patientRecord.psicologoId, patientRecord.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const openDoc = async () => {
    if(!term) return;
    const url = await getConsentTermUrl(term.storagePath);
    if(url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSign = async () => {
    await signConsentTerm({ consentTermId: term.id, psicologoId: patientRecord.psicologoId, patientId: patientRecord.id });
    setShowSign(false);
    await refresh();
    showToast('Termo assinado com sucesso.');
  };
  const handleRefuse = async () => {
    await refuseConsentTerm({ consentTermId: term.id, psicologoId: patientRecord.psicologoId, patientId: patientRecord.id });
    setShowSign(false);
    await refresh();
    showToast('Recusa registrada.');
  };

  if(loading) return <div style={{padding:20, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>;

  const status = signature ? signature.status : 'pendente';

  return (
    <div>
      <div className="panel">
        <h3>Termo de Uso do TerapIA</h3>
        <div className="panel-sub">Consentimento com a própria plataforma — diferente do termo terapêutico abaixo.</div>
        <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
          <IconCheckCircle size={16} color="var(--primary-dark)" />
          <span style={{fontSize:13}}>Aceito em {formatDate(user.termsAcceptedAt)} · versão {user.termsVersion}</span>
        </div>
        <button className="btn-link" style={{marginTop:8}} onClick={()=>setShowTerapiaTerms(true)}>Ver termo</button>
      </div>

      <div className="panel">
        <h3>Termo de Consentimento Terapêutico</h3>
        <div className="panel-sub">Formaliza o consentimento com o acompanhamento terapêutico do seu psicólogo.</div>
        {!term ? (
          <div className="field hint" style={{marginTop:8}}>Seu psicólogo ainda não cadastrou este termo.</div>
        ) : (
          <React.Fragment>
            <div style={{marginTop:8, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <span className={'badge '+(status==='assinado' ? 'status-confirmada' : status==='recusado' ? 'status-cancelada' : 'status-pendente')}>
                {status==='assinado' ? 'Assinado' : status==='recusado' ? 'Recusado' : 'Pendente de assinatura'}
              </span>
              {signature && signature.signedAt && <span style={{fontSize:12, color:'var(--ink-faint)'}}>em {formatDate(signature.signedAt)}</span>}
            </div>
            <div style={{display:'flex', gap:10, marginTop:12}}>
              <button className="btn-link" onClick={openDoc}>Ver documento</button>
              {status !== 'assinado' && (
                <button className="btn-link" style={{fontWeight:700}} onClick={()=>setShowSign(true)}>
                  {status === 'recusado' ? 'Revisar e assinar' : 'Ler e assinar'}
                </button>
              )}
            </div>
            {status !== 'assinado' && (
              <div className="alert alert-danger" style={{marginTop:12}}>Você precisa assinar este termo antes de agendar novas sessões.</div>
            )}
          </React.Fragment>
        )}
      </div>

      {showSign && term && (
        <ConsentSignModal term={term} onClose={()=>setShowSign(false)} onSigned={handleSign} onRefused={handleRefuse} />
      )}
      {showTerapiaTerms && <TermsModal onClose={()=>setShowTerapiaTerms(false)} />}
    </div>
  );
}

function DocumentosPaciente({ user }){
  const [loading, setLoading] = useState(true);
  const [patientRecord, setPatientRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [description, setDescription] = useState('');
  const [tab, setTab] = useState('arquivos'); // arquivos | consentimentos
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    const allPatients = await loadPatients();
    const record = allPatients.find(p => p.email.toLowerCase() === user.email.toLowerCase());
    setPatientRecord(record || null);
    if(record){
      setDocuments(await loadPatientDocuments(record.id));
    }
    setLoading(false);
  }, [user.email]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleFileChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if(!file || !patientRecord) return;
    setError('');
    setUploading(true);
    const result = await uploadPatientDocument({
      psicologoId: patientRecord.psicologoId, patientId: patientRecord.id, uploadedByRole: 'paciente',
      file, category: '', description: description.trim(),
    });
    setUploading(false);
    if(result.error){ setError(result.error); return; }
    setDescription('');
    await refresh();
    showToast('Documento enviado com sucesso.');
  };

  const openDocument = async (doc) => {
    const url = await getPatientDocumentUrl(doc.storagePath);
    if(url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const removeDocument = async (doc) => {
    const ok = window.confirm(`Excluir "${doc.fileName}"?`);
    if(!ok) return;
    await deletePatientDocument(doc.id, doc.storagePath);
    await refresh();
    showToast('Documento excluído com sucesso.');
  };

  const formatSize = (bytes) => {
    if(!bytes) return '';
    if(bytes < 1024*1024) return `${Math.round(bytes/1024)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
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

  return (
    <div>
      <div className="subtabs">
        <button className={tab==='arquivos'?'active':''} onClick={()=>setTab('arquivos')}>Meus arquivos</button>
        <button className={tab==='consentimentos'?'active':''} onClick={()=>setTab('consentimentos')}>
          <IconShield size={13} style={{marginRight:5, verticalAlign:-2}}/>Consentimentos
        </button>
      </div>

      {tab === 'consentimentos' && (
        <ConsentimentosPanel user={user} patientRecord={patientRecord} />
      )}

      {tab === 'arquivos' && (
        <React.Fragment>
      <div className="panel" style={{marginBottom:20}}>
        <h3>Enviar novo documento</h3>
        <div className="panel-sub">PDF, imagem (JPG/PNG/WEBP) ou Word — até 20MB. Visível apenas para você e seu psicólogo.</div>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="field full" style={{marginTop:10}}>
          <label>Observação <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
          <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: Exame de sangue de agosto" />
        </div>
        <input ref={fileInputRef} type="file" onChange={handleFileChosen} style={{display:'none'}}
               accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" />
        <button className="btn-primary" style={{width:'auto', padding:'10px 20px', marginTop:6}}
                onClick={()=>fileInputRef.current.click()} disabled={uploading}>
          {uploading && <span className="spinner"/>}
          <IconPlus size={15}/> {uploading ? 'Enviando…' : 'Escolher arquivo'}
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconNote size={24}/></div>
          <h2>Nenhum documento enviado ainda</h2>
          <p>Envie exames, atestados ou outros arquivos que seu psicólogo precise ver.</p>
        </div>
      ) : documents.map(doc => (
        <div className="task-card" key={doc.id}>
          <div className="tc-top">
            <div>
              <button className="btn-link" style={{fontWeight:700, textAlign:'left'}} onClick={()=>openDocument(doc)}>{doc.fileName}</button>
              <div className="tc-patient">{formatDate(doc.createdAt)} · {formatSize(doc.fileSize)}</div>
            </div>
            {doc.uploadedByRole === 'paciente' && (
              <button className="icon-btn" title="Excluir" onClick={()=>removeDocument(doc)}><IconTrash size={14}/></button>
            )}
          </div>
          {doc.category && <span className="badge badge-ativo" style={{marginTop:6}}>{doc.category}</span>}
          {doc.description && <div className="tc-instructions">{doc.description}</div>}
        </div>
      ))}
        </React.Fragment>
      )}
    </div>
  );
}

export { DocumentosPaciente };

