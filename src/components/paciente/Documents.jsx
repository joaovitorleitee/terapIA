import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadPatients, loadPatientDocuments, uploadPatientDocument, getPatientDocumentUrl, deletePatientDocument,
  formatDate, DOCUMENT_CATEGORIES,
} from '../../lib/dataStore.js';
import { IconUserPlus, IconPlus, IconTrash, IconNote } from '../icons.jsx';

function DocumentosPaciente({ user }){
  const [loading, setLoading] = useState(true);
  const [patientRecord, setPatientRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [description, setDescription] = useState('');
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
    </div>
  );
}

export { DocumentosPaciente };
