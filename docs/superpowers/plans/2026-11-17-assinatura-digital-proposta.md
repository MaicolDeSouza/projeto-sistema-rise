# Assinatura digital da proposta — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, preferência do dono). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o PDF da proposta marcada "Assinar digitalmente" sai assinado pelo e-CNPJ A1 da 4hobby, com selo, no Rise e no link público.

**Architecture:** o certificado (`.pfx` + senha) fica cifrado na `Conexao` CERTIFICADO_DIGITAL; `assinatura.js` lê o PKCS#12 e assina
o buffer do PDF (placeholder no PDF pronto + CMS); `pdfParaEnviar` junta geração, selo e assinatura e cai para o PDF sem assinatura
em qualquer falha.

**Tech Stack:** Next 16, Prisma 7, pdfkit 0.17.2, `@signpdf/signpdf` 4.0.0, `@signpdf/signer-p12` 4.0.0,
`@signpdf/placeholder-plain` 4.0.0, `node-forge` 1.4.2.

**Spec:** `docs/superpowers/specs/2026-11-17-assinatura-digital-proposta-design.md`

## Global Constraints

- Versões exatas: `@signpdf/*` 4.0.0, `node-forge` 1.4.2 (`npm install --save-exact`).
- Só as propostas com `assinarDigitalmente = true` são assinadas; sem certificado válido o PDF sai igual ao de hoje (sem selo).
- A senha e o `.pfx` nunca voltam para a tela, o log, o MCP nem a resposta de ação. Arquivo até 50 KB.
- Trocar/remover o certificado: só `tela.configuracoes.usuarios` "editar" (o Administrador), conferido no servidor.
- Texto de tela com acento; identificadores e comentários sem acento; comentário diz o porquê.
- Migration aditiva, à mão, com nome `20261117g_assinatura_digital`.
- Commit só dos meus arquivos (outra sessão mexe em `src/components/propostas` e `src/lib/propostas`).

## Review Focus

1. Senha com acento ou símbolo ("Ação#2026") abre o PKCS#12 (o forge espera a senha em binário/UTF-8): teste na Tarefa 1.
2. `.pfx` com a cadeia (AC + certificado) escolhe o certificado da chave privada, não o da AC: teste na Tarefa 1.
3. `segredoCifrado` corrompido ou `ENCRYPTION_KEY` trocada: `certificadoParaAssinar` devolve `null` (PDF sem assinatura), nunca 500: teste na Tarefa 2.
4. Link público de proposta NÃO marcada pedindo `/pdf`: 404, e o Caddy só deixa passar `/pdf` depois da chave exata: teste na Tarefa 5.
5. Certificado que vence entre o envio e o download: o PDF sai sem assinatura (vencido não assina): teste na Tarefa 4.

---

### Tarefa 1: ler o certificado e assinar um PDF

**Files:** Create `src/lib/propostas/assinatura.js`, `scripts/lib/certificadoDeTeste.js`; Modify `package.json`; Test `scripts/teste-propostas.js`

**Interfaces — Produces:**
- `lerCertificado(pfx: Buffer, senha: string, agora = new Date()) -> { razaoSocial, cnpj, titular, validoDe: Date, validoAte: Date }`; erros
  (`Error.message`, com acento): "Arquivo maior que 50 KB.", "Senha do certificado incorreta ou arquivo inválido.", "O arquivo não
  tem a chave privada do certificado.", "Certificado vencido em dd/mm/aaaa.". CN do e-CNPJ = "RAZAO SOCIAL:14 dígitos" → `cnpj`
  formatado "00.000.000/0000-00"; CN sem ":" → `razaoSocial` = CN e `cnpj` null.
- `assinarPdf(pdf: Buffer, { pfx, senha, motivo, local }) -> Promise<Buffer>` (placeholder `plainAddPlaceholder` com subFilter
  `SUBFILTER_ETSI_CADES_DETACHED`, `signatureLength` 16384; `SignPdf.sign` com `P12Signer`).
