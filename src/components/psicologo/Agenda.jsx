import React, { useState, useEffect, useCallback } from 'react';
import {
  loadAvailability, saveAvailability, loadBlocks, saveBlocks, blockId,
  loadCancelPolicy, saveCancelPolicy, cancelPolicyText, loadPricing,
  loadSessions, saveSessions, sessionId, loadPatients,
  checkSlotAvailability, getDefaultPrice, toMinutes, weekdayKeyOf,
  WEEKDAYS, DOW_SHORT, todayStr, addDays, fromDateStr, toDateStr, startOfWeek,
  generateSlots, computeSlotStatus, formatDateOnly, formatCurrency, DEFAULT_SESSION_PRICE, MONTH_NAMES,
} from '../../lib/dataStore.js';
import { IconPlus, IconCheckCircle, IconXCircle, IconChevronLeft, IconChevronRight, IconTrash, IconClockRewind } from '../icons.jsx';

function BookingModePanel({ availability, onChange }){
  return (
    <div className="panel">
      <h3>Confirmação de agendamentos do paciente</h3>
      <div className="panel-sub">Define o que acontece quando um paciente escolhe um horário disponível.</div>
      <div className="mode-cards">
        <div className={'mode-card '+(availability.bookingMode==='auto'?'active':'')} onClick={()=>onChange({ ...availability, bookingMode:'auto' })}>
          <div className="mc-title"><IconCheckCircle size={16}/> Confirmação automática</div>
          <div className="mc-desc">O horário fica confirmado assim que o paciente agenda, sem precisar da sua aprovação.</div>
        </div>
        <div className={'mode-card '+(availability.bookingMode==='aprovacao'?'active':'')} onClick={()=>onChange({ ...availability, bookingMode:'aprovacao' })}>
          <div className="mc-title"><IconClockRewind size={16}/> Requer aprovação</div>
          <div className="mc-desc">O agendamento fica pendente até você aprovar ou recusar pela agenda.</div>
        </div>
      </div>
    </div>
  );
}


function WeeklyHoursPanel({ availability, onChange }){
  const setDay = (key, patch) => {
    onChange({ ...availability, weeklyHours: { ...availability.weeklyHours, [key]: { ...availability.weeklyHours[key], ...patch } } });
  };
  return (
    <div className="panel">
      <h3>Dias e horários de atendimento</h3>
      <div className="panel-sub">Defina em quais dias e faixas de horário você atende. Fora disso, nenhum horário aparece como disponível.</div>
      {WEEKDAYS.map(d => {
        const day = availability.weeklyHours[d.key];
        return (
          <div className="day-row" key={d.key}>
            <button className={'switch '+(day.enabled?'on':'')} onClick={()=>setDay(d.key, { enabled: !day.enabled })} aria-label={`Ativar ${d.label}`}>
              <span className="knob"/>
            </button>
            <div className="day-label">{d.label}</div>
            {day.enabled ? (
              <React.Fragment>
                <input type="time" value={day.start} onChange={e=>setDay(d.key, { start:e.target.value })} />
                <span style={{color:'var(--ink-faint)', fontSize:12.5}}>até</span>
                <input type="time" value={day.end} onChange={e=>setDay(d.key, { end:e.target.value })} />
              </React.Fragment>
            ) : (
              <span className="day-disabled">Sem atendimento</span>
            )}
          </div>
        );
      })}
      <div className="inline-fields" style={{marginTop:18}}>
        <div className="field">
          <label>Duração padrão da sessão (min)</label>
          <input type="number" min="10" step="5" value={availability.defaultDurationMin}
                 onChange={e=>onChange({ ...availability, defaultDurationMin: Number(e.target.value)||0 })} />
        </div>
        <div className="field">
          <label>Intervalo entre sessões (min)</label>
          <input type="number" min="0" step="5" value={availability.bufferMin}
                 onChange={e=>onChange({ ...availability, bufferMin: Number(e.target.value)||0 })} />
        </div>
      </div>
      <div className="inline-fields">
        <div className="field">
          <label>Antecedência mínima p/ paciente agendar (horas)</label>
          <input type="number" min="0" value={availability.minAdvanceHours}
                 onChange={e=>onChange({ ...availability, minAdvanceHours: Number(e.target.value)||0 })} />
        </div>
        <div className="field">
          <label>Antecedência máxima p/ paciente agendar (dias)</label>
          <input type="number" min="1" value={availability.maxAdvanceDays}
                 onChange={e=>onChange({ ...availability, maxAdvanceDays: Number(e.target.value)||0 })} />
        </div>
      </div>
      <div className="field hint">A antecedência acima será aplicada ao agendamento feito pelo paciente.</div>
    </div>
  );
}


