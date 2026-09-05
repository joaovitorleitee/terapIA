import React, { useState, useEffect, useCallback, useRef } from 'react';
import { loadPatients, loadTasks, updateTaskFields, pushNotification, formatDateOnly, todayStr } from '../../lib/dataStore.js';
import { showToast } from '../../lib/toast.js';
import { TagInput } from '../shared.jsx';
import { IconTask, IconUserPlus } from '../icons.jsx';

function TaskCardPaciente({ task, onUpdate, forceExpand, innerRef }){
  const [response, setResponse] = useState(task.patientResponse || '');
  const [links, setLinks] = useState(task.patientLinks || []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(task.status !== 'concluida' || !!forceExpand);

  // Cancelada é a única situação realmente travada (o psicólogo encerrou a tarefa).
  // Concluída continua editável, caso o paciente queira revisar ou ajustar depois.
  const isLocked = task.status === 'cancelada';
  const isLate = task.dueDate && task.dueDate < todayStr() && (task.status === 'pendente' || task.status === 'em_andamento');
  const displayStatus = isLate ? 'atrasada' : task.status;
  const statusLabel = { pendente:'Pendente', em_andamento:'Em andamento', concluida:'Concluída', cancelada:'Cancelada', atrasada:'Atrasada' };
  const frequencyLabel = { unica:'Única', diaria:'Diária', semanal:'Semanal' };

  const changeStatus = async (status) => {
    setBusy(true);
    try{
      await onUpdate({ status, patientResponse:response, patientLinks:links });
      setDirty(false);
      showToast(status === 'concluida' ? 'Tarefa marcada como concluída.' : status === 'em_andamento' ? 'Tarefa marcada como em andamento.' : 'Tarefa reaberta.');
    } finally{ setBusy(false); }
  };

  const saveProgress = async () => {
    setBusy(true);
    try{
      await onUpdate({ patientResponse:response, patientLinks:links, skipStatusHistory:true });
      setDirty(false);
      showToast('Resposta salva com sucesso.');
    } finally{ setBusy(false); }
  };

  return (
    <div className="task-card" ref={innerRef} style={forceExpand ? {boxShadow:'0 0 0 2px var(--primary)'} : undefined}>
      <div className="tc-top" style={{cursor: task.status==='concluida' ? 'pointer' : 'default'}} onClick={()=>{ if(task.status==='concluida') setExpanded(e=>!e); }}>
        <div>
          <div className="tc-title">{task.title}</div>
        </div>
        <span className={'badge status-'+displayStatus}>{statusLabel[displayStatus] || displayStatus}</span>
      </div>

      {expanded && (
        <React.Fragment>
          <div className="tc-instructions">{task.instructions}</div>
          <div className="tc-meta-row">
            <span>Frequência: {frequencyLabel[task.frequency]}</span>
            {task.dueDate && <span>Prazo: {formatDateOnly(task.dueDate)}</span>}
          </div>
          {task.links && task.links.length > 0 && (
            <div className="tc-links">
              {task.links.map((l,i) => <a key={i} href={l} target="_blank" rel="noopener noreferrer">{l}</a>)}
            </div>
          )}

          {isLocked ? (
            <div className="field hint" style={{marginTop:10}}>Tarefa cancelada pelo psicólogo — não é mais possível alterar.</div>
          ) : (
            <React.Fragment>
              <div className="field" style={{marginTop:10}}>
                <label>Sua resposta ou comentário <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
                <textarea value={response} onChange={e=>{ setResponse(e.target.value); setDirty(true); }} placeholder="Conte como foi..." />
              </div>
              <div className="field">
                <label>Seus links <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
                <TagInput tags={links} onChange={(t)=>{ setLinks(t); setDirty(true); }} />
              </div>
              <div className="tc-actions" style={{alignItems:'center'}}>
                {dirty && (
                  <button className="btn-link" onClick={saveProgress} disabled={busy}>Salvar resposta</button>
                )}
                {task.status === 'pendente' && (
                  <button className="btn-link" onClick={()=>changeStatus('em_andamento')} disabled={busy}>Marcar como em andamento</button>
                )}
                {(task.status === 'pendente' || task.status === 'em_andamento') && (
                  <button className="btn-link" style={{color:'var(--primary-dark)', fontWeight:700}} onClick={()=>changeStatus('concluida')} disabled={busy}>Marcar como concluída</button>
                )}
                {task.status === 'concluida' && (
                  <button className="btn-link" onClick={()=>changeStatus('em_andamento')} disabled={busy}>Reabrir tarefa</button>
                )}
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </div>
  );
}


function MinhasTarefasPaciente({ user, focusTaskId, onFocusHandled }){
  const [loading, setLoading] = useState(true);
  const [patientRecord, setPatientRecord] = useState(null);
  const [tasks, setTasks] = useState([]);
  const cardRefs = useRef({});

  const refresh = useCallback(async () => {
    const allPatients = await loadPatients();
    const record = allPatients.find(p => p.email.toLowerCase() === user.email.toLowerCase());
    setPatientRecord(record || null);
    if(record){
      const allTasks = await loadTasks();
      setTasks(
        allTasks.filter(t => t.patientId === record.id && t.status !== 'cancelada')
                .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      );
    }
    setLoading(false);
  }, [user.email]);

  useEffect(() => { refresh(); }, [refresh]);

  // Veio de um widget do Início apontando pra uma tarefa específica — rola até ela.
  useEffect(() => {
    if(!focusTaskId || tasks.length === 0) return;
    const node = cardRefs.current[focusTaskId];
    if(node) node.scrollIntoView({ behavior:'smooth', block:'center' });
    if(onFocusHandled) onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId, tasks]);

  const updateTask = async (task, patch) => {
    const now = new Date().toISOString();
    const fields = { patientResponse: patch.patientResponse, patientLinks: patch.patientLinks };
    if(!patch.skipStatusHistory && patch.status && patch.status !== task.status){
      fields.status = patch.status;
      fields.history = [...(task.history||[]), { status:patch.status, changedAt:now, by:'paciente' }];
    }
    const ok = await updateTaskFields(task.id, fields);
    if(!ok){
      showToast('Não foi possível salvar. Tente novamente.');
      return;
    }
    if(patch.status && patch.status !== task.status){
      await pushNotification(task.psicologoId, {
        type:'tarefa',
        message:`${patientRecord.socialName||patientRecord.name} marcou "${task.title}" como ${patch.status==='concluida'?'concluída':'em andamento'}.`,
      });
    }
    await refresh();
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

  if(tasks.length === 0){
    return (
      <div className="empty-state">
        <div className="icon-wrap"><IconTask size={24}/></div>
        <h2>Nenhuma tarefa por enquanto</h2>
        <p>Quando seu psicólogo atribuir uma tarefa de casa, ela aparece aqui.</p>
      </div>
    );
  }

  const activeTasks = tasks.filter(t => t.status === 'pendente' || t.status === 'em_andamento');
  const doneTasks = tasks.filter(t => t.status === 'concluida');

  return (
    <div>
      <h3 style={{fontSize:15, marginBottom:10}}>Ativas</h3>
      {activeTasks.length === 0 ? (
        <div className="field hint" style={{marginBottom:20}}>Nenhuma tarefa ativa no momento — tudo em dia!</div>
      ) : activeTasks.map(t => (
        <TaskCardPaciente key={t.id} task={t} onUpdate={(patch)=>updateTask(t, patch)}
                           forceExpand={t.id===focusTaskId} innerRef={el=>{ cardRefs.current[t.id]=el; }} />
      ))}

      {doneTasks.length > 0 && (
        <React.Fragment>
          <h3 style={{fontSize:15, margin:'22px 0 10px 0'}}>Histórico</h3>
          <div className="field hint" style={{marginBottom:10}}>Concluídas — clique para reabrir e editar, se precisar.</div>
          {doneTasks.map(t => (
            <TaskCardPaciente key={t.id} task={t} onUpdate={(patch)=>updateTask(t, patch)}
                               forceExpand={t.id===focusTaskId} innerRef={el=>{ cardRefs.current[t.id]=el; }} />
          ))}
        </React.Fragment>
      )}
    </div>
  );
}

export { MinhasTarefasPaciente };
