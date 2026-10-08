# Canais de Venda — Mercado Livre, fase 3b (vários anúncios do mesmo produto, registrados no Bling)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Plano curto, aprovado pelo dono em 08/10/2026 ("Sim, seguir"), executado inline logo depois do teste real que o motivou.

**Goal:** Vários anúncios do mesmo produto no ML (Clássico, Premium...) com o estoque controlado pelo Bling: o Publicar reaproveita o vínculo produto-loja que já existe e **registra cada anúncio no Bling** pelo recurso `/anuncios`; a recusa "um só anúncio por produto" sai.

**Spec:** `docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md` (§3 item 7, §7). Medições: seção "Canais de Venda: Mercado Livre (fase 3, publicar)" do `CLAUDE.md` (08/10/2026).

## Decisões

1. O vínculo `/produtos/lojas` é **um por produto por loja** (medido): `vincularNoBlingML` passa a devolver `ok` + `jaEstava` quando o produto já tem **qualquer** vínculo na loja do ML, sem escrever. O `codigo` do vínculo existente não é alterado.
2. Etapa nova **`registrar_bling`**, depois de `vinculo` e antes de `ativar`: `POST /anuncios` com `{ produto, integracao: { tipo: "MercadoLivre" }, loja, anuncioLoja: { id: MLB }, nome, preco: { valor }, mercadoLivre: { modalidade } }`; relê `GET /anuncios?...&idProduto=` e, se o registro voltou sem título ou preço (o POST medido os ignorou quando não foram mandados; mandados, não medido), completa com `PUT /anuncios/{id}`. Já registrado (MLB na lista) → não escreve. Grava `publicacao.blingAnuncioId`.
3. `/anuncios/{id}/publicar` e `/pausar` **não** são chamados (podem agir no ML).
4. A pré-checagem deixa de recusar produto com outro MLB vinculado; o resumo da janela continua informando os outros MLB.

## Tarefa única (TDD, um commit)

**Files:** `src/lib/canaisDeVenda/ml/bling.js` (`vinculoNoBlingML`, `vincularNoBlingML`, novos `anuncioNoBlingML` e `registrarAnuncioNoBlingML`; sai `recadoDoVinculoUnico`), `ml/etapas.js`, `ml/publicar.js`, `scripts/lib/blingFalso.js` (rotas `/anuncios`), `scripts/teste-anuncios-ml.js`, `CLAUDE.md`.

- [ ] Testes (falham): Bling falso com `GET /anuncios` (exige `tipoIntegracao`, `idLoja`; filtra `idProduto`), `GET /anuncios/{id}`, `POST /anuncios` (201 `{ data: { id, idsVariacoes: [] } }`; guarda `anuncioLoja.id`, `titulo` = `nome`, `preco` = `preco.valor`, `situacao` 2), `PUT /anuncios/{id}` (204 `null`); `vincularNoBlingML` com outro MLB já ligado → `{ ok: true, jaEstava: true }` e zero POST; `registrarAnuncioNoBlingML` registra uma vez e não duplica; pré-checagem aceita o produto já vinculado; `publicarAnuncioML` grava `blingAnuncioId`, faz `POST /anuncios` uma vez, e a falha em `registrar_bling` deixa o item pausado e a retomada termina.
- [ ] Implementar; `npm run teste:anuncios-ml`, `teste:bling-sync`, `lint` verdes.
- [ ] Commit, push, `CLAUDE.md` (etapas e a correção da conclusão errada).
- [ ] Teste real com o dono: 100101 Premium a R$ 999 (anúncio adicional), medir `/anuncios` no Bling e o ML; encerrar depois.