- `certificadoDeTeste({ cn = "ZZ TESTE LTDA:00000000000191", senha = "Ação#2026", vencido = false, comCadeia = false }) -> { pfx: Buffer, senha }` (só testes; RSA 2048 gerado com forge).

- [ ] Instalar: `npm install --save-exact @signpdf/signpdf@4.0.0 @signpdf/signer-p12@4.0.0 @signpdf/placeholder-plain@4.0.0 node-forge@1.4.2`
- [ ] Testes (grupo "Assinatura digital") que falham antes:
  - `lerCertificado(pfx, senha)` do teste → `razaoSocial` "ZZ TESTE LTDA", `cnpj` "00.000.000/0001-91"; com `comCadeia: true` o mesmo.
  - senha errada → lança "Senha do certificado incorreta ou arquivo inválido."; `vencido: true` → lança "Certificado vencido em …";
    `Buffer.alloc(51 * 1024)` → "Arquivo maior que 50 KB.".
  - `assinarPdf(pdfDeUmaPropostaDeTeste)`: o texto do resultado tem `/ByteRange` e `ETSI.CAdES.detached`; o CMS extraído de
    `/Contents` (forge `pkcs7.messageFromAsn1`) traz o certificado de CN "ZZ TESTE LTDA:00000000000191", e o atributo
    `messageDigest` é o SHA-256 das duas faixas do `/ByteRange`.
- [ ] `npm run teste:propostas` falha nos novos; implementar; passa.
- [ ] Commit `Propostas: ler o certificado A1 e assinar o PDF`.

### Tarefa 2: cofre do certificado e a coluna da proposta

**Files:** Modify `prisma/schema.prisma` (enum `Servico` + `CERTIFICADO_DIGITAL`; `PropostaParaCliente.assinarDigitalmente Boolean @default(false)`);
Create `prisma/migrations/20261117g_assinatura_digital/migration.sql`, `src/lib/propostas/certificado.js`; Test `scripts/teste-propostas.js`

**Interfaces — Produces** (`certificado.js`, servidor):
- `gravarCertificado({ pfx: Buffer, senha }) -> { razaoSocial, cnpj, validoAte: string ISO }` (chama `lerCertificado`; upsert da
  `Conexao` CERTIFICADO_DIGITAL: `segredoCifrado = cifrar({ pfx: base64, senha })`, `contaExterna = "RAZAO:cnpj"`, `expiraEm`,
  `status` CONECTADO, `conectadoEm`).
- `removerCertificado() -> void` (apaga a linha).
- `situacaoDoCertificado(agora = new Date()) -> null | { razaoSocial, cnpj, validoAte: ISO, vencido: boolean, diasParaVencer: number }` (sem segredo).
- `certificadoParaAssinar(agora = new Date()) -> null | { pfx: Buffer, senha, razaoSocial, cnpj }` (null: sem linha, vencido ou
  falha ao decifrar; nunca lança).

- [ ] Migration: `ALTER TYPE "Servico" ADD VALUE 'CERTIFICADO_DIGITAL';` e `ALTER TABLE "PropostaParaCliente" ADD COLUMN "assinarDigitalmente" BOOLEAN NOT NULL DEFAULT false;`; `npx prisma migrate deploy` e `npx prisma generate` no PC.
- [ ] Testes que falham antes: gravar o certificado de teste → `situacaoDoCertificado()` com a razão social e `vencido` false;
  `certificadoParaAssinar()` devolve o `pfx` igual ao enviado; com `agora` depois do `validoAte` → `null`; `segredoCifrado` trocado
  por "a.b.c" → `null`; a `Conexao` gravada não contém a senha em texto (`!segredoCifrado.includes(senha)`); `removerCertificado()` →
  `situacaoDoCertificado()` null. O teste guarda e devolve a `Conexao` do dono, se houver (padrão do `teste:telegram`).
