import React, { useState, useEffect, useCallback } from 'react';
import {
  loadTasks, saveTasks, deleteTask, taskId, loadPatients, loadSessions, pushPatientNotification, formatDateOnly, formatDate, todayStr,
  loadTaskTemplates, saveTaskTemplates, templateId, TEMPLATE_CATEGORIES,
} from '../../lib/dataStore.js';
import { TagInput } from '../shared.jsx';
import { IconPlus, IconTask, IconEdit, IconArchive } from '../icons.jsx';

function TaskFormModal({ psicologoId, patients, templates, editingTask, onClose, onSave }){
  const [patientIdSel, setPatientIdSel] = useState(editingTask?.patientId || patients[0]?.id || '');
  const [templateIdSel, setTemplateIdSel] = useState('');
  const [title, setTitle] = useState(editingTask?.title || '');
  const [instructions, setInstructions] = useState(editingTask?.instructions || '');
  const [dueDate, setDueDate] = useState(editingTask?.dueDate || '');
  const [frequency, setFrequency] = useState(editingTask?.frequency || 'unica');
  const [sessionIdSel, setSessionIdSel] = useState(editingTask?.sessionId || '');
  const [links, setLinks] = useState(editingTask?.links || []);
  const [patientSessions, setPatientSessions] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if(!patientIdSel){ setPatientSessions([]); return; }
      const all = await loadSessions();
      setPatientSessions(all.filter(s => s.psicologoId === psicologoId && s.patientId === patientIdSel)
                             .sort((a,b) => (b.date+b.startTime).localeCompare(a.date+a.startTime)));
    })();
  }, [patientIdSel, psicologoId]);

  const applyTemplate = (id) => {
    setTemplateIdSel(id);
    const t = templates.find(x => x.id === id);
    if(!t) return;
    // Pré-preenche a partir do modelo — a personalização continua obrigatória: o formulário
    // fica aberto para revisão/edição antes de salvar, nada é atribuído sem passar por aqui.
    setTitle(t.title);
    setInstructions(t.instructions);
    setFrequency(t.frequency);
    setLinks(t.links || []);
  };

  const submit = async () => {
    setError('');
    if(!patientIdSel){ setError('Selecione um paciente.'); return; }
    if(!title.trim()){ setError('Dê um título para a tarefa.'); return; }
    if(!instructions.trim()){ setError('Escreva a instrução da tarefa.'); return; }
    setBusy(true);
    try{
      await onSave({
        patientId: patientIdSel, title: title.trim(), instructions: instructions.trim(),
        dueDate: dueDate || null, frequency, sessionId: sessionIdSel || null, links,
      });
      onClose();
    }catch(e){
      setError('Não foi possível salvar a tarefa agora.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        <h3>{editingTask ? 'Editar tarefa' : 'Nova tarefa de casa'}</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        {!editingTask && templates.length > 0 && (
          <div className="field full" style={{marginBottom:14}}>
            <label>Começar a partir de um modelo <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <select value={templateIdSel} onChange={e=>applyTemplate(e.target.value)}>
              <option value="">Criar do zero</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.title}{t.category ? ' · '+t.category : ''}</option>)}
            </select>
          </div>
        )}
        <div className="form-grid">
          <div className="field full">
            <label>Paciente</label>
            <select value={patientIdSel} onChange={e=>setPatientIdSel(e.target.value)} disabled={!!editingTask}>
              <option value="">Selecione</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.socialName || p.name}</option>)}
            </select>
          </div>
          <div className="field full">
            <label>Título</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Diário de emoções" />
          </div>
          <div className="field full">
            <label>Instrução</label>
            <textarea value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Explique o que o paciente deve fazer" />
          </div>
          <div className="field">
            <label>Prazo <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Frequência</label>
            <select value={frequency} onChange={e=>setFrequency(e.target.value)}>
              <option value="unica">Única</option>
              <option value="diaria">Diária</option>
              <option value="semanal">Semanal</option>
            </select>
          </div>
          <div className="field full">
            <label>Vincular a uma sessão <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <select value={sessionIdSel} onChange={e=>setSessionIdSel(e.target.value)}>
              <option value="">Nenhuma sessão específica</option>
              {patientSessions.map(s => <option key={s.id} value={s.id}>{formatDateOnly(s.date)} às {s.startTime}</option>)}
            </select>
          </div>
          <div className="field full">
            <label>Anexos ou links <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <TagInput tags={links} onChange={setLinks} />
            <div className="field hint" style={{marginTop:4}}>Upload de arquivo real chega com o backend — por ora, use links.</div>
          </div>
        </div>
        {patients.length === 0 && (
          <div className="alert alert-danger">Cadastre um paciente ativo antes de criar tarefas.</div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy || patients.length===0}>
            {busy && <span className="spinner"/>}
            {busy ? 'Salvando…' : (editingTask ? 'Salvar alterações' : 'Criar tarefa')}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateFormModal({ editingTemplate, onClose, onSave }){
  const [title, setTitle] = useState(editingTemplate?.title || '');
  const [instructions, setInstructions] = useState(editingTemplate?.instructions || '');
  const [frequency, setFrequency] = useState(editingTemplate?.frequency || 'unica');
  const [category, setCategory] = useState(editingTemplate?.category || '');
  const [links, setLinks] = useState(editingTemplate?.links || []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if(!title.trim()){ setError('Dê um título para o modelo.'); return; }
    if(!instructions.trim()){ setError('Escreva a instrução do modelo.'); return; }
    setBusy(true);
    try{
      await onSave({ title: title.trim(), instructions: instructions.trim(), frequency, category: category || null, links });
      onClose();
    }catch(e){
      setError('Não foi possível salvar o modelo agora.');
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box form-modal" onClick={e=>e.stopPropagation()}>
        <h3>{editingTemplate ? 'Editar modelo' : 'Novo modelo de tarefa'}</h3>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>Título</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Diário de emoções" />
          </div>
          <div className="field full">
            <label>Instrução</label>
            <textarea value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Explique o que o paciente deve fazer" />
          </div>
          <div className="field">
            <label>Frequência</label>
            <select value={frequency} onChange={e=>setFrequency(e.target.value)}>
              <option value="unica">Única</option>
              <option value="diaria">Diária</option>
              <option value="semanal">Semanal</option>
            </select>
          </div>
          <div className="field">
            <label>Categoria <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Ex.: Ansiedade" list="template-categories" />
            <datalist id="template-categories">
              {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="field full">
            <label>Anexos ou links <span style={{fontWeight:400, color:'var(--ink-faint)'}}>(opcional)</span></label>
            <TagInput tags={links} onChange={setLinks} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner"/>}
            {busy ? 'Salvando…' : (editingTemplate ? 'Salvar alterações' : 'Criar modelo')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelosPanel({ psicologoId, templates, onRefresh }){
  const [statusFilter, setStatusFilter] = useState('ativo');
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const frequencyLabel = { unica:'Única', diaria:'Diária', semanal:'Semanal' };

  const saveTemplate = async (data) => {
    const all = await loadTaskTemplates();
    if(editingTemplate){
      const updated = all.map(t => t.id === editingTemplate.id ? { ...t, ...data } : t);
      await saveTaskTemplates(updated);
    } else {
      const newTemplate = { id: templateId(), psicologoId, status:'ativo', createdAt:new Date().toISOString(), ...data };
      await saveTaskTemplates([...all, newTemplate]);
    }
    setShowForm(false);
    setEditingTemplate(null);
    await onRefresh();
  };

  const duplicateTemplate = async (t) => {
    const all = await loadTaskTemplates();
    const copy = { ...t, id: templateId(), title: t.title + ' (cópia)', createdAt: new Date().toISOString() };
    delete copy.updatedAt;
    await saveTaskTemplates([...all, copy]);
    await onRefresh();
  };

  const toggleArchive = async (t) => {
    const all = await loadTaskTemplates();
    const updated = all.map(x => x.id === t.id ? { ...x, status: x.status==='arquivado' ? 'ativo' : 'arquivado' } : x);
    await saveTaskTemplates(updated);
    await onRefresh();
  };

  const filtered = templates.filter(t => statusFilter === 'todos' || t.status === statusFilter);

  return (
    <div>
      <div className="toolbar">
        <div className="filter-pills">
          <button className={'filter-pill '+(statusFilter==='ativo'?'active':'')} onClick={()=>setStatusFilter('ativo')}>Ativos</button>
          <button className={'filter-pill '+(statusFilter==='arquivado'?'active':'')} onClick={()=>setStatusFilter('arquivado')}>Arquivados</button>
          <button className={'filter-pill '+(statusFilter==='todos'?'active':'')} onClick={()=>setStatusFilter('todos')}>Todos</button>
        </div>
        <button className="btn-new" onClick={()=>{ setEditingTemplate(null); setShowForm(true); }}><IconPlus size={15}/> Novo modelo</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon-wrap"><IconTask size={24}/></div>
          <h2>{templates.length === 0 ? 'Nenhum modelo ainda' : 'Nada por aqui'}</h2>
          <p>{templates.length === 0
            ? 'Crie modelos de tarefas recorrentes para reutilizar com qualquer paciente, sem digitar tudo de novo.'
            : 'Nenhum modelo corresponde ao filtro selecionado.'}</p>
        </div>
      ) : (
        filtered.map(t => (
          <div className="task-card" key={t.id}>
            <div className="tc-top">
              <div>
                <div className="tc-title">{t.title}</div>
                {t.category && <div className="tc-patient">{t.category}</div>}
              </div>
              <span className={'badge '+(t.status==='ativo'?'badge-ativo':'badge-arquivado')}>{t.status==='ativo'?'Ativo':'Arquivado'}</span>
            </div>
            <div className="tc-instructions">{t.instructions}</div>
            <div className="tc-meta-row"><span>Frequência: {frequencyLabel[t.frequency]}</span></div>
            <div className="tc-actions">
              <button className="btn-link" onClick={()=>{ setEditingTemplate(t); setShowForm(true); }}>Editar</button>
              <button className="btn-link" onClick={()=>duplicateTemplate(t)}>Duplicar</button>
              <button className="btn-link" style={{color: t.status==='arquivado' ? 'var(--primary-dark)' : 'var(--danger)'}} onClick={()=>toggleArchive(t)}>
                {t.status==='arquivado' ? 'Reativar' : 'Arquivar'}
              </button>
            </div>
          </div>
        ))
      )}

      {showForm && (
        <TemplateFormModal editingTemplate={editingTemplate}
                            onClose={()=>{ setShowForm(false); setEditingTemplate(null); }} onSave={saveTemplate} />
      )}
    </div>
  );
}

function TarefasPsicologo({ psicologoId }){
  const [tab, setTab] = useState('tarefas'); // tarefas | modelos
  const [tasks, setTasks] = useState(null);
  const [patients, setPatients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [patientFilter, setPatientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const refresh = useCallback(async () => {
    const [t, p, tpl] = await Promise.all([loadTasks(), loadPatients(), loadTaskTemplates()]);
    setTasks(t.filter(x => x.psicologoId === psicologoId));
    setPatients(p.filter(x => x.psicologoId === psicologoId && x.status === 'ativo'));
    setTemplates(tpl.filter(x => x.psicologoId === psicologoId && x.status === 'ativo'));
  }, [psicologoId]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveTask = async (data) => {
    const all = await loadTasks();
    const patient = patients.find(p => p.id === data.patientId);
    if(editingTask){
      const updated = all.map(t => t.id === editingTask.id ? { ...t, ...data } : t);
      await saveTasks(updated);
    } else {
      const now = new Date().toISOString();
      const newTask = {
        id: taskId(), psicologoId, status:'pendente', createdAt: now,
        history: [{ status:'pendente', changedAt: now, by:'psicologo' }],
        patientResponse: '', patientLinks: [],
        ...data,
      };
      await saveTasks([...all, newTask]);
      if(patient){
        await pushPatientNotification(patient.email, { type:'tarefa', message:`Nova tarefa: "${data.title}"` });
      }
    }
    setShowForm(false);
    setEditingTask(null);
    await refresh();
  };

  const toggleCancel = async (task) => {
    const all = await loadTasks();
    const newStatus = task.status === 'cancelada' ? 'pendente' : 'cancelada';
    const now = new Date().toISOString();
    const updated = all.map(t => t.id === task.id
      ? { ...t, status:newStatus, history:[...(t.history||[]), { status:newStatus, changedAt:now, by:'psicologo' }] }
      : t);
    await saveTasks(updated);
    await refresh();
  };

  const removeTask = async (task) => {
    const ok = window.confirm(`Excluir a tarefa "${task.title}" definitivamente? Essa ação não pode ser desfeita.`);
    if(!ok) return;
    await deleteTask(task.id);
    await refresh();
  };

  if(tasks === null){
    return <div style={{padding:40, textAlign:'center', color:'var(--ink-faint)', fontSize:13}}>Carregando tarefas…</div>;
  }

  const frequencyLabel = { unica:'Única', diaria:'Diária', semanal:'Semanal' };
  const statusLabel = { pendente:'Pendente', em_andamento:'Em andamento', concluida:'Concluída', cancelada:'Cancelada' };

  const filtered = tasks.filter(t => {
    if(patientFilter !== 'all' && t.patientId !== patientFilter) return false;
    if(statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div>
      <div className="subtabs">
        <button className={tab==='tarefas'?'active':''} onClick={()=>setTab('tarefas')}>Tarefas</button>
        <button className={tab==='modelos'?'active':''} onClick={()=>setTab('modelos')}>Modelos</button>
      </div>

      {tab === 'modelos' && (
        <ModelosPanel psicologoId={psicologoId} templates={templates} onRefresh={refresh} />
      )}

      {tab === 'tarefas' && (
        <div>
          <div className="toolbar">
            <select value={patientFilter} onChange={e=>setPatientFilter(e.target.value)}>
              <option value="all">Todos os pacientes</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.socialName||p.name}</option>)}
            </select>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="all">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <button className="btn-new" onClick={()=>{ setEditingTask(null); setShowForm(true); }}><IconPlus size={15}/> Nova tarefa</button>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="icon-wrap"><IconTask size={24}/></div>
              <h2>{tasks.length === 0 ? 'Nenhuma tarefa ainda' : 'Nada por aqui'}</h2>
              <p>{tasks.length === 0
                ? 'Crie a primeira tarefa de casa para um paciente.'
                : 'Nenhuma tarefa corresponde aos filtros selecionados.'}</p>
              {tasks.length === 0 && (
                <button className="btn-primary" style={{marginTop:16, width:'auto', padding:'10px 20px'}} onClick={()=>{ setEditingTask(null); setShowForm(true); }}>
                  <IconPlus size={15}/> Nova tarefa
                </button>
              )}
            </div>
          ) : (
            filtered.map(t => {
              const patient = patients.find(p => p.id === t.patientId);
              const isLate = t.dueDate && t.dueDate < todayStr() && (t.status === 'pendente' || t.status === 'em_andamento');
              const displayStatus = isLate ? 'atrasada' : t.status;
              return (
                <div className="task-card" key={t.id}>
                  <div className="tc-top">
                    <div>
                      <div className="tc-title">{t.title}</div>
                      <div className="tc-patient">{patient ? (patient.socialName||patient.name) : 'Paciente removido'}</div>
                    </div>
                    <span className={'badge status-'+displayStatus}>{isLate ? 'Atrasada' : statusLabel[t.status]}</span>
                  </div>
                  <div className="tc-instructions">{t.instructions}</div>
                  <div className="tc-meta-row">
                    <span>Frequência: {frequencyLabel[t.frequency]}</span>
                    {t.dueDate && <span>Prazo: {formatDateOnly(t.dueDate)}</span>}
                    {t.sessionId && <span>Vinculada a uma sessão</span>}
                  </div>
                  {t.links && t.links.length > 0 && (
                    <div className="tc-links">
                      {t.links.map((l,i) => <a key={i} href={l} target="_blank" rel="noopener noreferrer">{l}</a>)}
                    </div>
                  )}
                  {(t.patientResponse || (t.patientLinks && t.patientLinks.length > 0)) && (
                    <div style={{marginTop:10, padding:'10px 12px', background:'var(--surface-alt)', borderRadius:10}}>
                      <div style={{fontSize:11, fontWeight:700, color:'var(--ink-muted)', marginBottom:4}}>Resposta do paciente</div>
                      {t.patientResponse && <div style={{fontSize:12.5, color:'var(--ink)', whiteSpace:'pre-wrap'}}>{t.patientResponse}</div>}
                      {t.patientLinks && t.patientLinks.length > 0 && (
                        <div className="tc-links" style={{marginTop:6}}>
                          {t.patientLinks.map((l,i) => <a key={i} href={l} target="_blank" rel="noopener noreferrer">{l}</a>)}
                        </div>
                      )}
                    </div>
                  )}
                  {t.history && t.history.length > 1 && (
                    <div style={{marginTop:8, fontSize:11, color:'var(--ink-faint)'}}>
                      Histórico: {t.history.map((h,i) => `${statusLabel[h.status]||h.status} (${h.by === 'paciente' ? 'paciente' : 'você'}, ${formatDate(h.changedAt)})`).join(' → ')}
                    </div>
                  )}
                  <div className="tc-actions">
                    <button className="btn-link" onClick={()=>{ setEditingTask(t); setShowForm(true); }}>Editar</button>
                    <button className="btn-link" style={{color: t.status==='cancelada' ? 'var(--primary-dark)' : 'var(--danger)'}} onClick={()=>toggleCancel(t)}>
                      {t.status === 'cancelada' ? 'Reativar' : 'Cancelar tarefa'}
                    </button>
                    <button className="btn-link" style={{color:'var(--danger)'}} onClick={()=>removeTask(t)}>Excluir</button>
                  </div>
                </div>
              );
            })
          )}

          {showForm && (
            <TaskFormModal psicologoId={psicologoId} patients={patients} templates={templates} editingTask={editingTask}
                            onClose={()=>{ setShowForm(false); setEditingTask(null); }} onSave={saveTask} />
          )}
        </div>
      )}
    </div>
  );
}

export { TarefasPsicologo, TaskFormModal };
