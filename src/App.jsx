import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabaseClient.js';
import storage from './lib/storage.js';
import {
  fetchProfile, hasValidConsent, loadThemeColor, applyTheme, loadPatients, findPendingPatientLink, pushAudit,
  SESSION_TIMEOUT_MS, TERMS_VERSION, todayStr,
} from './lib/dataStore.js';
import { NAV_PSICOLOGO, NAV_PACIENTE, SECTION_META } from './lib/navConfig.js';
import { IconSparkle, IconMail, IconChevronDown, IconClockRewind, IconLock } from './components/icons.jsx';
import { LoginScreen, RegisterScreen, ForgotPasswordScreen, ConsentGateScreen, RoleSelectScreen, LinkConfirmScreen } from './components/auth.jsx';
import { TermsModal } from './components/shared.jsx';
import { NotificationsBell, AccountMenu, ProfileSettingsModal, PrivacyModal } from './components/layout.jsx';
import PainelPsicologo from './components/psicologo/Dashboard.jsx';
import { PacientesPsicologo } from './components/psicologo/Patients.jsx';
import { AgendaPsicologo } from './components/psicologo/Agenda.jsx';
import { SessoesNotasPsicologo } from './components/psicologo/Notes.jsx';
import { TarefasPsicologo } from './components/psicologo/Tasks.jsx';
import { FinanceiroPsicologo } from './components/psicologo/Financeiro.jsx';
import { RelatoriosPsicologo } from './components/psicologo/Reports.jsx';
import { AuditoriaPsicologo } from './components/psicologo/Audit.jsx';
import InicioPaciente from './components/paciente/Dashboard.jsx';
import { MinhasSessoesPaciente } from './components/paciente/Sessions.jsx';
import { MinhasTarefasPaciente } from './components/paciente/Tasks.jsx';
import PagamentosPaciente from './components/paciente/Payments.jsx';
import { DocumentosPaciente } from './components/paciente/Documents.jsx';