function BlocksPanel({ psicologoId, blocks, onAdd, onRemove }){
  const [type, setType] = useState('feriado');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('13:00');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    setError('');
    if(!startDate){ setError('Informe a data.'); return; }
    if(type === 'horario_especifico'){
      if(!startTime || !endTime || toMinutes(endTime) <= toMinutes(startTime)){ setError('Informe um intervalo de horário válido.'); return; }
      onAdd({ id:blockId(), psicologoId, type, date:startDate, startTime, endTime, label: label || 'Horário bloqueado' });
    } else {
      const end = endDate || startDate;
      if(end < startDate){ setError('A data final não pode ser antes da inicial.'); return; }
      onAdd({ id:blockId(), psicologoId, type, startDate, endDate:end, label: label || (type==='feriado' ? 'Feriado' : 'Férias') });
    }
    setStartDate(''); setEndDate(''); setLabel('');
  };

  return (
    <div className="panel">
      <h3>Bloqueios: férias, feriados e horários específicos</h3>
      <div className="panel-sub">Esses períodos nunca aparecem como disponíveis, mesmo dentro do seu expediente configurado.</div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="inline-fields">
        <div className="field">
          <label>Tipo</label>
          <select value={type} onChange={e=>setType(e.target.value)}>
            <option value="feriado">Feriado</option>
            <option value="ferias">Férias</option>
            <option value="horario_especifico">Horário específico</option>
          </select>
        </div>
        <div className="field">
          <label>{type==='horario_especifico' ? 'Data' : 'De'}</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
        </div>
        {type !== 'horario_especifico' ? (
          <div className="field">
            <label>Até</label>
            <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} />
          </div>
        ) : (
          <React.Fragment>
            <div className="field">
              <label>Início</label>
              <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} />
            </div>
            <div className="field">
              <label>Fim</label>
              <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} />
            </div>
          </React.Fragment>
        )}
      </div>
      <div className="field">
        <label>Rótulo <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
        <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Ex.: Recesso de fim de ano" />
      </div>
      <button className="btn-new" type="button" onClick={add}><IconPlus size={15}/> Adicionar bloqueio</button>

      <div style={{marginTop:18}}>
        {blocks.length === 0 ? (
          <div className="field hint">Nenhum bloqueio cadastrado ainda.</div>
        ) : blocks.map(b => (
          <div className="block-row" key={b.id}>
            <div className="b-info">
              <div className="b-label">{b.label}</div>
              <div className="b-dates">
                {b.type === 'horario_especifico'
                  ? `${formatDateOnly(b.date)} · ${b.startTime}–${b.endTime}`
                  : `${formatDateOnly(b.startDate)} até ${formatDateOnly(b.endDate)}`}
              </div>
            </div>
            <button className="icon-btn" title="Remover" onClick={()=>onRemove(b.id)}><IconTrash size={15}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}


function CancelPolicyPanel({ policy, onChange }){
  return (
    <div className="panel">
      <h3>Política de cancelamento</h3>
      <div className="panel-sub">Esta política será mostrada ao paciente antes de confirmar um cancelamento e define se há cobrança.</div>
      <div className="inline-fields">
        <div className="field">
          <label>Prazo mínimo para cancelar sem cobrança (horas)</label>
          <input type="number" min="0" value={policy.minHoursForFree}
                 onChange={e=>onChange({ ...policy, minHoursForFree: Number(e.target.value)||0 })} />
        </div>
        <div className="field">
          <label>Cancelamento fora do prazo</label>
          <select value={policy.lateCancelCharge} onChange={e=>onChange({ ...policy, lateCancelCharge: e.target.value })}>
            <option value="integral">Cobrança integral</option>
            <option value="parcial">Cobrança parcial</option>
            <option value="nenhuma">Nenhuma cobrança</option>
          </select>
        </div>
        {policy.lateCancelCharge === 'parcial' && (
          <div className="field">
            <label>Percentual cobrado (%)</label>
            <input type="number" min="1" max="99" value={policy.lateCancelPercent}
                   onChange={e=>onChange({ ...policy, lateCancelPercent: Number(e.target.value)||0 })} />
          </div>
        )}
      </div>
      <label className="checkbox-row" style={{marginTop:6}}>
        <input type="checkbox" checked={policy.autoReleaseSlot} onChange={e=>onChange({ ...policy, autoReleaseSlot: e.target.checked })} />
        <span>Liberar automaticamente o horário na agenda assim que o cancelamento for confirmado (senão, requer liberação manual).</span>
      </label>
      <div className="field hint" style={{marginBottom:6, marginTop:14}}>Pré-visualização — é isto que o paciente verá antes de cancelar:</div>
      <div className="alert alert-success" style={{background:'var(--surface-alt)', color:'var(--ink)'}}>
        {cancelPolicyText(policy)}
      </div>
    </div>
  );
}

/* ---------- New session modal (US-005) ---------- */


function NewSessionModal({ psicologoId, availability, blocks, sessions, patients, pricing, initialDate, initialTime, onClose, onCreate, onCreateMany }){
  const [patientIdSel, setPatientIdSel] = useState(patients[0]?.id || '');
  const [date, setDate] = useState(initialDate || todayStr());
  const [time, setTime] = useState(initialTime || '09:00');
  const [duration, setDuration] = useState(availability.defaultDurationMin);
  const [modalidade, setModalidade] = useState('Presencial');
  const [status, setStatus] = useState('confirmada');
  const [valor, setValor] = useState(() => getDefaultPrice(pricing, patients[0], 'Presencial'));
  const [valorTouched, setValorTouched] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [selectedDows, setSelectedDows] = useState(() => new Set([fromDateStr(initialDate || todayStr()).getDay()]));
  const [untilDate, setUntilDate] = useState(() => addDays(initialDate || todayStr(), 56));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null); // { created, skipped:[{date,reason}] } | null

  useEffect(() => {
    if(valorTouched) return;
    const patient = patients.find(p => p.id === patientIdSel);
    setValor(getDefaultPrice(pricing, patient, modalidade));
  }, [patientIdSel, modalidade, pricing, valorTouched, patients]);

  const toggleDow = (idx) => {
    setSelectedDows(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const buildSession = (d) => ({
    id: sessionId(), psicologoId, patientId: patientIdSel, date: d, startTime: time,
    durationMin: Number(duration)||0, modalidade, status, valor: Number(valor)||0, createdAt:new Date().toISOString(),
  });

  const submit = async () => {
    setError('');
    if(!patientIdSel){ setError('Selecione um paciente.'); return; }

    if(!recurring){
      const check = checkSlotAvailability({ availability, blocks, sessions, psicologoId, date, startTime:time, durationMin:Number(duration)||0 });
      if(!check.available){ setError(check.reason); return; }
      setBusy(true);
      try{
        await onCreate(buildSession(date));
        onClose();
      }catch(e){
        setError('Não foi possível criar a sessão agora.');
      }finally{
        setBusy(false);
      }
      return;
    }

    // Recorrência (US-030)
    if(selectedDows.size === 0){ setError('Selecione ao menos um dia da semana para repetir.'); return; }
    if(!untilDate || untilDate < date){ setError('Escolha uma data final igual ou depois da data inicial.'); return; }

    const candidates = [];
    let cursor = date, guard = 0;
    while(cursor <= untilDate && guard < 400){
      guard++;
      if(selectedDows.has(fromDateStr(cursor).getDay())) candidates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    if(candidates.length === 0){ setError('Nenhuma data cai nos dias selecionados dentro desse período.'); return; }
    if(candidates.length > 60){ setError(`Isso geraria ${candidates.length} sessões — reduza o período (máximo 60 por vez).`); return; }

    setBusy(true);
    try{
      const toCreate = [];
      const skipped = [];
      let simSessions = sessions; // simula conflitos entre as próprias sessões da série
      for(const d of candidates){
        const check = checkSlotAvailability({ availability, blocks, sessions: simSessions, psicologoId, date:d, startTime:time, durationMin:Number(duration)||0 });
        if(check.available){
          const s = buildSession(d);
          toCreate.push(s);
          simSessions = [...simSessions, s];
        } else {
          skipped.push({ date:d, reason: check.reason });
        }
      }
      if(toCreate.length > 0) await onCreateMany(toCreate);
      setSummary({ created: toCreate.length, skipped });
    }catch(e){
      setError('Não foi possível criar as sessões agora.');
    }finally{
      setBusy(false);
    }
  };

  if(summary){
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" onClick={e=>e.stopPropagation()}>
          <div style={{textAlign:'center', padding:'8px 4px'}}>
            <div className="icon-wrap" style={{margin:'0 auto 16px auto'}}><IconCheckCircle size={26}/></div>
            <h3 style={{marginBottom:8}}>{summary.created} sessão(ões) criada(s)</h3>
            {summary.skipped.length > 0 ? (
              <div style={{textAlign:'left', marginTop:14}}>
                <div className="field hint" style={{marginBottom:8}}>{summary.skipped.length} data(s) pulada(s):</div>
                {summary.skipped.map((sk,i) => (
                  <div key={i} className="mini-session-row" style={{textAlign:'left'}}>
                    <span><strong>{formatDateOnly(sk.date)}</strong> — {sk.reason}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{fontSize:13, color:'var(--ink-muted)'}}>Todas as datas selecionadas foram criadas sem conflitos.</p>
            )}
            <button className="btn-primary" style={{marginTop:18}} onClick={onClose}>Concluir</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        <h3>Nova sessão</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>Paciente</label>
            <select value={patientIdSel} onChange={e=>setPatientIdSel(e.target.value)}>
              <option value="">Selecione</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.socialName || p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{recurring ? 'A partir de' : 'Data'}</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Horário</label>
            <input type="time" value={time} onChange={e=>setTime(e.target.value)} />
          </div>
          <div className="field">
            <label>Duração (min)</label>
            <input type="number" min="10" step="5" value={duration} onChange={e=>setDuration(e.target.value)} />
          </div>
          <div className="field">
            <label>Modalidade</label>
            <select value={modalidade} onChange={e=>setModalidade(e.target.value)}>
              <option value="Presencial">Presencial</option>
              <option value="Online">Online</option>
            </select>
          </div>
          <div className="field">
            <label>Status inicial</label>
            <select value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="agendada">Agendada (reserva provisória)</option>
              <option value="confirmada">Confirmada</option>
            </select>
          </div>
          <div className="field">
            <label>Valor da sessão (R$)</label>
            <input type="number" min="0" step="10" value={valor} onChange={e=>{ setValor(e.target.value); setValorTouched(true); }} />
          </div>
        </div>
        <div className="field hint" style={{marginTop:-8, marginBottom:14}}>Preenchido automaticamente com base no preço configurado (padrão ou personalizado do paciente) — pode ser ajustado manualmente.</div>

        <label className="checkbox-row">
          <input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} />
          <span>Repetir esta sessão semanalmente em um ou mais dias</span>
        </label>

        {recurring && (
          <div style={{marginBottom:6}}>
            <div className="field hint" style={{marginBottom:8}}>Repetir nos dias</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:14}}>
              {WEEKDAYS.map((d,idx) => (
                <button key={d.key} type="button"
                        className={'filter-pill '+(selectedDows.has(idx)?'active':'')}
                        onClick={()=>toggleDow(idx)}>{d.label.slice(0,3)}</button>
              ))}
            </div>
            <div className="field">
              <label>Repetir até</label>
              <input type="date" value={untilDate} onChange={e=>setUntilDate(e.target.value)} />
            </div>
            <div className="field hint" style={{marginTop:6}}>Datas bloqueadas, fora do expediente ou em conflito são puladas automaticamente — você verá a lista ao final.</div>
          </div>
        )}

        {patients.length === 0 && (
          <div className="alert alert-danger">Cadastre um paciente ativo antes de criar sessões.</div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy || patients.length===0}>
            {busy && <span className="spinner"/>}
            {busy ? 'Criando…' : (recurring ? 'Criar sessões' : 'Criar sessão')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Session detail popover (US-005) ---------- */


function SessionPopover({ session, patient, onClose, onStatusChange }){
  const statusLabel = { confirmada:'Confirmada', cancelada:'Cancelada', realizada:'Realizada', pendente:'Pendente de aprovação', reagendada:'Reagendada', agendada:'Agendada', falta:'Falta' }[session.status] || session.status;
  const isTerminal = session.status === 'reagendada';
  return (
    <div className="modal-overlay" onClick={onClose} style={{background:'transparent'}}>
      <div className="session-popover" style={{position:'relative', margin:'auto'}} onClick={e=>e.stopPropagation()}>
        <div className="sp-name">{patient ? (patient.socialName || patient.name) : 'Paciente removido'}</div>
        <div className="sp-meta">{formatDateOnly(session.date)} às {session.startTime} · {session.durationMin} min · {session.modalidade || 'Presencial'}</div>
        <div className="sp-meta" style={{marginTop:-6}}>Valor: {formatCurrency(session.valor)}</div>
        <span className={'badge status-'+session.status} style={{marginBottom:10, marginTop:6, display:'inline-block'}}>
          {statusLabel}
        </span>
        {session.status === 'cancelada' && session.reason && (
          <div className="sp-meta" style={{marginTop:-6, marginBottom:10}}>Motivo: {session.reason}</div>
        )}
        {session.status === 'cancelada' && session.pendingRelease && (
          <div className="alert alert-danger" style={{marginBottom:10, fontSize:11.5}}>Horário ainda ocupado — aguardando liberação manual.</div>
        )}
        {session.status === 'realizada' && (
          <div className="field hint" style={{marginBottom:10}}>Pronta para gerar cobrança em Financeiro.</div>
        )}
        <div className="sp-actions">
          {session.status === 'agendada' && (
            <button className="sp-action" onClick={()=>onStatusChange({ status:'confirmada' })}>Confirmar sessão</button>
          )}
          {session.status === 'pendente' && (
            <React.Fragment>
              <button className="sp-action" onClick={()=>onStatusChange({ status:'confirmada' })}>Aprovar agendamento</button>
              <button className="sp-action danger" onClick={()=>onStatusChange({ status:'cancelada', cancelledAt:new Date().toISOString(), cancelledBy:'psicologo', pendingRelease:false })}>Recusar</button>
            </React.Fragment>
          )}
          {session.status === 'cancelada' && session.pendingRelease && (
            <button className="sp-action" onClick={()=>onStatusChange({ pendingRelease:false })}>Liberar horário na agenda</button>
          )}
          {(session.status === 'confirmada' || session.status === 'agendada') && (
            <button className="sp-action" onClick={()=>onStatusChange({ status:'realizada' })}>Marcar como realizada</button>
          )}
          {(session.status === 'confirmada' || session.status === 'agendada') && (
            <button className="sp-action danger" onClick={()=>onStatusChange({ status:'falta' })}>Marcar falta (não compareceu)</button>
          )}
          {session.status !== 'cancelada' && session.status !== 'pendente' && session.status !== 'reagendada' && (
            <button className="sp-action danger" onClick={()=>onStatusChange({ status:'cancelada', cancelledAt:new Date().toISOString(), cancelledBy:'psicologo', pendingRelease:false })}>Cancelar sessão</button>
          )}
          {session.status === 'cancelada' && !session.pendingRelease && (
            <button className="sp-action" onClick={()=>onStatusChange({ status:'confirmada' })}>Reconfirmar</button>
          )}
          {session.status === 'falta' && (
            <button className="sp-action" onClick={()=>onStatusChange({ status:'confirmada' })}>Reverter para confirmada</button>
          )}
        </div>
      </div>
    </div>
  );
}


const LEGEND_ITEMS = [
  { key:'livre', label:'Livre', className:'primary' },
  { key:'bloqueado', label:'Bloqueado', className:'faint' },
  { key:'confirmada', label:'Confirmada', className:'primary' },
  { key:'cancelada', label:'Cancelada', className:'danger' },
  { key:'realizada', label:'Realizada', className:'faint' },
];

/* ---------- Calendar: Day view ---------- */


function DayView({ date, ctx, filteredSessionIds, onSlotClick, onSessionClick }){
  const slots = generateSlots(7, 20, 30);
  return (
    <div className="cal-scroll">
      <div className="cal-day-list">
        {slots.map(time => {
          const status = computeSlotStatus(date, time, ctx);
          let content;
          if(status.kind === 'sessao'){
            const included = filteredSessionIds.has(status.session.id);
            const p = ctx.patients.find(pp => pp.id === status.session.patientId);
            content = included ? (
              <button className={'slot-chip status-'+status.session.status} onClick={()=>onSessionClick(status.session)}>
                <span className="dot"/> {p ? (p.socialName||p.name) : 'Paciente'}
              </button>
            ) : <div className="slot-chip status-filtrada">Sessão (fora do filtro)</div>;
          } else if(status.kind === 'bloqueado'){
            content = <span style={{fontSize:11, color:'var(--ink-faint)'}}>Bloqueado{status.label?': '+status.label:''}</span>;
          } else if(status.kind === 'fora'){
            content = null;
          } else {
            content = null;
          }
          const cellClass = status.kind==='livre' ? 'slot-livre' : status.kind==='bloqueado' ? 'slot-bloqueado' : status.kind==='fora' ? 'slot-fora' : '';
          return (
            <div className="cal-row" key={time}>
              <div className="cal-time">{time.endsWith(':00') ? time : ''}</div>
              <div className={'cal-cell '+cellClass} onClick={()=> status.kind==='livre' && onSlotClick(date, time)}>
                {content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Calendar: Week view ---------- */


function WeekView({ weekStart, ctx, filteredSessionIds, onSlotClick, onSessionClick }){
  const slots = generateSlots(7, 20, 60);
  const days = Array.from({length:7}, (_,i) => addDays(weekStart, i));
  return (
    <div className="cal-scroll">
      <div className="cal-week-head">
        <div/>
        {days.map(d => (
          <div className="whd" key={d}>{DOW_SHORT[fromDateStr(d).getDay()]}<br/>{fromDateStr(d).getDate()}</div>
        ))}
      </div>
      <div className="cal-week-grid">
        {slots.map(time => (
          <React.Fragment key={time}>
            <div className="cal-time cal-week-row-time">{time}</div>
            {days.map(d => {
              const status = computeSlotStatus(d, time, ctx);
              let inner = null;
              if(status.kind === 'sessao' && filteredSessionIds.has(status.session.id)){
                const p = ctx.patients.find(pp => pp.id === status.session.patientId);
                inner = (
                  <button className={'slot-chip status-'+status.session.status} style={{fontSize:10}} onClick={()=>onSessionClick(status.session)}>
                    <span className="dot"/> {(p ? (p.socialName||p.name) : 'Paciente').split(' ')[0]}
                  </button>
                );
              } else if(status.kind === 'sessao'){
                inner = <div className="slot-chip status-filtrada" style={{fontSize:10}}>—</div>;
              }
              const cellClass = status.kind==='livre' ? 'slot-livre' : status.kind==='bloqueado' ? 'slot-bloqueado' : status.kind==='fora' ? 'slot-fora' : '';
              return (
                <div className={'cal-week-cell '+cellClass} key={d+time}
                     onClick={()=> status.kind==='livre' && onSlotClick(d, time)}>
                  {inner}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ---------- Calendar: Month view ---------- */


function MonthView({ monthDate, ctx, onDayClick }){
  const year = fromDateStr(monthDate).getFullYear(), month = fromDateStr(monthDate).getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const cells = Array.from({length:42}, (_,i) => { const d = new Date(gridStart); d.setDate(d.getDate()+i); return d; });
  const today = todayStr();

  return (
    <div className="cal-month-grid">
      {DOW_SHORT.map(d => <div className="cal-month-head" key={d}>{d}</div>)}
      {cells.map((d,i) => {
        const dateStr = toDateStr(d);
        const inMonth = d.getMonth() === month;
        const daySessions = ctx.sessions.filter(s => s.psicologoId === ctx.psicologoId && s.date === dateStr);
        const dayAvailable = ctx.availability.weeklyHours[weekdayKeyOf(dateStr)]?.enabled;
        return (
          <div key={i} className={'cal-month-cell '+(inMonth?'':'muted')+(dateStr===today?' today':'')} onClick={()=>onDayClick(dateStr)}>
            <div className="day-num">{d.getDate()}</div>
            {!dayAvailable && inMonth && <div style={{fontSize:9.5, color:'var(--ink-faint)'}}>Sem expediente</div>}
            <div className="m-dots">
              {daySessions.slice(0,6).map(s => (
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
  );
}

/* ---------- Calendar container (US-005) ---------- */


function CalendarioView({ psicologoId, availability, blocks, sessions, patients, pricing, onCreateSession, onCreateSessions, onUpdateSession }){
  const [view, setView] = useState('semana'); // dia | semana | mes
  const [refDate, setRefDate] = useState(todayStr());
  const [patientFilter, setPatientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalidadeFilter, setModalidadeFilter] = useState('all');
  const [newSlotFor, setNewSlotFor] = useState(null); // { date, time } | null
  const [selectedSession, setSelectedSession] = useState(null);

  const ctx = { availability, blocks, sessions, patients, psicologoId };

  const filteredSessionIds = React.useMemo(() => {
    return new Set(sessions.filter(s => {
      if(s.psicologoId !== psicologoId) return false;
      if(patientFilter !== 'all' && s.patientId !== patientFilter) return false;
      if(statusFilter !== 'all' && s.status !== statusFilter) return false;
      if(modalidadeFilter !== 'all' && (s.modalidade||'Presencial') !== modalidadeFilter) return false;
      return true;
    }).map(s => s.id));
  }, [sessions, psicologoId, patientFilter, statusFilter, modalidadeFilter]);

  const navigate = (dir) => {
    if(view==='dia') setRefDate(addDays(refDate, dir));
    else if(view==='semana') setRefDate(addDays(refDate, dir*7));
    else { const d = fromDateStr(refDate); d.setMonth(d.getMonth()+dir); setRefDate(toDateStr(d)); }
  };

  const label = () => {
    if(view==='dia'){
      const d = fromDateStr(refDate);
      return `${DOW_SHORT[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
    }
    if(view==='semana'){
      const start = startOfWeek(refDate), end = addDays(start,6);
      return `${fromDateStr(start).getDate()} — ${fromDateStr(end).getDate()} de ${MONTH_NAMES[fromDateStr(end).getMonth()]}`;
    }
    const d = fromDateStr(refDate);
    return `${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;
  };

  return (
    <div>
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button onClick={()=>navigate(-1)}><IconChevronLeft size={16}/></button>
          <button className="today-btn" onClick={()=>setRefDate(todayStr())}>Hoje</button>
          <button onClick={()=>navigate(1)}><IconChevronRight size={16}/></button>
          <div className="cal-label">{label()}</div>
        </div>
        <div className="subtabs" style={{border:'none', marginBottom:0}}>
          <button className={view==='dia'?'active':''} onClick={()=>setView('dia')}>Dia</button>
          <button className={view==='semana'?'active':''} onClick={()=>setView('semana')}>Semana</button>
          <button className={view==='mes'?'active':''} onClick={()=>setView('mes')}>Mês</button>
        </div>
        <button className="btn-new" onClick={()=>setNewSlotFor({ date:refDate, time:'09:00' })}><IconPlus size={15}/> Nova sessão</button>
      </div>

      <div className="cal-filters" style={{marginBottom:16}}>
        <select value={patientFilter} onChange={e=>setPatientFilter(e.target.value)}>
          <option value="all">Todos os pacientes</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.socialName||p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">Todos os status</option>
          <option value="agendada">Agendada</option>
          <option value="confirmada">Confirmada</option>
          <option value="pendente">Pendente</option>
          <option value="realizada">Realizada</option>
          <option value="falta">Falta</option>
          <option value="cancelada">Cancelada</option>
          <option value="reagendada">Reagendada</option>
        </select>
        <select value={modalidadeFilter} onChange={e=>setModalidadeFilter(e.target.value)}>
          <option value="all">Presencial e online</option>
          <option value="Presencial">Presencial</option>
          <option value="Online">Online</option>
        </select>
      </div>

      <div className="cal-legend">
        <div className="item"><span className="dot" style={{background:'var(--primary-soft)', border:'1px solid var(--primary)'}}/> Livre</div>
        <div className="item"><span className="dot" style={{background:'#E4E9E0'}}/> Bloqueado</div>
        <div className="item"><span className="dot" style={{background:'var(--accent)'}}/> Agendada</div>
        <div className="item"><span className="dot" style={{background:'var(--primary)'}}/> Confirmada</div>
        <div className="item"><span className="dot" style={{background:'var(--warning)'}}/> Pendente</div>
        <div className="item"><span className="dot" style={{background:'var(--ink-faint)'}}/> Realizada</div>
        <div className="item"><span className="dot" style={{background:'var(--danger)'}}/> Falta</div>
        <div className="item"><span className="dot" style={{background:'var(--danger)'}}/> Cancelada</div>
      </div>

      {view === 'dia' && (
        <DayView date={refDate} ctx={ctx} filteredSessionIds={filteredSessionIds}
                 onSlotClick={(d,t)=>setNewSlotFor({date:d, time:t})}
                 onSessionClick={setSelectedSession} />
      )}
      {view === 'semana' && (
        <WeekView weekStart={startOfWeek(refDate)} ctx={ctx} filteredSessionIds={filteredSessionIds}
                  onSlotClick={(d,t)=>setNewSlotFor({date:d, time:t})}
                  onSessionClick={setSelectedSession} />
      )}
      {view === 'mes' && (
        <MonthView monthDate={refDate} ctx={ctx} onDayClick={(d)=>{ setRefDate(d); setView('dia'); }} />
      )}

      {newSlotFor && (
        <NewSessionModal
          psicologoId={psicologoId} availability={availability} blocks={blocks} sessions={sessions} patients={patients} pricing={pricing}
          initialDate={newSlotFor.date} initialTime={newSlotFor.time}
          onClose={()=>setNewSlotFor(null)}
          onCreate={onCreateSession}
          onCreateMany={onCreateSessions}
        />
      )}
      {selectedSession && (
        <SessionPopover
          session={selectedSession}
          patient={patients.find(p => p.id === selectedSession.patientId)}
          onClose={()=>setSelectedSession(null)}
          onStatusChange={async (patch) => { await onUpdateSession(selectedSession.id, patch); setSelectedSession(null); }}
        />
      )}
    </div>
  );
}


function AgendaPsicologo({ psicologoId }){
  const [tab, setTab] = useState('calendario');
  const [availability, setAvailability] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [cancelPolicy, setCancelPolicy] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved

  const refresh = useCallback(async () => {
    const [a, b, s, p, c, pr] = await Promise.all([loadAvailability(psicologoId), loadBlocks(), loadSessions(), loadPatients(), loadCancelPolicy(psicologoId), loadPricing(psicologoId)]);
    setAvailability(a);
    setBlocks(b.filter(x => x.psicologoId === psicologoId));
    setSessions(s.filter(x => x.psicologoId === psicologoId));
    setPatients(p.filter(x => x.psicologoId === psicologoId && x.status === 'ativo'));
    setCancelPolicy(c);
    setPricing(pr);
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const persistAvailability = async (next) => {
    setAvailability(next);
    setSaveState('saving');
    await saveAvailability(psicologoId, next);
    setSaveState('saved');
    setTimeout(()=>setSaveState('idle'), 1500);
  };

  const persistCancelPolicy = async (next) => {
    setCancelPolicy(next);
    setSaveState('saving');
    await saveCancelPolicy(psicologoId, next);
    setSaveState('saved');
    setTimeout(()=>setSaveState('idle'), 1500);
  };

  const addBlock = async (b) => {
    const all = await loadBlocks();
    const updated = [...all, b];
    await saveBlocks(updated);
    setBlocks(updated.filter(x => x.psicologoId === psicologoId));
  };
  const removeBlock = async (id) => {
    const all = await loadBlocks();
    const updated = all.filter(b => b.id !== id);
    await saveBlocks(updated);
    setBlocks(updated.filter(x => x.psicologoId === psicologoId));
  };
  const createSession = async (s) => {
    const all = await loadSessions();
    const updated = [...all, s];
    await saveSessions(updated);
    setSessions(updated.filter(x => x.psicologoId === psicologoId));
  };
  const createSessions = async (list) => {
    if(!list.length) return;
    const all = await loadSessions();
    const updated = [...all, ...list];
    await saveSessions(updated);
    setSessions(updated.filter(x => x.psicologoId === psicologoId));
  };

  const updateSession = async (id, patch) => {
    const all = await loadSessions();
    const updated = all.map(s => s.id === id ? { ...s, ...patch } : s);
    await saveSessions(updated);
    setSessions(updated.filter(x => x.psicologoId === psicologoId));
  };

  if(!availability || !cancelPolicy || !pricing) return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando agenda…</div>;

  return (
    <div>
      <div className="subtabs">
        <button className={tab==='disponibilidade'?'active':''} onClick={()=>setTab('disponibilidade')}>Disponibilidade</button>
        <button className={tab==='cancelamento'?'active':''} onClick={()=>setTab('cancelamento')}>Cancelamento</button>
        <button className={tab==='calendario'?'active':''} onClick={()=>setTab('calendario')}>Calendário</button>
      </div>
      {saveState !== 'idle' && (
        <div className="alert alert-success" style={{display:'inline-flex'}}>
          {saveState==='saving' ? 'Salvando…' : 'Configuração salva.'}
        </div>
      )}
      {tab === 'disponibilidade' && (
        <div>
          <BookingModePanel availability={availability} onChange={persistAvailability} />
          <WeeklyHoursPanel availability={availability} onChange={persistAvailability} />
          <BlocksPanel psicologoId={psicologoId} blocks={blocks} onAdd={addBlock} onRemove={removeBlock} />
        </div>
      )}
      {tab === 'cancelamento' && (
        <CancelPolicyPanel policy={cancelPolicy} onChange={persistCancelPolicy} />
      )}
      {tab === 'calendario' && (
        <CalendarioView
          psicologoId={psicologoId} availability={availability} blocks={blocks} sessions={sessions} patients={patients} pricing={pricing}
          onCreateSession={createSession} onCreateSessions={createSessions} onUpdateSession={updateSession}
        />
      )}
    </div>
  );
}

/* ---------- Private notes (US-010) ---------- */


export { AgendaPsicologo };
