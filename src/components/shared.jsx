import React, { useState } from 'react';
import { IconSparkle } from './icons.jsx';
import { TERMS_VERSION } from '../lib/dataStore.js';

function EmptyState({ builtBy }){
  return (
    <div className="empty-state">
      <div className="icon-wrap"><IconSparkle size={26} /></div>
      <h2>Ainda não construído</h2>
      <p>Esta área faz parte do MVP e será implementada nas próximas etapas, seguindo a ordem combinada no backlog.</p>
      {builtBy && <span className="tag">Chega com {builtBy}</span>}
    </div>
  );
}

/* ---------- Painel (psicólogo) placeholder content ---------- */


function TagInput({ tags, onChange }){
  const [draft, setDraft] = useState('');
  const addTag = () => {
    const t = draft.trim();
    if(t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };
  const removeTag = (t) => onChange(tags.filter(x => x !== t));
  return (
    <div>
      {tags.length > 0 && (
        <div className="tag-input-row">
          {tags.map(t => (
            <span className="tag-chip" key={t}>{t}<button type="button" onClick={()=>removeTag(t)} aria-label={`Remover tag ${t}`}>×</button></span>
          ))}
        </div>
      )}
      <input value={draft} onChange={e=>setDraft(e.target.value)}
             onKeyDown={e=>{ if(e.key==='Enter' || e.key===','){ e.preventDefault(); addTag(); } }}
             onBlur={addTag}
             placeholder="Digite uma tag e pressione Enter" />
    </div>
  );
}


function TermsBody(){
  return (
    <React.Fragment>
      <p>Este é um resumo de demonstração para o protótipo do MVP. A TerapIA trata dados de saúde com base no seu consentimento explícito, aplica controle de acesso por papel e nunca expõe notas privadas do psicólogo ao paciente. A versão final e juridicamente válida destes termos será redigida antes do lançamento em produção (Fase 2).</p>
      <p>Ao aceitar, você concorda com o tratamento dos seus dados administrativos para viabilizar agendamento, acompanhamento terapêutico e cobrança, conforme a LGPD. Você pode consultar o status do seu consentimento a qualquer momento na sua área.</p>
    </React.Fragment>
  );
}
function TermsModal({ onClose }){
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <h3>Termos de uso e política de privacidade</h3>
        <div className="field hint" style={{marginBottom:10}}>Versão {TERMS_VERSION}</div>
        <TermsBody />
        <button className="btn-primary" style={{marginTop:8}} onClick={onClose}>Entendi</button>
      </div>
    </div>
  );
}

/* ---------- Consent gate (US-002) ---------- */


function AuthShell({ children }){
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><IconSparkle size={17} color="#F4F6F2" /></div>
          <div className="brand-name">TerapIA</div>
        </div>
        {children}
      </div>
    </div>
  );
}


export { EmptyState, TagInput, TermsBody, TermsModal, AuthShell };
