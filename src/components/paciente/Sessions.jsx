import React, { useState, useEffect, useCallback } from 'react';
import {
  loadPatients, loadAvailability, loadBlocks, loadSessions, saveSessions, sessionId,
  loadCancelPolicy, loadPricing, getDefaultPrice, checkSlotAvailability,
  listAvailableSlotsForDate, cancelPolicyText, pushNotification, pushAudit,
  DOW_SHORT, todayStr, addDays, fromDateStr, toDateStr, formatDateOnly, DEFAULT_SESSION_PRICE,
} from '../../lib/dataStore.js';
import { IconPlus, IconCalendar, IconCheckCircle, IconMail, IconUserPlus } from '../icons.jsx';

function BookingFlow({ psicologoId, patientId, patient, availability, blocks, sessions, pricing, onBooked, onClose }){
  const [step, setStep] = useState('date'); // date | time | confirming | done
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultStatus, setResultStatus] = useState(null);

  const minDate = todayStr();
  const maxDate = toDateStr(new Date(Date.now() + availability.maxAdvanceDays*24*3600*1000));

  const strip = Array.from({length:21}, (_,i) => addDays(minDate, i)).filter(d => d <= maxDate);

  const slots = React.useMemo(
    () => listAvailableSlotsForDate(date, { availability, blocks, sessions, psicologoId }),
    [date, availability, blocks, sessions, psicologoId]
  );

  const confirm = async () => {
    setError('');
    const check = checkSlotAvailability({ availability, blocks, sessions, psicologoId, date, startTime:time, durationMin: availability.defaultDurationMin });
    if(!check.available){ setError(check.reason + ' Escolha outro horário.'); setStep('time'); return; }
    setBusy(true);
    try{
      const status = availability.bookingMode === 'aprovacao' ? 'pendente' : 'confirmada';
      await onBooked({
        id: sessionId(), psicologoId, patientId, date, startTime: time,
        durationMin: availability.defaultDurationMin, modalidade:'Presencial', status,
        valor: getDefaultPrice(pricing, patient, 'Presencial'), createdAt:new Date().toISOString(),
      });
      setResultStatus(status);
      setStep('done');
    }catch(e){
      setError('Não foi possível concluir o agendamento agora. Tente novamente.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        {step !== 'done' && <h3>Agendar consulta</h3>}
        {error && <div className="alert alert-danger">{error}</div>}

        {step === 'date' && (
          <React.Fragment>
            <div className="field hint" style={{marginBottom:10}}>Escolha um dia</div>
            <div className="date-strip">
              {strip.map(d => {
                const dd = fromDateStr(d);
                return (
                  <div key={d} className={'date-chip '+(d===date?'active':'')} onClick={()=>setDate(d)}>
                    <div className="dc-dow">{DOW_SHORT[dd.getDay()]}</div>
                    <div className="dc-num">{dd.getDate()}</div>
                  </div>
                );
              })}
            </div>
            <div className="field hint" style={{marginBottom:10}}>Horários disponíveis em {formatDateOnly(date)}</div>
            {slots.length === 0 ? (
              <div className="empty-state" style={{margin:'12px 0', padding:'28px 16px'}}>
                <p>Nenhum horário disponível neste dia. Tente outra data.</p>
              </div>
            ) : (
              <div className="time-grid">
                {slots.map(t => (
                  <div key={t} className="time-chip" onClick={()=>{ setTime(t); setStep('confirming'); }}>{t}</div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" type="button" onClick={onClose}>Fechar</button>
            </div>
          </React.Fragment>
        )}

        {step === 'confirming' && (
          <React.Fragment>
            <div className="alert alert-success" style={{background:'var(--surface-alt)', color:'var(--ink)'}}>
              <strong>{formatDateOnly(date)}</strong> às <strong>{time}</strong> · {availability.defaultDurationMin} min · Presencial
            </div>
            {availability.bookingMode === 'aprovacao' && (
              <div className="field hint" style={{marginBottom:14}}>Este horário ficará reservado como pendente até seu psicólogo aprovar.</div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" type="button" onClick={()=>setStep('date')}>Voltar</button>
              <button className="btn-primary" type="button" onClick={confirm} disabled={busy}>
                {busy && <span className="spinner"/>}
                {busy ? 'Confirmando…' : 'Confirmar agendamento'}
              </button>
            </div>
          </React.Fragment>
        )}

        {step === 'done' && (
          <div style={{textAlign:'center', padding:'12px 4px'}}>
            <div className="icon-wrap" style={{margin:'0 auto 16px auto'}}><IconCheckCircle size={26}/></div>
            <h3 style={{marginBottom:8}}>{resultStatus === 'pendente' ? 'Solicitação enviada' : 'Sessão confirmada'}</h3>
            <p style={{fontSize:13, color:'var(--ink-muted)', lineHeight:1.6, marginBottom:6}}>
              {resultStatus === 'pendente'
                ? `Seu horário em ${formatDateOnly(date)} às ${time} está reservado e aguardando aprovação do seu psicólogo.`
                : `Sua sessão em ${formatDateOnly(date)} às ${time} está confirmada.`}
            </p>
            <p style={{fontSize:12, color:'var(--ink-faint)'}}>Você receberá um lembrete antes da sessão assim que as notificações forem ativadas.</p>
            <button className="btn-primary" style={{marginTop:14}} onClick={onClose}>Concluir</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Cancel & reschedule (US-008, patient-facing) ---------- */


function CancelSessionModal({ session, cancelPolicy, onClose, onConfirm }){
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const hoursUntil = (new Date(session.date+'T'+session.startTime+':00').getTime() - Date.now()) / 3600000;
  const isLate = hoursUntil < cancelPolicy.minHoursForFree;
  const chargeType = isLate ? cancelPolicy.lateCancelCharge : 'nenhuma';

  const submit = async () => {
    setError('');
    if(!reason.trim()){ setError('Conte rapidamente o motivo do cancelamento.'); return; }
    setBusy(true);
    try{
      await onConfirm({
        reason: reason.trim(), isLateCancel: isLate, chargeType,
        chargePercent: chargeType==='parcial' ? cancelPolicy.lateCancelPercent : null,
        pendingRelease: !cancelPolicy.autoReleaseSlot,
      });
      onClose();
    }catch(e){
      setError('Não foi possível cancelar agora. Tente novamente.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <h3>Cancelar sessão</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="field hint" style={{marginBottom:6}}>{formatDateOnly(session.date)} às {session.startTime}</div>
        <div className="alert alert-success" style={{background:'var(--surface-alt)', color:'var(--ink)'}}>{cancelPolicyText(cancelPolicy)}</div>
        <div className={'alert '+(isLate ? 'alert-danger' : 'alert-success')}>
          {isLate
            ? (chargeType==='integral' ? 'Este cancelamento está fora do prazo e terá cobrança integral.'
               : chargeType==='parcial' ? `Este cancelamento está fora do prazo e terá cobrança de ${cancelPolicy.lateCancelPercent}%.`
               : 'Este cancelamento está fora do prazo, mas a política não prevê cobrança.')
            : 'Este cancelamento está dentro do prazo gratuito e não gera cobrança.'}
        </div>
        <div className="field">
          <label>Motivo do cancelamento</label>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Conte rapidamente o motivo" />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Voltar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  );
}


function RescheduleModal({ session, psicologoId, availability, blocks, sessions, onClose, onConfirm }){
  const [date, setDate] = useState(session.date);
  const [time, setTime] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const minDate = todayStr();
  const maxDate = toDateStr(new Date(Date.now() + availability.maxAdvanceDays*24*3600*1000));
  const strip = Array.from({length:21}, (_,i) => addDays(minDate, i)).filter(d => d <= maxDate);

  const slots = React.useMemo(
    () => listAvailableSlotsForDate(date, { availability, blocks, sessions, psicologoId })
            .filter(t => !(date===session.date && t===session.startTime)),
    [date, availability, blocks, sessions, psicologoId]
  );

  const submit = async () => {
    setError('');
    if(!time){ setError('Escolha um novo horário.'); return; }
    setBusy(true);
    try{
      await onConfirm({ date, time });
      onClose();
    }catch(e){
      setError('Não foi possível reagendar agora. Tente novamente.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        <h3>Reagendar sessão</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="field hint" style={{marginBottom:10}}>Sessão atual: {formatDateOnly(session.date)} às {session.startTime}</div>
        <div className="date-strip">
          {strip.map(d => {
            const dd = fromDateStr(d);
            return (
              <div key={d} className={'date-chip '+(d===date?'active':'')} onClick={()=>{setDate(d); setTime(null);}}>
                <div className="dc-dow">{DOW_SHORT[dd.getDay()]}</div>
                <div className="dc-num">{dd.getDate()}</div>
              </div>
            );
          })}
        </div>
        <div className="field hint" style={{marginBottom:10}}>Novos horários em {formatDateOnly(date)}</div>
        {slots.length === 0 ? (
          <div className="empty-state" style={{margin:'12px 0', padding:'28px 16px'}}><p>Nenhum horário disponível neste dia. Tente outra data.</p></div>
        ) : (
          <div className="time-grid">
            {slots.map(t => (
              <div key={t} className={'time-chip '+(t===time?'selected':'')} onClick={()=>setTime(t)}>{t}</div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Voltar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy || !time}>
            {busy && <span className="spinner"/>}
            {busy ? 'Reagendando…' : 'Confirmar novo horário'}
          </button>
        </div>
      </div>
    </div>
  );
}


function MinhasSessoesCalendario({ mySessions, statusLabel }){
  const [monthDate, setMonthDate] = useState(() => { const d = new Date(); d.setDate(1); return toDateStr(d); });
  const [selectedDay, setSelectedDay] = useState(null);

  const year = fromDateStr(monthDate).getFullYear(), month = fromDateStr(monthDate).getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const cells = Array.from({length:42}, (_,i) => { const d = new Date(gridStart); d.setDate(d.getDate()+i); return d; });
  const today = todayStr();
  const monthLabel = firstOfMonth.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });

  const goMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setMonthDate(toDateStr(d));
    setSelectedDay(null);
  };

  const daySessions = (dateStr) => mySessions.filter(s => s.date === dateStr);
  const selectedSessions = selectedDay ? daySessions(selectedDay) : [];

  return (
    <div>
      <div className="toolbar" style={{marginBottom:12}}>
        <button className="btn-secondary" style={{width:'auto', padding:'8px 12px'}} onClick={()=>goMonth(-1)}>←</button>
        <div style={{fontWeight:700, fontSize:14, textTransform:'capitalize'}}>{monthLabel}</div>
        <button className="btn-secondary" style={{width:'auto', padding:'8px 12px'}} onClick={()=>goMonth(1)}>→</button>
      </div>

      <div className="cal-month-grid">
        {DOW_SHORT.map(d => <div className="cal-month-head" key={d}>{d}</div>)}
        {cells.map((d,i) => {
          const dateStr = toDateStr(d);
          const inMonth = d.getMonth() === month;
          const sessionsForDay = daySessions(dateStr);
          return (
            <div key={i}
                 className={'cal-month-cell '+(inMonth?'':'muted')+(dateStr===today?' today':'')+(dateStr===selectedDay?' today':'')}
                 onClick={()=>sessionsForDay.length > 0 && setSelectedDay(dateStr)}
                 style={{cursor: sessionsForDay.length > 0 ? 'pointer' : 'default'}}>
              <div className="day-num">{d.getDate()}</div>
              <div className="m-dots">
                {sessionsForDay.slice(0,6).map(s => (
                  <span key={s.id} className="dot" style={{background:
                    (s.status==='cancelada' || s.status==='falta') ? 'var(--danger)'
                    : (s.status==='realizada' || s.status==='reagendada') ? 'var(--ink-faint)'
                    : s.status==='pendente' ? 'var(--warning)'
                    : s.status==='agendada' ? 'var(--accent)'
                    : 'var(--primary)'}} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="panel" style={{marginTop:16}}>
          <h3>{formatDateOnly(selectedDay)}</h3>
          {selectedSessions.map(s => (
            <div className="mini-session-row" key={s.id}>
              <span>{s.startTime} · {s.durationMin} min · {s.modalidade || 'Presencial'}</span>
              <span className={'badge status-'+s.status}>{statusLabel[s.status] || s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MinhasSessoesPaciente({ user }){
  const [loading, setLoading] = useState(true);
  const [patientRecord, setPatientRecord] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [cancelPolicy, setCancelPolicy] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [view, setView] = useState('lista'); // lista | calendario

  const refresh = useCallback(async () => {
    const allPatients = await loadPatients();
    const record = allPatients.find(p => p.email.toLowerCase() === user.email.toLowerCase());
    setPatientRecord(record || null);
    if(record){
      const [a, b, s, cp, pr] = await Promise.all([
        loadAvailability(record.psicologoId), loadBlocks(), loadSessions(), loadCancelPolicy(record.psicologoId), loadPricing(record.psicologoId),
      ]);
      setAvailability(a);
      setBlocks(b.filter(x => x.psicologoId === record.psicologoId));
      setSessions(s.filter(x => x.psicologoId === record.psicologoId));
      setCancelPolicy(cp);
      setPricing(pr);
    }
    setLoading(false);
  }, [user.email]);

  useEffect(() => { refresh(); }, [refresh]);

  const bookSession = async (session) => {
    const all = await loadSessions();
    await saveSessions([...all, session]);
    await refresh();
  };

  const confirmCancel = async (data) => {
    const all = await loadSessions();
    const updated = all.map(s => s.id === cancelTarget.id
      ? { ...s, status:'cancelada', cancelledAt:new Date().toISOString(), cancelledBy:'paciente', ...data }
      : s);
    await saveSessions(updated);
    await pushNotification(patientRecord.psicologoId, {
      type:'cancelamento',
      message:`${patientRecord.socialName||patientRecord.name} cancelou a sessão de ${formatDateOnly(cancelTarget.date)} às ${cancelTarget.startTime}.`,
    });
    setCancelTarget(null);
    await refresh();
  };

  const confirmReschedule = async ({ date, time }) => {
    const all = await loadSessions();
    const newSession = {
      id: sessionId(), psicologoId: patientRecord.psicologoId, patientId: patientRecord.id, date, startTime: time,
      durationMin: rescheduleTarget.durationMin, modalidade: rescheduleTarget.modalidade || 'Presencial',
      valor: rescheduleTarget.valor ?? DEFAULT_SESSION_PRICE,
      status: availability.bookingMode === 'aprovacao' ? 'pendente' : 'confirmada',
      createdAt: new Date().toISOString(), rescheduledFromId: rescheduleTarget.id,
    };
    const updated = all.map(s => s.id === rescheduleTarget.id
      ? { ...s, status:'reagendada', rescheduledAt:new Date().toISOString(), rescheduledBy:'paciente', rescheduledToId:newSession.id }
      : s);
    updated.push(newSession);
    await saveSessions(updated);
    await pushNotification(patientRecord.psicologoId, {
      type:'reagendamento',
      message:`${patientRecord.socialName||patientRecord.name} reagendou a sessão de ${formatDateOnly(rescheduleTarget.date)} às ${rescheduleTarget.startTime} para ${formatDateOnly(date)} às ${time}.`,
    });
    setRescheduleTarget(null);
    await refresh();
  };

  if(loading) return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando…</div>;

  if(!patientRecord){
    return (
      <div className="empty-state">
        <div className="icon-wrap"><IconUserPlus size={24}/></div>
        <h2>Cadastro ainda não vinculado</h2>
        <p>Seu psicólogo ainda não te cadastrou no sistema com este e-mail ({user.email}). Assim que isso acontecer, você poderá agendar suas sessões por aqui.</p>
      </div>
    );
  }

  const mySessions = sessions.filter(s => s.patientId === patientRecord.id).sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime));
  const upcoming = mySessions.filter(s => s.date >= todayStr() && (s.status === 'confirmada' || s.status === 'pendente' || s.status === 'agendada'));
  const statusLabel = { agendada:'Agendada', confirmada:'Confirmada', pendente:'Pendente de aprovação', cancelada:'Cancelada', realizada:'Realizada', reagendada:'Reagendada', falta:'Falta' };
  const canModify = (s) => (s.status === 'confirmada' || s.status === 'pendente' || s.status === 'agendada') && s.date >= todayStr();

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:10}}>
        <div style={{display:'flex', alignItems:'center', gap:14, flexWrap:'wrap'}}>
          <div className="field hint" style={{margin:0}}>{upcoming.length} sessão(ões) futura(s)</div>
          <div className="filter-pills">
            <button className={'filter-pill '+(view==='lista'?'active':'')} onClick={()=>setView('lista')}>Lista</button>
            <button className={'filter-pill '+(view==='calendario'?'active':'')} onClick={()=>setView('calendario')}>Calendário</button>
          </div>
        </div>
        <button className="btn-new" onClick={()=>setShowBooking(true)}><IconPlus size={15}/> Agendar consulta</button>
      </div>

      {mySessions.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconCalendar size={24}/></div>
          <h2>Nenhuma sessão ainda</h2>
          <p>Agende sua primeira consulta escolhendo um horário disponível na agenda do seu psicólogo.</p>
          <button className="btn-primary" style={{marginTop:16, width:'auto', padding:'10px 20px'}} onClick={()=>setShowBooking(true)}>
            <IconPlus size={15}/> Agendar consulta
          </button>
        </div>
      ) : view === 'calendario' ? (
        <MinhasSessoesCalendario mySessions={mySessions} statusLabel={statusLabel} />
      ) : (
        mySessions.map(s => (
          <div className="session-card" key={s.id}>
            <div>
              <div className="sc-date">{formatDateOnly(s.date)} às {s.startTime}</div>
              <div className="sc-meta">{s.durationMin} min · {s.modalidade || 'Presencial'}</div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              {canModify(s) && (
                <div style={{display:'flex', gap:10}}>
                  <button className="btn-link" onClick={()=>setRescheduleTarget(s)}>Reagendar</button>
                  <button className="btn-link" style={{color:'var(--danger)'}} onClick={()=>setCancelTarget(s)}>Cancelar</button>
                </div>
              )}
              <span className={'badge status-'+s.status}>{statusLabel[s.status] || s.status}</span>
            </div>
          </div>
        ))
      )}

      {showBooking && (
        <BookingFlow
          psicologoId={patientRecord.psicologoId} patientId={patientRecord.id} patient={patientRecord}
          availability={availability} blocks={blocks} sessions={sessions} pricing={pricing}
          onBooked={bookSession} onClose={()=>setShowBooking(false)}
        />
      )}
      {cancelTarget && (
        <CancelSessionModal
          session={cancelTarget} cancelPolicy={cancelPolicy}
          onClose={()=>setCancelTarget(null)} onConfirm={confirmCancel}
        />
      )}
      {rescheduleTarget && (
        <RescheduleModal
          session={rescheduleTarget} psicologoId={patientRecord.psicologoId}
          availability={availability} blocks={blocks} sessions={sessions}
          onClose={()=>setRescheduleTarget(null)} onConfirm={confirmReschedule}
        />
      )}
    </div>
  );
}

/* ---------- Homework tasks — paciente (US-012) ---------- */


export { MinhasSessoesPaciente };
