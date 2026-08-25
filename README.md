# TerapIA

Plataforma de gestão para psicólogos e pacientes — agenda, prontuário, tarefas de casa, financeiro e portal do paciente.

## Status atual

MVP validado com o stakeholder (18 User Stories + 2 melhorias solicitadas durante os testes). Projeto na
**Fase 2**: migração do protótipo interativo para uma base de produção real.

- ✅ Banco de dados real (Supabase/Postgres), com Row Level Security em 100% das tabelas.
- ✅ Autenticação real (Supabase Auth — e-mail/senha).
- ✅ Projeto reestruturado de um único arquivo HTML para um projeto React + Vite com build normal,
  organizado por componente/domínio.
- ⏳ Camada de dados de negócio (pacientes, sessões, notas, tarefas, financeiro) ainda persiste no
  `localStorage` do navegador — o schema já existe no Postgres (ver `src/lib/dataStore.js`), falta apenas
  trocar as chamadas por consultas reais ao Supabase. É o próximo item de dívida técnica.

## Stack

- **Front-end**: React 18 + Vite (build normal, sem Babel no navegador).
- **Backend**: [Supabase](https://supabase.com) (Postgres + Auth) — projeto `terapia-producao`
  (organização `terapIA`, região `sa-east-1`).
- **PDF**: jsPDF, para geração de recibos.
- **Hospedagem**: Vercel.

## Estrutura do projeto

```
src/
  main.jsx              # ponto de entrada
  App.jsx               # componente raiz: autenticação, navegação, layout
  index.css             # design tokens e estilos globais
  lib/
    supabaseClient.js    # cliente Supabase
    storage.js           # wrapper sobre localStorage (persistência local, ver dívida técnica)
    dataStore.js         # toda a camada de dados e regras de negócio (agenda, conflitos, financeiro...)
    navConfig.js         # configuração de navegação e seções
  components/
    icons.jsx             # ícones em SVG
    shared.jsx             # componentes reutilizados (EmptyState, TagInput, termos...)
    auth.jsx                # login, cadastro, recuperação de senha, bloqueio de consentimento
    layout.jsx              # menu de conta, notificações, perfil
    psicologo/               # painel, pacientes, agenda, notas, tarefas, financeiro
    paciente/                 # início, sessões, tarefas, pagamentos
```

## Rodando localmente

```bash
npm install
cp .env.example .env      # ajuste se estiver usando outro projeto Supabase
npm run dev
```

## Build de produção

```bash
npm run build
npm run preview   # testa o build localmente
```

## Configuração do Supabase

A chave usada é a **pública/anon** do Supabase — segura para expor no front-end, pois todo o controle de
acesso é feito por Row Level Security no banco.

- URL do projeto: `https://qyjnfxgonjnjgdkecfdl.supabase.co`
- Painel: https://supabase.com/dashboard/project/qyjnfxgonjnjgdkecfdl

### Contas de demonstração

| Papel | E-mail | Senha |
|---|---|---|
| Psicólogo | marina@terapia.demo | 123456 |
| Paciente (já consentiu) | joao@terapia.demo | 123456 |
| Paciente (sem consentimento) | ana@terapia.demo | 123456 |

## Deploy no Vercel

1. Suba este repositório para o GitHub.
2. Importe no [Vercel](https://vercel.com/new) — framework "Vite" é detectado automaticamente
   (`npm run build`, saída em `dist/`).
3. Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do projeto
   (Settings → Environment Variables) usando os valores de `.env.example`.
4. Cada push na branch principal gera um novo deploy automaticamente.

## Dívida técnica (Fase 2, em ordem de prioridade)

1. **Conectar a camada de dados ao Supabase** — `src/lib/dataStore.js` hoje usa `localStorage`
   (`src/lib/storage.js`); o schema já existe no Postgres, falta trocar as funções `load*/save*` por
   chamadas ao `supabase.from(...)`.
2. **Confirmação de e-mail** — revisar em Supabase Dashboard → Authentication → Providers → Email antes
   de abrir cadastro para usuários reais.
3. **Multi-tenant** — suportar clínicas com múltiplos psicólogos.
4. **Dados fiscais do psicólogo** — CRP, CNPJ/CPF, dados bancários (pré-requisito para nota fiscal e
   Pix/cartão).
5. **Cobrança digital** (Pix/cartão/boleto) e **nota fiscal** real.
6. **Notificações por e-mail/WhatsApp** — hoje só existem dentro do próprio app.
7. **Code splitting** — o bundle de produção está acima de 500 kB (principalmente por causa do jsPDF);
   vale usar `import()` dinâmico para a geração de recibos.
8. **Relatórios avançados**, **biblioteca de modelos de tarefa**, **administração de clínica** e
   **auditoria completa**.

O backlog completo, com critérios de aceite de cada item, está no board do Trello do projeto.
