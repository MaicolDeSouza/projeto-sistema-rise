# Assinatura digital do PDF da proposta (e-CNPJ A1)

Data: 17/11/2026. Aprovado pelo dono no chat (Opção 1, "na hora"; "assinara apenas as marcadas").

## Por quê

Clientes (o primeiro: um órgão que pediu "a proposta deve estar assinada digitalmente, com Certificado Digital com token ou
Assinatura eletrônica pelo portal Gov.br") exigem a proposta assinada. Vai ser rotina. Quem se compromete com preço e prazo é
a empresa, então a assinatura é a do **e-CNPJ A1 da 4hobby** (o dono já tem o arquivo e a senha). O A3 (token) não serve: o
Rise roda na VPS, sem o token espetado.

## O que o dono decidiu

1. **Só as propostas marcadas** são assinadas (caixa "Assinar digitalmente" no card "Condições da proposta").
2. **Assina na hora** (Opção 1): toda vez que o PDF de uma proposta marcada é gerado (botão do Rise ou o link público), o Rise
   assina naquele instante. Não há cópia guardada a refazer quando a proposta muda.
3. **Certificado em Configurações › Dados da empresa**, seção "Certificado digital": enviar o `.pfx`/`.p12` e a senha; a tela
   mostra razão social, CNPJ e validade; trocar e remover só o Administrador. Gravado cifrado no banco.
4. **Selo visível no fim do PDF** (abaixo dos totais): "Documento assinado digitalmente", a razão social, "CNPJ:", a data e
   hora de Brasília e "Verifique em validar.iti.gov.br". A assinatura de verdade (ICP-Brasil, dentro do arquivo) é a que vale.
5. **O link público ganha "Baixar PDF assinado"**: hoje o link é uma página HTML, que não carrega assinatura.
6. **Sem certificado, senha errada ou vencido:** o PDF sai sem assinatura e sem selo, e a tela avisa. A proposta nunca trava.
7. **Saúde do Rise avisa 30 dias antes de vencer** (e vencido).

## Fora do escopo

Assinatura pelo Gov.br (é da pessoa, não da empresa), A3/token, assinar outros documentos (pedido de compra, NF), guardar o
histórico dos PDFs assinados, carimbo do tempo de uma ACT (a hora é a do servidor).

## Abordagens consideradas

- **Na hora (escolhida):** simples, sempre igual à proposta atual. Custo: decifra a chave a cada PDF assinado (milissegundos).
- **Assinar e guardar nos Anexos:** registro exato do enviado, mas mudou a proposta, alguém precisa lembrar de reassinar. Recusada.

## Como construir (decisões de quem constrói)

- **Cofre:** `Conexao` com o serviço novo `CERTIFICADO_DIGITAL` (enum `Servico`, migration aditiva). `segredoCifrado` =
  `cifrar({ pfx: base64, senha })` (`src/lib/crypto.js`, AES-256-GCM, `ENCRYPTION_KEY`); `contaExterna` = razão social e CNPJ
  lidos do certificado; `expiraEm` = `notAfter`; `status` CONECTADO. A senha nunca volta para a tela nem para o log.
- **Leitura do certificado** com `node-forge` 1.4.2: abrir o PKCS#12 com a senha (senha errada = recusa com mensagem), achar o
  certificado que tem chave privada, ler o CN (`RAZAO SOCIAL:CNPJ` no e-CNPJ ICP-Brasil), `notBefore`/`notAfter`. Recusar
  arquivo maior que 50 KB, sem chave privada ou já vencido.
- **Assinatura** com `@signpdf/signpdf` + `@signpdf/signer-p12` + `@signpdf/placeholder-plain` 4.0.0 (o `placeholder-pdfkit`
  exige pdfkit < 0.16 e o Rise usa 0.17.2): o `pdfDaProposta` desenha o selo e fecha o PDF; depois `plainAddPlaceholder`
  (subFilter `ETSI.CAdES.detached`, motivo "Proposta comercial Nº ...", local "Caxias do Sul - RS") e `SignPdf.sign` com o
  `P12Signer`. Num módulo próprio (`src/lib/propostas/assinatura.js`), só no servidor.
- **Proposta:** coluna `assinarDigitalmente Boolean @default(false)` (migration aditiva), no esquema, no formulário, na
  gravação e no MCP de leitura. A caixa fica desabilitada sem certificado válido, com o motivo no `title` (regra 8 do
  padrão visual) e uma linha âmbar quando marcada e o certificado venceu.
- **Rotas:** `/api/propostas/[numero]/pdf` assina quando marcada. Rota nova `/p/proposta/[chave]/pdf` (mesma chave do link,
  só para proposta marcada; 404 nas outras), e o Caddyfile passa a aceitar `^/p/proposta/[A-Za-z0-9_-]{43}(/pdf)?$`. A página
  pública mostra o botão "Baixar PDF assinado" só na proposta marcada.
- **Saúde do Rise:** verificação nova "Certificado digital": sem certificado = nada; vence em até 30 dias = atenção; vencido = erro.
- **Testes** no `teste:propostas`: certificado de teste gerado na hora com `node-forge` (autoassinado, CN "ZZ TESTE:00000000000000"),
  leitura (senha errada, vencido, sem chave), gravação cifrada, PDF assinado (tem `/ByteRange` e `/Contents`, a assinatura
  confere com o conteúdo, o selo está no texto), PDF sem certificado sai sem assinatura, rota pública recusa a não marcada.

## Verificação que só o certificado real faz

Assinar uma proposta com o A1 da 4hobby no PC e passar em **validar.iti.gov.br** e no Adobe Reader antes do deploy. Se o ITI
recusar o formato, ajustar o subFilter ou os atributos (signing-certificate-v2) antes de entregar.
