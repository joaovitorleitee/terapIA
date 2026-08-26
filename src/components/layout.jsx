import React, { useState, useEffect, useCallback } from 'react';
import { loadNotificationsFor, saveNotificationsFor, loadThemeColor, saveThemeColor, applyTheme, THEME_PALETTES, formatDate } from '../lib/dataStore.js';
import { IconBell, IconEdit, IconClockRewind, IconLogOut, IconCheckCircle } from './icons.jsx';

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
  const [selected, setSelected] = useState('green');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const key = await loadThemeColor(psicologoId);
      setSelected(key);
      setLoaded(true);
    })();
  }, [psicologoId]);

  const choose = async (key) => {
    setSelected(key);
    applyTheme(key); // aplica imediatamente (preview em tempo real)
    await saveThemeColor(psicologoId, key);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <h3>Meu perfil</h3>
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
        <div className="modal-actions" style={{marginTop:20}}>
          <button className="btn-primary" type="button" onClick={onClose}>Concluído</button>
        </div>
      </div>
    </div>
  );
}


function AccountMenu({ user, onLogout, onSimulateExpiry, onOpenProfile, onClose }){
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
      <button className="menu-item" onClick={onSimulateExpiry}>
        <IconClockRewind size={15} /> Simular expiração de sessão (teste)
      </button>
      <button className="menu-item danger" onClick={onLogout}>
        <IconLogOut size={15} /> Sair
      </button>
    </div>
  );
}


export { NotificationsBell, ProfileSettingsModal, AccountMenu };
