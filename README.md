# TerapIA

Plataforma de gestão para psicólogos e pacientes — agenda, prontuário, tarefas de casa, financeiro e portal do paciente.

## Status atual

MVP validado com o stakeholder (18 User Stories + 2 melhorias solicitadas durante os testes). O projeto está na
**Fase 2**: migração do protótipo interativo para uma base de produção real.

- ✅ Banco de dados real (Supabase/Postgres), com Row Level Security em 100% das tabelas.
- ✅ Autenticação real (Supabase Auth — e-mail/senha, sem mais login simulado).
- ⏳ Camada de dados de negócio (pacientes, sessões, notas, tarefas, financeiro) ainda roda em
  armazenamento local do navegador (`window.storage`), com o mesmo modelo de dados já espelhado no banco
  Postgres. A conexão do front-end a essas tabelas é o próximo passo — ver "Dívida técnica" abaixo.

## Stack

- **Front-end**: React 18 (via CDN) + Babel standalone (transpila JSX direto no navegador). Um único arquivo
  `index.html`, sem etapa de build.
- **Backend**: [Supabase](https://supabase.com) (Postgres + Auth), projeto `terapia-producao` (organização `terapIA`, região `sa-east-1`).
- **PDF**: jsPDF (via CDN), para geração de recibos.
- **Hospedagem**: Vercel (site estático, sem build).

> Nota: usar React+Babel via CDN sem etapa de build é adequado para prototipagem rápida, mas não é a prática
> recomendada para produção em escala (bundle maior, sem tree-shaking, Babel roda no navegador do usuário).
> Migrar para um bundler (Vite, por exemplo) é um item de dívida técnica.

## Rodando localmente

Não há dependências nem build. Basta servir o arquivo estático:

```bash
npx serve .
# ou simplesmente abra index.html no navegador
```

## Configuração do Supabase

O projeto já vem com a URL e a chave pública (anon/publishable) do Supabase embutidas em `index.html`. Isso é
seguro: essa chave é pública por design e todo o controle de acesso real é feito por Row Level Security no
banco — nenhuma linha é lida ou escrita sem passar pelas políticas de RLS.

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
2. Importe o repositório no [Vercel](https://vercel.com/new) — nenhuma configuração de build é necessária
   (framework "Other", sem comando de build, diretório de saída = raiz).
3. Cada push na branch principal gera um novo deploy automaticamente.

## Dívida técnica (Fase 2, em ordem de prioridade)

1. **Conectar o front-end ao banco real** — hoje pacientes, sessões, notas, tarefas e financeiro ainda usam
   armazenamento local do navegador; o schema já existe no Postgres, falta trocar as chamadas.
2. **Confirmação de e-mail** — revisar se o projeto exige confirmação de e-mail (Supabase Dashboard →
   Authentication → Providers → Email) antes de abrir cadastro para usuários reais.
3. **Multi-tenant** — suportar clínicas com múltiplos psicólogos.
4. **Dados fiscais do psicólogo** — CRP, CNPJ/CPF, dados bancários (pré-requisito para nota fiscal e Pix/cartão).
5. **Cobrança digital** (Pix/cartão/boleto) e **nota fiscal** real.
6. **Notificações por e-mail/WhatsApp** — hoje só existem dentro do próprio app.
7. **Relatórios avançados**, **biblioteca de modelos de tarefa**, **administração de clínica** e **auditoria completa**.

O backlog completo, com critérios de aceite de cada item, está no board do Trello do projeto.
