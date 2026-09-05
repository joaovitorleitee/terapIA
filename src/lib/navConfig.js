import { IconHome, IconCalendar, IconUsers, IconNote, IconTask, IconWallet, IconBarChart, IconHistory } from '../components/icons.jsx';

const NAV_PSICOLOGO = [
  { key:'painel', label:'Painel', icon: IconHome },
  { key:'agenda', label:'Agenda', icon: IconCalendar },
  { key:'pacientes', label:'Pacientes', icon: IconUsers },
  { key:'sessoes', label:'Sessões & Notas', icon: IconNote },
  { key:'tarefas', label:'Tarefas de casa', icon: IconTask },
  { key:'financeiro', label:'Financeiro', icon: IconWallet },
  { key:'relatorios', label:'Relatórios', icon: IconBarChart },
  { key:'auditoria', label:'Auditoria', icon: IconHistory },
];
const NAV_PACIENTE = [
  { key:'inicio', label:'Início', icon: IconHome },
  { key:'minhas-sessoes', label:'Minhas sessões', icon: IconCalendar },
  { key:'minhas-tarefas', label:'Minhas tarefas', icon: IconTask },
  { key:'documentos', label:'Documentos', icon: IconNote },
  { key:'pagamentos', label:'Pagamentos', icon: IconWallet },
];

const SECTION_META = {
  painel:      { title:'Painel', subtitle:'Sua operação em um relance', builtBy:null },
  agenda:      { title:'Agenda', subtitle:'Disponibilidade e calendário', builtBy:null },
  pacientes:   { title:'Pacientes', subtitle:'Cadastro e acompanhamento', builtBy:null },
  sessoes:     { title:'Sessões & Notas', subtitle:'Registro clínico e notas privadas', builtBy:null },
  tarefas:     { title:'Tarefas de casa', subtitle:'Atividades individualizadas por paciente', builtBy:null },
  financeiro:  { title:'Financeiro', subtitle:'Preços, recebimentos e recibos', builtBy:null },
  relatorios:  { title:'Relatórios', subtitle:'Sessões, receita, inadimplência e lucro', builtBy:null },
  auditoria:   { title:'Auditoria', subtitle:'Registro de ações sensíveis na sua conta', builtBy:null },
  inicio:      { title:'Início', subtitle:'Bem-vindo(a) de volta', builtBy:null },
  'minhas-sessoes': { title:'Minhas sessões', subtitle:'Próximas consultas e histórico', builtBy:null },
  'minhas-tarefas': { title:'Minhas tarefas', subtitle:'Suas atividades entre sessões', builtBy:null },
  documentos:  { title:'Documentos', subtitle:'Envie exames, atestados e outros arquivos', builtBy:null },
  pagamentos:  { title:'Pagamentos', subtitle:'Cobranças e comprovantes', builtBy:null },
};

/* ---------- Empty state ---------- */

export { NAV_PSICOLOGO, NAV_PACIENTE, SECTION_META };
