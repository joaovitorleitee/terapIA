import React, { useState, useEffect } from 'react';
import { IconSparkle } from './icons.jsx';
import { TERMS_VERSION, buildPixPayload, generatePixQrDataUrl, formatCurrency } from '../lib/dataStore.js';

function EmptyState({ builtBy }){
  return (
    <div className="empty-state">
      <div className="icon-wrap"><IconSparkle size={26} /></div>
      <h2>Em breve</h2>
      <p>Esta área ainda está sendo preparada.</p>
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
      <p>A TerapIA trata dados de saúde com base no seu consentimento explícito, aplica controle de acesso por papel e nunca expõe notas privadas do psicólogo ao paciente. Este é um resumo; a versão completa dos termos está disponível mediante solicitação.</p>
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


function PixQrModal({ pixKey, merchantName, merchantCity, amount, txid, description, onClose }){
  const [qrUrl, setQrUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const payload = buildPixPayload({ pixKey, merchantName, merchantCity, amount, txid, description });

  useEffect(() => {
    if(!payload) return;
    generatePixQrDataUrl(payload).then(setQrUrl).catch(()=>setQrUrl(null));
  }, [payload]);

  const copyPayload = async () => {
    try{ await navigator.clipboard.writeText(payload); setCopied(true); setTimeout(()=>setCopied(false), 2000); }catch(e){}
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{textAlign:'center'}} onClick={e=>e.stopPropagation()}>
        <h3>Pagar com Pix</h3>
        {!pixKey ? (
          <div className="alert alert-danger" style={{marginTop:10}}>O psicólogo ainda não cadastrou uma chave Pix.</div>
        ) : (
          <React.Fragment>
            <div className="field hint" style={{marginBottom:14}}>Escaneie o QR Code com o app do seu banco, ou copie o código Pix abaixo.</div>
            {qrUrl && <img src={qrUrl} alt="QR Code Pix" style={{width:220, height:220, margin:'0 auto 16px auto', display:'block'}} />}
            <div style={{fontSize:18, fontWeight:700, marginBottom:14}}>{formatCurrency(amount)}</div>
            <button className="btn-primary" type="button" onClick={copyPayload}>{copied ? 'Copiado!' : 'Copiar código Pix'}</button>
          </React.Fragment>
        )}
        <div className="modal-actions" style={{marginTop:16}}>
          <button className="btn-secondary" type="button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function WidgetPickerModal({ catalog, activeKeys, onAdd, onClose }){
  const groups = {};
  catalog.forEach(w => {
    if(activeKeys.includes(w.key)) return;
    (groups[w.group] = groups[w.group] || []).push(w);
  });
  const groupNames = Object.keys(groups);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <h3>Adicionar widget</h3>
        <div className="field hint" style={{marginBottom:16}}>Escolha um bloco informativo para adicionar ao seu painel.</div>
        {groupNames.length === 0 ? (
          <div className="field hint">Você já adicionou todos os widgets disponíveis.</div>
        ) : groupNames.map(g => (
          <div className="widget-picker-group" key={g}>
            <h4>{g}</h4>
            {groups[g].map(w => (
              <div className="widget-picker-item" key={w.key}>
                <span>{w.label}</span>
                <button className="btn-link" style={{fontWeight:700}} onClick={()=>onAdd(w.key)}>Adicionar</button>
              </div>
            ))}
          </div>
        ))}
        <div className="modal-actions" style={{marginTop:8}}>
          <button className="btn-secondary" type="button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

export { EmptyState, TagInput, TermsBody, TermsModal, AuthShell, PixQrModal, WidgetPickerModal };
