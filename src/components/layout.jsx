import React, { useState, useEffect, useCallback } from 'react';
import {
  loadNotificationsFor, saveNotificationsFor, loadThemeColor, saveThemeColor, applyTheme, THEME_PALETTES, formatDate,
  TAX_REGIMES, defaultProfessionalProfile, loadProfessionalProfile, saveProfessionalProfile,
  loadDataRightsConfig, saveDataRightsConfig, exportMyData, loadMyDeletionRequests, createDeletionRequest,
  getProfessionalPhotoUrl, uploadProfessionalPhoto,
} from '../lib/dataStore.js';
import { showToast } from '../lib/toast.js';
import { IconBell, IconEdit, IconLogOut, IconCheckCircle, IconShield, IconUsers } from './icons.jsx';

function NotificationsBell({ ownerId, namespace='notifications' }){
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);

  const refresh = useCallback(async () => {
    const l = await loadNotificationsFor(namespace, ownerId);
    setList(l);
  }, [ownerId, namespace]);

  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  useEffect(() => {
    if(!open) return;
    const close = (e) => { if(e.target && e.target.closest && e.target.closest('.notif-wrap')) return; setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const unread = list.filter(n => !n.read).length;

  const toggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if(willOpen && unread > 0){
      const updated = list.map(n => ({ ...n, read:true }));
      setList(updated);
      await saveNotificationsFor(namespace, ownerId, updated);
    }
  };

  return (
    <div className="account-menu-wrap notif-wrap" style={{marginRight:4}}>
      <button className="icon-btn" style={{position:'relative', background:'none', width:34, height:34}} onClick={toggle} aria-label="Notificações">
        <IconBell size={18}/>
        {unread>0 && (
          <span style={{position:'absolute', top:0, right:0, background:'var(--danger)', color:'#fff', fontSize:9.5, fontWeight:700, borderRadius:'50%', width:15, height:15, display:'flex', alignItems:'center', justifyContent:'center'}}>{unread}</span>
        )}
      </button>
      {open && (
        <div className="account-menu" style={{width:290, maxHeight:340, overflowY:'auto'}}>
          <div className="who" style={{marginBottom:4}}><div className="name">Notificações</div></div>
          {list.length === 0 ? (
            <div style={{padding:'12px 10px', fontSize:12.5, color:'var(--ink-faint)'}}>Nenhuma notificação ainda.</div>
          ) : list.slice(0,10).map(n => (
            <div key={n.id} style={{padding:'9px 10px', borderRadius:8}}>
              <div style={{fontSize:12.5, fontWeight:600, lineHeight:1.4}}>{n.message}</div>
              <div style={{fontSize:11, color:'var(--ink-faint)', marginTop:3}}>{formatDate(n.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function ProfileSettingsModal({ psicologoId, onClose }){
  const [tab, setTab] = useState('aparencia'); // aparencia | profissional | fiscal
  const [selected, setSelected] = useState('green');
  const [profile, setProfile] = useState(defaultProfessionalProfile());
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoInputRef = React.useRef(null);

  useEffect(() => {
    (async () => {
      const [key, prof] = await Promise.all([loadThemeColor(psicologoId), loadProfessionalProfile(psicologoId)]);
      setSelected(key);
      setProfile(prof);
      setPhotoUrl(getProfessionalPhotoUrl(prof.photoPath));
      setLoaded(true);
    })();
  }, [psicologoId]);

  const choose = async (key) => {
    setSelected(key);
    applyTheme(key); // aplica imediatamente (preview em tempo real)
    await saveThemeColor(psicologoId, key);
  };

  const set = (field) => (e) => setProfile(p => ({ ...p, [field]: e.target.value }));

  const saveProfile = async () => {
    setSaveState('saving');
    await saveProfessionalProfile(psicologoId, profile);
    setSaveState('idle');
    showToast('Informações salvas com sucesso.');
  };

  const handlePhotoChosen = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if(!file) return;
    setPhotoError('');
    setPhotoUploading(true);
    const result = await uploadProfessionalPhoto(psicologoId, file);
    setPhotoUploading(false);
    if(result.error){ setPhotoError(result.error); return; }
    setProfile(p => ({ ...p, photoPath: result.photoPath }));
    setPhotoUrl(getProfessionalPhotoUrl(result.photoPath) + '?t=' + Date.now()); // evita cache do navegador na mesma URL
    showToast('Foto atualizada com sucesso.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" style={{maxHeight:'85vh', overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <h3>Meu perfil</h3>
        <div className="subtabs" style={{marginTop:10}}>
          <button className={tab==='aparencia'?'active':''} onClick={()=>setTab('aparencia')}>Aparência</button>
          <button className={tab==='profissional'?'active':''} onClick={()=>setTab('profissional')}>Dados profissionais</button>
          <button className={tab==='fiscal'?'active':''} onClick={()=>setTab('fiscal')}>Dados fiscais</button>
        </div>

        {tab === 'aparencia' && (
          <div>
            <div className="field hint" style={{marginBottom:14}}>Personalize a cor de destaque do sistema. A escolha também aparece na visão dos seus pacientes.</div>
            {loaded && (
              <div className="theme-swatches">
                {Object.entries(THEME_PALETTES).map(([key, p]) => (
                  <button key={key} className={'theme-swatch '+(selected===key?'active':'')} onClick={()=>choose(key)}>
                    <span className="sw-circle" style={{background:p.swatch}}>
                      {selected===key && <IconCheckCircle size={18} color="#fff"/>}
                    </span>
                    <span className="sw-label">{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'profissional' && loaded && (
          <div>
            <div className="field hint" style={{marginBottom:14}}>Essas informações ajudam o paciente a te conhecer melhor.</div>
            {saveState==='saving' && <div className="field hint">Salvando…</div>}

            <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:18}}>
              <div style={{width:64, height:64, borderRadius:'50%', overflow:'hidden', background:'var(--primary-soft)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                {photoUrl ? <img src={photoUrl} alt="Foto de perfil" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <IconUsers size={26} color="var(--primary-dark)" />}
              </div>
              <div>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}} onChange={handlePhotoChosen} />
                <button className="btn-secondary" type="button" style={{width:'auto', padding:'8px 14px'}} onClick={()=>photoInputRef.current.click()} disabled={photoUploading}>
                  {photoUploading ? 'Enviando…' : 'Trocar foto'}
                </button>
                {photoError && <div className="field-error" style={{marginTop:6}}>{photoError}</div>}
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Registro no conselho (CRP)</label>
                <input value={profile.crp} onChange={set('crp')} placeholder="Ex.: 06/123456" />
              </div>
              <div className="field">
                <label>Especialidade</label>
                <input value={profile.specialty} onChange={set('specialty')} placeholder="Ex.: Terapia cognitivo-comportamental" />
              </div>
              <div className="field full">
                <label>Apresentação para o paciente</label>
                <textarea value={profile.bio} onChange={set('bio')} placeholder="Um breve resumo sobre sua abordagem e experiência" />
              </div>
            </div>
            <div className="modal-actions" style={{marginTop:14}}>
              <button className="btn-primary" type="button" onClick={saveProfile}>Salvar</button>
            </div>
          </div>
        )}

        {tab === 'fiscal' && loaded && (
          <div>
            <div className="field hint" style={{marginBottom:14}}>Necessário para emitir recibos com validade completa e, futuramente, nota fiscal e cobrança digital. Nunca é exibido ao paciente, exceto o que compõe legalmente o recibo.</div>
            {saveState==='saving' && <div className="field hint">Salvando…</div>}
            <div className="form-grid">
              <div className="field">
                <label>CPF ou CNPJ</label>
                <input value={profile.cpfCnpj} onChange={set('cpfCnpj')} placeholder="000.000.000-00" />
              </div>
              <div className="field">
                <label>Regime tributário</label>
                <select value={profile.taxRegime} onChange={set('taxRegime')}>
                  <option value="">Selecione</option>
                  {TAX_REGIMES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field full">
                <label>Município de prestação de serviço</label>
                <input value={profile.city} onChange={set('city')} placeholder="Ex.: São Paulo, SP" />
              </div>
              <div className="field">
                <label>Banco</label>
                <input value={profile.bankName} onChange={set('bankName')} placeholder="Nome do banco" />
              </div>
              <div className="field">
                <label>Agência</label>
                <input value={profile.bankAgency} onChange={set('bankAgency')} placeholder="0000" />
              </div>
              <div className="field">
                <label>Conta</label>
                <input value={profile.bankAccount} onChange={set('bankAccount')} placeholder="00000-0" />
              </div>
              <div className="field">
                <label>Chave Pix</label>
                <input value={profile.pixKey} onChange={set('pixKey')} placeholder="CPF, e-mail, telefone ou chave aleatória" />
              </div>
            </div>
            <div className="modal-actions" style={{marginTop:14}}>
              <button className="btn-primary" type="button" onClick={saveProfile}>Salvar</button>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{marginTop:20}}>
          <button className="btn-secondary" type="button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}


function PrivacyModal({ currentUser, patientRecord, psicologoId, onClose }){
  const [slaConfig, setSlaConfig] = useState({ responseSlaDays: 15 });
  const [myRequests, setMyRequests] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const refresh = React.useCallback(async () => {
    const targetPsicologoId = currentUser.role === 'paciente' ? psicologoId : null;
    const [cfg, reqs] = await Promise.all([
      targetPsicologoId ? loadDataRightsConfig(targetPsicologoId) : Promise.resolve({ responseSlaDays: 15 }),
      loadMyDeletionRequests(currentUser.id),
    ]);
    setSlaConfig(cfg);
    setMyRequests(reqs);
    setLoaded(true);
  }, [currentUser.id, currentUser.role, psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const doExport = async () => {
    setExporting(true);
    try{ await exportMyData(currentUser, patientRecord); showToast('Download iniciado.'); }
    finally{ setExporting(false); }
  };

  const pendingRequest = myRequests.find(r => r.status === 'pendente');

  const doRequestDeletion = async () => {
    setRequesting(true);
    try{
      await createDeletionRequest({
        requesterId: currentUser.id, requesterRole: currentUser.role,
        psicologoId: currentUser.role === 'paciente' ? psicologoId : null,
        patientId: currentUser.role === 'paciente' && patientRecord ? patientRecord.id : null,
      });
      await refresh();
      setConfirmingDelete(false);
      showToast('Solicitação enviada com sucesso.');
    } finally { setRequesting(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" style={{maxHeight:'85vh', overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <h3>Meus dados e privacidade</h3>
        <div className="field hint" style={{marginBottom:16}}>Seus direitos como titular de dados, conforme a LGPD.</div>

        <div className="panel">
          <h3>Exportar meus dados</h3>
          <div className="panel-sub">Baixe uma cópia dos seus dados administrativos {currentUser.role==='paciente' ? '(sessões, tarefas e cobranças — nunca as notas privadas do seu psicólogo)' : 'de cadastro'}.</div>
          <button className="btn-primary" type="button" style={{width:'auto', padding:'10px 20px'}} onClick={doExport} disabled={exporting}>
            {exporting && <span className="spinner"/>}
            {exporting ? 'Gerando…' : 'Baixar meus dados'}
          </button>
        </div>

        <div className="panel">
          <h3>Excluir ou anonimizar minha conta</h3>
          {loaded && currentUser.role === 'paciente' && (
            <div className="panel-sub">
              Prazo de resposta configurado pelo seu psicólogo: até {slaConfig.responseSlaDays} dias. Sessões, cobranças e recibos já
              emitidos são mantidos pelo prazo legal de retenção fiscal — apenas seus dados de identificação (nome, e-mail, telefone, CPF,
              endereço) são anonimizados.
            </div>
          )}
          {loaded && currentUser.role === 'psicologo' && (
            <div className="panel-sub">Sua solicitação será registrada; a exclusão da conta de acesso exige um passo manual de suporte, já que envolve segurança elevada.</div>
          )}

          {pendingRequest ? (
            <div className="alert alert-danger">Você já tem uma solicitação pendente, enviada em {formatDate(pendingRequest.requestedAt)}. Aguarde a resposta.</div>
          ) : confirmingDelete ? (
            <div>
              <div className="alert alert-danger">Essa ação não pode ser desfeita pelo próprio titular depois de concluída. Tem certeza?</div>
              <div className="modal-actions">
                <button className="btn-secondary" type="button" onClick={()=>setConfirmingDelete(false)}>Cancelar</button>
                <button className="btn-primary" type="button" style={{background:'var(--danger)'}} onClick={doRequestDeletion} disabled={requesting}>
                  {requesting && <span className="spinner"/>}
                  {requesting ? 'Enviando…' : 'Confirmar solicitação'}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary" type="button" style={{width:'auto', padding:'10px 20px', color:'var(--danger)'}} onClick={()=>setConfirmingDelete(true)}>
              Solicitar exclusão/anonimização
            </button>
          )}

          {myRequests.length > 0 && (
            <div style={{marginTop:16}}>
              <div className="field hint" style={{marginBottom:8}}>Histórico de solicitações:</div>
              {myRequests.map(r => (
                <div className="mini-session-row" key={r.id}>
                  <span>{formatDate(r.requestedAt)} — {r.status === 'pendente' ? 'Pendente' : r.status === 'concluida' ? 'Concluída' : 'Cancelada'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{marginTop:12}}>
          <button className="btn-secondary" type="button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}


function AccountMenu({ user, onLogout, onOpenProfile, onOpenPrivacy, onClose }){
  React.useEffect(() => {
    const close = (e) => {
      if(e.target && e.target.closest && e.target.closest('.account-menu-wrap')) return;
      onClose();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);
  return (
    <div className="account-menu">
      <div className="who">
        <div className="name">{user.name}</div>
        <div className="email">{user.email} · {user.role === 'psicologo' ? 'Psicólogo(a)' : 'Paciente'}</div>
      </div>
      {user.role === 'psicologo' && (
        <button className="menu-item" onClick={onOpenProfile}>
          <IconEdit size={15} /> Meu perfil
        </button>
      )}
      <button className="menu-item" onClick={onOpenPrivacy}>
        <IconShield size={15} /> Meus dados e privacidade
      </button>
      <button className="menu-item danger" onClick={onLogout}>
        <IconLogOut size={15} /> Sair
      </button>
    </div>
  );
}


export { NotificationsBell, ProfileSettingsModal, AccountMenu, PrivacyModal };
