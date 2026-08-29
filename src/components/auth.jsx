import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { fetchProfile, EMAIL_RE, TERMS_VERSION } from '../lib/dataStore.js';
import { AuthShell, TermsModal, TermsBody } from './shared.jsx';
import { IconUsers, IconHome, IconMail, IconEye, IconEyeOff } from './icons.jsx';

function ConsentGateScreen({ user, onAccept, onLogout }){
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if(!checked) return;
    setBusy(true);
    try{
      await onAccept();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2>Antes de continuar</h2>
      <div className="auth-sub">Precisamos do seu consentimento para tratar seus dados, {user.name.split(' ')[0]}.</div>
      <div className="field hint" style={{marginBottom:10}}>Versão {TERMS_VERSION}</div>
      <TermsBody />
      <label className="checkbox-row" style={{marginTop:6}}>
        <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} />
        <span>Li e aceito os termos de uso e a política de privacidade para tratamento dos meus dados de saúde.</span>
      </label>
      <button className="btn-primary" type="button" onClick={accept} disabled={!checked || busy}>
        {busy && <span className="spinner"/>}
        {busy ? 'Registrando…' : 'Aceitar e continuar'}
      </button>
      <div className="auth-footer-link">
        <button className="btn-link" onClick={onLogout}>Sair sem aceitar</button>
      </div>
    </AuthShell>
  );
}

/* ---------- Seleção de perfil (nova tela inicial) ---------- */
function RoleSelectScreen({ onSelect, onLogin, onShowTerms }){
  return (
    <div className="role-select-page">
      <div className="role-select-wrap">
        <div className="auth-brand" style={{justifyContent:'center', marginBottom:22}}>
          <div className="brand-mark"><IconSparkleForSelect /></div>
          <div className="brand-name" style={{fontSize:22}}>TerapIA</div>
        </div>
        <h1 className="role-select-title">Bem-vindo(a) de volta</h1>
        <p className="role-select-subtitle">Gestão de consultório e acompanhamento terapêutico. O cuidado do psicólogo e o acompanhamento do paciente, no mesmo lugar.</p>

        <div className="role-cards">
          <button type="button" className="role-card primary" onClick={()=>onSelect('psicologo')}>
            <span className="role-card-icon"><IconUsers size={20} color="#F4F6F2" /></span>
            <span className="role-card-eyebrow">Área profissional</span>
            <span className="role-card-title">Sou psicólogo(a)</span>
            <span className="role-card-desc">Agenda, prontuário, sessões, tarefas de casa e financeiro do consultório.</span>
            <span className="role-card-go">Entrar como psicólogo(a) →</span>
          </button>

          <button type="button" className="role-card secondary" onClick={()=>onSelect('paciente')}>
            <span className="role-card-icon secondary"><IconHome size={20} /></span>
            <span className="role-card-eyebrow">Área do paciente</span>
            <span className="role-card-title">Sou paciente</span>
            <span className="role-card-desc">Veja suas sessões, acompanhe tarefas e consulte pagamentos.</span>
            <span className="role-card-go">Entrar como paciente →</span>
          </button>
        </div>

        <div className="role-select-already">Já tem conta? <button type="button" className="btn-link" onClick={onLogin}>Entrar</button></div>

        <div className="role-select-footer">
          <button type="button" onClick={onShowTerms}>Política de Privacidade</button>
          <span className="sep">·</span>
          <button type="button" onClick={onShowTerms}>Termos de Uso</button>
        </div>
      </div>
    </div>
  );
}
function IconSparkleForSelect(){
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F4F6F2" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5c.6 3 2 4.4 5 5-3 .6-4.4 2-5 5-.6-3-2-4.4-5-5 3-.6 4.4-2 5-5Z"/>
    </svg>
  );
}

/* ---------- Auth screens ---------- */


function LoginScreen({ onLogin, goRegister, goForgot }){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    if(e && e.preventDefault) e.preventDefault();
    setError('');
    if(!EMAIL_RE.test(email)){ setError('Informe um e-mail válido.'); return; }
    if(!password){ setError('Informe sua senha.'); return; }
    setBusy(true);
    try{
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if(authError){
        setError(authError.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : authError.message);
        return;
      }
      const profile = await fetchProfile(data.user.id);
      if(!profile){
        setError('Login feito, mas não encontramos seu perfil. Fale com o suporte.');
        return;
      }
      onLogin({ ...profile, emailVerified: !!data.user.email_confirmed_at });
    }catch(err){
      setError('Não foi possível entrar agora. Tente novamente.');
    }finally{
      setBusy(false);
    }
  };
  const onEnter = (e) => { if(e.key === 'Enter') submit(e); };

  return (
    <AuthShell>
      <h2>Entrar</h2>
      <div className="auth-sub">Acesse sua conta de psicólogo ou paciente.</div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div>
        <div className="field">
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onEnter} placeholder="voce@exemplo.com" autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="login-pw">Senha</label>
          <div style={{position:'relative'}}>
            <input id="login-pw" type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={onEnter} placeholder="••••••••" autoComplete="current-password" style={{paddingRight:38}} />
            <button type="button" onClick={()=>setShowPw(s=>!s)} aria-label={showPw?'Ocultar senha':'Mostrar senha'}
                    style={{position:'absolute', right:8, top:8, background:'none', border:'none', color:'var(--ink-faint)', cursor:'pointer', padding:4}}>
              {showPw ? <IconEyeOff size={16}/> : <IconEye size={16}/>}
            </button>
          </div>
        </div>
        <div style={{display:'flex', justifyContent:'flex-end', marginBottom:16, marginTop:-4}}>
          <button type="button" className="btn-link" onClick={goForgot}>Esqueci minha senha</button>
        </div>
        <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
          {busy && <span className="spinner"/>}
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
      <div className="auth-footer-link">
        Ainda não tem conta? <button className="btn-link" onClick={goRegister}>Cadastre-se</button>
      </div>
    </AuthShell>
  );
}