function App(){
  const [authView, setAuthView] = useState('select-role'); // select-role | login | register | forgot
  const [preselectedRole, setPreselectedRole] = useState('psicologo');
  const [showRoleTerms, setShowRoleTerms] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [section, setSection] = useState('painel');
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [patientRecord, setPatientRecord] = useState(null);
  const [linkedPsicologoId, setLinkedPsicologoId] = useState(null);
  const [pendingLink, setPendingLink] = useState(null);
  const [linkChecked, setLinkChecked] = useState(false);
  const [skippedLink, setSkippedLink] = useState(false);
  const [linkVersion, setLinkVersion] = useState(0);
  const [sessionNotice, setSessionNotice] = useState('');
  const lastActivityRef = React.useRef(Date.now());

  // Restaura sessão real do Supabase Auth ao carregar
  useEffect(() => {
    (async () => {
      try{
        const { data } = await supabase.auth.getSession();
        if(data.session){
          const profile = await fetchProfile(data.session.user.id);
          if(profile) setCurrentUser({ ...profile, emailVerified: !!data.session.user.email_confirmed_at });
        }
        const savedSection = await storage.get('ui:last-section');
        if(savedSection && savedSection.value) setSection(JSON.parse(savedSection.value));
      }catch(e){ /* sem sessão salva ainda */ }
      setLoaded(true);
    })();

    // Mantém o currentUser sincronizado com eventos reais de auth (refresh de token, logout em outra aba, etc.)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if(event === 'SIGNED_OUT'){
        setCurrentUser(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if(!loaded) return;
    storage.set('ui:last-section', JSON.stringify(section)).catch(()=>{});
  }, [section, loaded]);

  // Aplica a cor de tema do consultório (US-031) — do psicólogo direto, ou do psicólogo vinculado ao paciente
  useEffect(() => {
    if(!currentUser) { applyTheme('green'); return; }
    (async () => {
      let targetPsicologoId = null;
      if(currentUser.role === 'psicologo'){
        targetPsicologoId = currentUser.id;
      } else {
        const patients = await loadPatients();
        // Só considera "vinculado" quando linked_user_id já aponta para este usuário — um convite
        // ainda pendente (US-032) não deve carregar dados antes da confirmação explícita.
        const record = patients.find(p => p.linkedUserId === currentUser.id);
        targetPsicologoId = record ? record.psicologoId : null;
        setPatientRecord(record || null);
      }
      setLinkedPsicologoId(targetPsicologoId);
      const key = targetPsicologoId ? await loadThemeColor(targetPsicologoId) : 'green';
      applyTheme(key);
    })();
  }, [currentUser, linkVersion]);

  // Verifica se existe um convite de vínculo pendente (US-032) para o e-mail deste paciente.
  useEffect(() => {
    if(!currentUser || currentUser.role !== 'paciente'){ setPendingLink(null); setLinkChecked(true); return; }
    setLinkChecked(false);
    (async () => {
      const pending = await findPendingPatientLink(currentUser.email);
      setPendingLink(pending);
      setLinkChecked(true);
    })();
  }, [currentUser, linkVersion]);

  const handleAuthed = useCallback((user) => {
    setCurrentUser(user);
    setSection(user.role === 'psicologo' ? 'painel' : 'inicio');
    setSessionNotice('');
    lastActivityRef.current = Date.now();
    // A sessão em si já é persistida pelo próprio cliente do Supabase (via supabaseSessionStorage).
    pushAudit({ userId: user.id, action: 'login' }).catch(()=>{});
  }, []);

  const logout = useCallback((notice) => {
    setCurrentUser(null);
    setMenuOpen(false);
    setAuthView('login');
    if(notice) setSessionNotice(notice);
    supabase.auth.signOut().catch(()=>{});
  }, []);

  // Inactivity session expiration (real client-side timer)
  useEffect(() => {
    if(!currentUser) return;
    const markActive = () => { lastActivityRef.current = Date.now(); };
    ['mousemove','keydown','click','scroll','touchstart'].forEach(ev => window.addEventListener(ev, markActive));
    const interval = setInterval(() => {
      if(Date.now() - lastActivityRef.current > SESSION_TIMEOUT_MS){
        logout('Sua sessão expirou por inatividade. Faça login novamente para continuar.');
      }
    }, 5000);
    return () => {
      ['mousemove','keydown','click','scroll','touchstart'].forEach(ev => window.removeEventListener(ev, markActive));
      clearInterval(interval);
    };
  }, [currentUser, logout]);

  const resendVerificationEmail = async () => {
    try{ await supabase.auth.resend({ type:'signup', email: currentUser.email }); }catch(e){}
  };

  const acceptConsent = async () => {
    const acceptedAt = new Date().toISOString();
    await supabase.from('profiles').update({
      terms_accepted_at: acceptedAt, terms_version: TERMS_VERSION,
    }).eq('id', currentUser.id);
    setCurrentUser(u => ({ ...u, termsAcceptedAt: acceptedAt, termsVersion: TERMS_VERSION }));
  };

  if(!loaded) return null;

  if(!currentUser){
    return (
      <React.Fragment>
        {sessionNotice && (
          <div style={{position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:60, maxWidth:420, width:'calc(100% - 32px)'}}>
            <div className="alert alert-danger" style={{margin:0, boxShadow:'var(--shadow-lg)'}}>
              <IconClockRewind size={16} />
              <span>{sessionNotice}</span>
            </div>
          </div>
        )}
        {authView === 'select-role' && (
          <RoleSelectScreen
            onSelect={(role)=>{ setPreselectedRole(role); setAuthView('register'); }}
            onLogin={()=>setAuthView('login')}
            onShowTerms={()=>setShowRoleTerms(true)}
          />
        )}
        {authView === 'login' && <LoginScreen onLogin={handleAuthed} goRegister={()=>setAuthView('select-role')} goForgot={()=>setAuthView('forgot')} />}
        {authView === 'register' && <RegisterScreen onRegister={handleAuthed} goLogin={()=>setAuthView('login')} initialRole={preselectedRole} />}
        {authView === 'forgot' && <ForgotPasswordScreen goLogin={()=>setAuthView('login')} />}
        {showRoleTerms && <TermsModal onClose={()=>setShowRoleTerms(false)} />}
      </React.Fragment>
    );
  }

  // US-032: convite de vínculo pendente precisa ser checado/confirmado antes de qualquer outra tela
  if(currentUser.role === 'paciente' && !linkChecked){
    return null;
  }
  if(currentUser.role === 'paciente' && pendingLink && !skippedLink){
    return (
      <LinkConfirmScreen
        pendingPatient={pendingLink}
        currentUserId={currentUser.id}
        onConfirmed={() => { setPendingLink(null); setLinkVersion(v => v+1); }}
        onSkip={() => setSkippedLink(true)}
      />
    );
  }

  // US-002: sem consentimento válido, acesso a recursos sensíveis fica bloqueado
  if(currentUser.role === 'paciente' && !hasValidConsent(currentUser)){
    return <ConsentGateScreen user={currentUser} onAccept={acceptConsent} onLogout={()=>logout('')} />;
  }

  const role = currentUser.role;
  const nav = role === 'psicologo' ? NAV_PSICOLOGO : NAV_PACIENTE;
  const meta = SECTION_META[section] || SECTION_META[role==='psicologo'?'painel':'inicio'];
  const initials = currentUser.name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();

  const renderContent = () => {
    if(role === 'psicologo' && section === 'painel') return <PainelPsicologo psicologoId={currentUser.id} name={currentUser.name.split(' ')[0]} />;
    if(role === 'psicologo' && section === 'agenda') return <AgendaPsicologo psicologoId={currentUser.id} />;
    if(role === 'psicologo' && section === 'pacientes') return <PacientesPsicologo psicologoId={currentUser.id} />;
    if(role === 'psicologo' && section === 'sessoes') return <SessoesNotasPsicologo psicologoId={currentUser.id} currentUserId={currentUser.id} />;
    if(role === 'psicologo' && section === 'tarefas') return <TarefasPsicologo psicologoId={currentUser.id} />;
    if(role === 'psicologo' && section === 'financeiro') return <FinanceiroPsicologo psicologoId={currentUser.id} professionalName={currentUser.name} />;
    if(role === 'psicologo' && section === 'relatorios') return <RelatoriosPsicologo psicologoId={currentUser.id} />;
    if(role === 'psicologo' && section === 'auditoria') return <AuditoriaPsicologo psicologoId={currentUser.id} />;
    if(role === 'paciente' && section === 'inicio') return <InicioPaciente user={currentUser} />;
    if(role === 'paciente' && section === 'minhas-sessoes') return <MinhasSessoesPaciente user={currentUser} />;
    if(role === 'paciente' && section === 'minhas-tarefas') return <MinhasTarefasPaciente user={currentUser} />;
    if(role === 'paciente' && section === 'documentos') return <DocumentosPaciente user={currentUser} />;
    if(role === 'paciente' && section === 'pagamentos') return <PagamentosPaciente user={currentUser} />;
    return <EmptyState builtBy={meta.builtBy} />;
  };

  return (
    <div className="app">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><IconSparkle size={16} color="#F4F6F2" /></div>
          <div className="brand-name">TerapIA</div>
        </div>
        <div className="nav-group-label">Navegação</div>
        {nav.map(item => (
          <button key={item.key}
                  className={'nav-item ' + (section===item.key ? 'active':'')}
                  onClick={()=>setSection(item.key)}>
            <item.icon size={17} />
            <span>{item.label}</span>
          </button>
        ))}
        <div className="sidebar-footer">
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
            <IconLock size={12} /> <strong style={{color:'var(--ink-muted)'}}>Dados protegidos</strong>
          </div>
          Suas informações são criptografadas e protegidas conforme a LGPD.
        </div>
      </aside>

      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className="brand-mark" style={{width:24,height:24,borderRadius:7}}><IconSparkle size={12} color="#F4F6F2" /></div>
          <span className="brand-name" style={{fontSize:16}}>TerapIA</span>
        </div>
        <div style={{display:'flex', alignItems:'center'}}>
          {role === 'psicologo' && <NotificationsBell ownerId={currentUser.id} namespace="notifications" />}
          {role === 'paciente' && <NotificationsBell ownerId={currentUser.id} namespace="patientNotifications" />}
          <div className="account-menu-wrap">
            <button className="avatar" style={{width:30,height:30,fontSize:11,border:'none',cursor:'pointer'}} onClick={()=>setMenuOpen(o=>!o)}>{initials}</button>
            {menuOpen && (
              <AccountMenu user={currentUser} onLogout={()=>logout('')} onOpenProfile={()=>{ setMenuOpen(false); setShowProfile(true); }} onOpenPrivacy={()=>{ setMenuOpen(false); setShowPrivacy(true); }} onClose={()=>setMenuOpen(false)} />
            )}
          </div>
        </div>
      </div>

      <div className="main">
        {!currentUser.emailVerified && (
          <div className="verify-banner">
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <IconMail size={15} />
              <span>Confirme seu e-mail para garantir o acesso completo à sua conta.</span>
            </div>
            <button onClick={resendVerificationEmail}>Reenviar e-mail</button>
          </div>
        )}

        <div className="topbar">
          <div>
            <h1>{meta.title}</h1>
            <div className="subtitle">{meta.subtitle}</div>
          </div>
          <div className="topbar-right">
            {role === 'psicologo' && <NotificationsBell ownerId={currentUser.id} namespace="notifications" />}
          {role === 'paciente' && <NotificationsBell ownerId={currentUser.id} namespace="patientNotifications" />}
            <div className="account-menu-wrap">
              <button onClick={()=>setMenuOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:8,background:'none',border:'none',cursor:'pointer'}}>
                <div className="avatar">{initials}</div>
                <IconChevronDown size={15} color="var(--ink-muted)" />
              </button>
              {menuOpen && (
                <AccountMenu user={currentUser} onLogout={()=>logout('')} onOpenProfile={()=>{ setMenuOpen(false); setShowProfile(true); }} onOpenPrivacy={()=>{ setMenuOpen(false); setShowPrivacy(true); }} onClose={()=>setMenuOpen(false)} />
              )}
            </div>
          </div>
        </div>

        <div className="content">
          {renderContent()}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav">
        {nav.map(item => (
          <button key={item.key} className={section===item.key?'active':''} onClick={()=>setSection(item.key)}>
            <item.icon size={19} />
            {item.label.split(' ')[0]}
          </button>
        ))}
      </nav>

      {showProfile && role === 'psicologo' && (
        <ProfileSettingsModal psicologoId={currentUser.id} onClose={()=>setShowProfile(false)} />
      )}
      {showPrivacy && (
        <PrivacyModal
          currentUser={currentUser} patientRecord={patientRecord} psicologoId={linkedPsicologoId}
          onClose={()=>setShowPrivacy(false)}
        />
      )}
    </div>
  );
}

export default App;