- [ ] Implementar; `npm run teste:propostas` passa; commit `Propostas: certificado digital cifrado no banco`.

### Tarefa 3: a caixa "Assinar digitalmente" na proposta

**Files:** Modify `src/lib/propostas/esquema.js`, `src/lib/propostas/banco.js` (leitura ~169 e gravação ~406), `src/components/propostas/formato.js`,
`src/components/propostas/BlocosDaProposta.jsx` (`CartaoCondicoesDaProposta`), `src/components/propostas/EditorProposta.jsx`,
`src/app/propostas/[numero]/page.jsx` (e a página de nova proposta, se separada); Test `scripts/teste-propostas.js`

**Interfaces — Consumes:** `situacaoDoCertificado()`. **Produces:** prop `certificado` (o retorno de `situacaoDoCertificado`) no `EditorProposta` e no `CartaoCondicoesDaProposta`.

- [ ] Teste: gravar proposta com `assinarDigitalmente: true` e reler → `true`; sem o campo → `false`.
- [ ] Esquema (`dados.assinarDigitalmente = entrada.assinarDigitalmente === true`), banco e formulário; a leitura da proposta
  (`banco.js` ~169, a mesma que o MCP `lerProposta` usa) devolve `assinarDigitalmente`.
- [ ] Caixa "Assinar digitalmente" (checkbox, linha inteira embaixo dos campos do card, com `BolhaDeAjuda`: "O PDF sai assinado pelo
  certificado digital da empresa (e-CNPJ), com o selo no fim."). Sem certificado: desabilitada, `title` "Cadastre o certificado
  digital em Configurações › Dados da empresa." Marcada com certificado vencido: linha âmbar "Certificado vencido em dd/mm/aaaa: o
  PDF sai sem assinatura." Marcada e válido: texto suave ao lado "por RAZÃO SOCIAL".
- [ ] lint, teste, commit `Propostas: caixa Assinar digitalmente`.

### Tarefa 4: o PDF assinado com o selo

**Files:** Modify `src/lib/propostas/pdf.js` (selo), `src/app/api/propostas/[numero]/pdf/route.js`; Create `src/lib/propostas/pdfParaEnviar.js`; Test `scripts/teste-propostas.js`

**Interfaces — Consumes:** `assinarPdf`, `certificadoParaAssinar`. **Produces:**
- `pdfDaProposta(proposta, empresa, extras)` aceita `extras.selo = { razaoSocial, cnpj, quando: Date }` e desenha o selo depois dos
  totais (caixa com borda, ícone de visto, 5 linhas: "Documento assinado digitalmente", razão social em negrito, "CNPJ: …",
  "Data: dd/mm/aaaa hh:mm (horário de Brasília)", "Verifique em validar.iti.gov.br"); nova página se não couber.
- `pdfParaEnviar(proposta, agora = new Date()) -> Promise<{ bytes: Buffer, assinado: boolean }>`: lê empresa e extras; se marcada e
  `certificadoParaAssinar(agora)` existe, gera com selo e assina; qualquer erro na assinatura = `console.error` sem segredo e o PDF
  de novo SEM selo (`assinado: false`).

- [ ] Testes: proposta marcada com o certificado de teste → `assinado` true, texto tem `/ByteRange` e o selo ("assinado
  digitalmente"); não marcada → `assinado` false e sem `/ByteRange`; marcada com `agora` depois do vencimento → `assinado` false
  e sem o selo; marcada com `segredoCifrado` corrompido → `assinado` false.
- [ ] Implementar; a rota do Rise usa `pdfParaEnviar` (nome do arquivo ganha `-assinada` quando assinado).
- [ ] Gerar o PDF da proposta 2026 com o certificado de teste no scratchpad e olhar o selo; commit `Propostas: PDF assinado com selo`.

### Tarefa 5: link público com "Baixar PDF assinado"

**Files:** Create `src/app/p/proposta/[chave]/pdf/route.js`; Modify `src/lib/propostas/paginaPublica.js`, `deploy/caddy/Caddyfile`; Test `scripts/teste-propostas.js`

- [ ] Testes: `htmlDaProposta` da marcada tem o link `href="/p/proposta/<chave>/pdf"` com o texto "Baixar PDF assinado"; da não
  marcada, não tem; o Caddyfile tem `path_regexp ^/p/proposta/[A-Za-z0-9_-]{43}(/pdf)?$`; o GET da rota nova (chamada direto com
  `params`) devolve 404 para a não marcada e `application/pdf` para a marcada.
- [ ] Rota: mesma validação de chave do link (`propostaPelaChavePublica`), só marcada, `pdfParaEnviar`, cabeçalhos do link
  (`no-store`, `noindex`, `Content-Disposition: attachment`). CSP da página pública continua; o link é relativo, sem script.
- [ ] Commit `Propostas: PDF assinado pelo link público`.

### Tarefa 6: tela do certificado e aviso na Saúde do Rise

**Files:** Create `src/components/configuracoes/CertificadoDigital.jsx`, `src/app/configuracoes/empresa/acoes-certificado.js`;
Modify `src/app/configuracoes/empresa/page.jsx`, `src/lib/saude/regras.js`, `src/lib/saude/coletar.js`; Test `scripts/teste-saude.js`

**Interfaces — Produces:** `avaliarCertificado(situacao, agora) -> { estado, detalhe }`: `null` → `aguardando` "Não cadastrado.";
vencido → `falha` "Vencido em dd/mm/aaaa: as propostas saem sem assinatura."; até 30 dias → `atencao` "Vence em N dia(s) (dd/mm/aaaa)."; senão `ok` "Vale até dd/mm/aaaa.".
Ações: `enviarCertificadoAcao(formData)` (campos `arquivo`, `senha`) e `removerCertificadoAcao()`, as duas conferindo
`tela.configuracoes.usuarios` "editar" e devolvendo `{ ok, erro?, situacao? }`.

- [ ] Teste na saúde: os quatro casos de `avaliarCertificado` (com `agora` fixo).
- [ ] Seção "Certificado digital" na página Dados da empresa (cartão abaixo do formulário): sem certificado, campo de arquivo
  (`accept=".pfx,.p12"`), senha (`type=password`, `autoComplete="off"`) e "Enviar certificado"; com certificado, a razão social, o
  CNPJ e "Vale até dd/mm/aaaa" (âmbar em até 30 dias, vermelho vencido), "Trocar certificado" e "Remover" (popup com o nome do
  certificado e "as propostas marcadas passam a sair sem assinatura"). Somente leitura para quem não é Administrador.
- [ ] Item "Certificado digital" na Saúde (`caminho: "/configuracoes/empresa"`). lint, `teste:saude`, commit `Configurações: certificado digital da empresa`.

### Tarefa 7: conferência e documentação

- [ ] `npx eslint src/lib/propostas src/components/propostas src/components/configuracoes src/app/configuracoes src/app/p`,
  `npm run teste:propostas`, `npm run teste:saude`, `npm run teste:mcp` (Caddyfile).
- [ ] Tela no navegador (localhost, largura de notebook): a seção do certificado e a caixa na proposta.
- [ ] CLAUDE.md (seção Propostas: assinatura digital, onde mora o certificado, a rota pública, o que falta medir) e a linha do
  `teste:propostas` na lista "Rodar"; commit.
- [ ] O dono envia o A1 no Rise do PC (localhost › Configurações › Dados da empresa), marca a proposta 2026, baixa o PDF e passa em
  validar.iti.gov.br e no Adobe Reader. Só depois, deploy quando ele disser "sobe" (o deploy aplica a migration; o certificado é
  enviado de novo na tela da VPS, porque o banco do PC não sobe).