function RegisterScreen({ onRegister, goLogin, initialRole }){
  const [role, setRole] = useState(initialRole || 'psicologo');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const submit = async (e) => {
    if(e && e.preventDefault) e.preventDefault();
    setError('');
    if(!name.trim()){ setError('Informe seu nome completo.'); return; }
    if(!EMAIL_RE.test(email)){ setError('Informe um e-mail válido.'); return; }
    if(password.length < 6){ setError('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if(password !== confirm){ setError('As senhas não coincidem.'); return; }
    if(!acceptedTerms){ setError('É preciso aceitar os termos de uso e a política de privacidade para continuar.'); return; }
    setBusy(true);
    try{
      const { data, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { role, name: name.trim() } },
      });
      if(authError){
        setError(authError.message === 'User already registered' ? 'Já existe uma conta com este e-mail.' : authError.message);
        return;
      }
      if(data.session){
        // Confirmação de e-mail desativada no projeto — já temos sessão, registra o consentimento na hora.
        await supabase.from('profiles').update({
          terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION,
        }).eq('id', data.user.id);
        const profile = await fetchProfile(data.user.id);
        onRegister({ ...profile, termsAcceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION, emailVerified: !!data.user.email_confirmed_at });
      } else {
        // Confirmação de e-mail exigida pelo projeto — sem sessão ainda. O consentimento será
        // registrado no primeiro login (a tela de bloqueio de consentimento cuida disso).
        setPendingConfirmation(true);
      }
    }catch(err){
      setError('Não foi possível criar sua conta agora. Tente novamente.');
    }finally{
      setBusy(false);
    }
  };
  const onEnter = (e) => { if(e.key === 'Enter') submit(e); };

  if(pendingConfirmation){
    return (
      <AuthShell>
        <h2>Confirme seu e-mail</h2>
        <div className="alert alert-success">
          <IconMail size={16} />
          <span>Enviamos um link de confirmação para {email}. Confirme para poder entrar — seu consentimento aos termos será registrado no primeiro login.</span>
        </div>
        <div className="auth-footer-link">
          <button className="btn-link" onClick={goLogin}>Voltar para o login</button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2>Criar conta</h2>
      <div className="auth-sub">Leva menos de um minuto.</div>
      {error && <div className="alert alert-danger">{error}</div>}
      {showTerms && <TermsModal onClose={()=>setShowTerms(false)} />}
      <div>
        <div className="role-pick">
          <button type="button" className={role==='psicologo'?'active':''} onClick={()=>setRole('psicologo')}>
            <IconUsers size={17}/> Sou psicólogo(a)
          </button>
          <button type="button" className={role==='paciente'?'active':''} onClick={()=>setRole('paciente')}>
            <IconHome size={17}/> Sou paciente
          </button>
        </div>
        <div className="field">
          <label htmlFor="reg-name">Nome completo</label>
          <input id="reg-name" value={name} onChange={e=>setName(e.target.value)} onKeyDown={onEnter} placeholder="Seu nome" />
        </div>
        <div className="field">
          <label htmlFor="reg-email">E-mail</label>
          <input id="reg-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onEnter} placeholder="voce@exemplo.com" autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="reg-pw">Senha</label>
          <input id="reg-pw" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={onEnter} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="reg-confirm">Confirmar senha</label>
          <input id="reg-confirm" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={onEnter} placeholder="Repita a senha" autoComplete="new-password" />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)} />
          <span>Li e aceito os <a onClick={(e)=>{e.preventDefault(); setShowTerms(true);}}>termos de uso e a política de privacidade</a>.</span>
        </label>
        <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
          {busy && <span className="spinner"/>}
          {busy ? 'Criando conta…' : 'Criar conta'}
        </button>
      </div>
      <div className="auth-footer-link">
        Já tem conta? <button className="btn-link" onClick={goLogin}>Entrar</button>
      </div>
    </AuthShell>
  );
}


function ForgotPasswordScreen({ goLogin }){
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    if(e && e.preventDefault) e.preventDefault();
    setError('');
    if(!EMAIL_RE.test(email)){ setError('Informe um e-mail válido.'); return; }
    setBusy(true);
    try{
      await supabase.auth.resetPasswordForEmail(email);
      setSent(true);
    }catch(err){
      setError('Não foi possível enviar agora. Tente novamente.');
    }finally{
      setBusy(false);
    }
  };
  const onEnter = (e) => { if(e.key === 'Enter') submit(e); };

  return (
    <AuthShell>
      <h2>Recuperar senha</h2>
      <div className="auth-sub">Enviaremos um link de redefinição para o seu e-mail.</div>
      {error && <div className="alert alert-danger">{error}</div>}
      {sent ? (
        <div className="alert alert-success">
          <IconMail size={16} />
          <span>Se este e-mail estiver cadastrado, enviamos um link de redefinição.</span>
        </div>
      ) : (
        <div>
          <div className="field">
            <label htmlFor="forgot-email">E-mail</label>
            <input id="forgot-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onEnter} placeholder="voce@exemplo.com" />
          </div>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Enviando…' : 'Enviar link de redefinição'}
          </button>
        </div>
      )}
      <div className="auth-footer-link">
        <button className="btn-link" onClick={goLogin}>Voltar para o login</button>
      </div>
    </AuthShell>
  );
}

/* ---------- Patient form modal (US-003) ---------- */


export { ConsentGateScreen, LoginScreen, RegisterScreen, ForgotPasswordScreen, RoleSelectScreen };
