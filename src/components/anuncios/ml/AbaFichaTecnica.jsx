"use client";

import { useEffect, useRef } from "react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { motivoSemGtin } from "@/lib/canaisDeVenda/ml/atributos";
import { linhasDeEspecificacao } from "@/lib/medidas";
import CampoDeAtributo from "./CampoDeAtributo";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import SugestaoDeFicha from "./SugestaoDeFicha";

const DO_GTIN = new Set(["GTIN", "EMPTY_GTIN_REASON"]);

/**
 * Aba Ficha tecnica. Com a categoria lida do ML (fase 2), os atributos DELA: obrigatorios em
 * destaque, o GTIN junto do motivo de nao ter, e os demais numa secao recolhida, com "Preencher
 * com IA". Sem categoria, os tres campos de partida da fase 1 (Marca, Modelo, GTIN) e o aviso.
 *
 * O rascunho guarda os atributos como um objeto so (`{ id: valor }`), e o servidor grava ele
 * inteiro: atributo em branco sai do objeto, em vez de ir como "" para o Mercado Livre.
 */
export default function AbaFichaTecnica({ rascunho, contexto, alterar, problemas, irPara }) {
  const atributos = rascunho.atributos ?? {};
  const emKit = Boolean(rascunho.composicao);
  const categoria = contexto.categoria && contexto.categoria.id === rascunho.categoriaId ? contexto.categoria : null;
  const listaDaCategoria = categoria?.atributos ?? [];
  const motivoDoKit = emKit ? motivoSemGtin(listaDaCategoria, { kit: true }) : null;
  const motivoJaEscolhido = String(atributos.EMPTY_GTIN_REASON ?? "").trim() !== "";
  // A categoria em que o motivo "kit ou pack" ja foi posto: uma vez por categoria, para nao
  // desfazer a escolha do dono se ele trocar o motivo depois.
  const motivoPostoEm = useRef(null);

  function mudar(id, valor) {
    alterar((atual) => {
      const novos = { ...atual.atributos };
      if (String(valor).trim() === "") delete novos[id];
      else novos[id] = valor;
      return { atributos: novos };
    });
  }

  // Kit nao tem GTIN: o motivo oficial "kit ou pack" da categoria ja nasce escolhido.
  useEffect(() => {
    // Fora do kit a marca zera: ligar o kit de novo (o motivo saiu ao desligar) poe "kit ou pack" outra vez.
    if (!emKit) {
      motivoPostoEm.current = null;
      return;
    }
    if (!categoria || !motivoDoKit || motivoJaEscolhido || motivoPostoEm.current === categoria.id) return;
    motivoPostoEm.current = categoria.id;
    alterar((atual) => (String(atual.atributos?.EMPTY_GTIN_REASON ?? "").trim() ? {} : { atributos: { ...atual.atributos, EMPTY_GTIN_REASON: motivoDoKit } }));
  }, [emKit, categoria, motivoDoKit, motivoJaEscolhido, alterar]);

  // Duas colunas (pedido do dono em 22/10/2026): a esquerda, os atributos que o ML pede, numa caixa so e com "*" nos
  // obrigatorios; a direita, as caracteristicas do produto no Rise, para conferir lado a lado. A direita fica presa no
  // alto ao rolar, porque a lista do ML e longa.
  const doRise = <CaracteristicasDoRise produto={contexto.produtos?.[rascunho.produtoId]} />;

  if (!categoria) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>Escolha a categoria na aba Geral para ver os atributos dela.</span>
          <button type="button" onClick={() => irPara("geral")} className="rounded border border-borda bg-superficie px-2 py-1 text-xs text-texto hover:bg-fundo">
            Ir para Geral
          </button>
        </div>
        <div className="grid items-start gap-6 md:grid-cols-2">
          <CaixaDoML titulo="Atributos do Mercado Livre">
            <CampoDeAtributo atributo={{ id: "BRAND", nome: "Marca", tipo: "texto", valores: [], unidades: [] }} valor={atributos.BRAND} problemas={problemas} aoMudar={(valor) => mudar("BRAND", valor)} />
            <CampoDeAtributo atributo={{ id: "MODEL", nome: "Modelo", tipo: "texto", valores: [], unidades: [] }} valor={atributos.MODEL} problemas={problemas} aoMudar={(valor) => mudar("MODEL", valor)} />
            <CampoDoGtin atributos={atributos} emKit={emKit} problemas={problemas} mudar={mudar} />
          </CaixaDoML>
          {doRise}
        </div>
      </div>
    );
  }

  // Na ordem: obrigatorios, o codigo de barras (GTIN e o motivo de nao ter) e os demais da categoria.
  const obrigatorios = listaDaCategoria.filter((atributo) => atributo.obrigatorio && !DO_GTIN.has(atributo.id));
  const motivo = listaDaCategoria.find((atributo) => atributo.id === "EMPTY_GTIN_REASON");
  const temGtin = listaDaCategoria.some((atributo) => atributo.id === "GTIN");
  const outros = listaDaCategoria.filter((atributo) => !atributo.obrigatorio && !DO_GTIN.has(atributo.id));
  const todos = [...obrigatorios, ...outros];
  const preenchidos = todos.filter((atributo) => String(atributos[atributo.id] ?? "").trim()).length;

  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <CaixaDoML titulo={`Atributos do Mercado Livre (${preenchidos} de ${todos.length} preenchidos)`}>
        <SugestaoDeFicha rascunho={rascunho} alterar={alterar} />
        {obrigatorios.map((atributo) => (
          <CampoDeAtributo key={atributo.id} atributo={atributo} valor={atributos[atributo.id]} problemas={problemas} aoMudar={(valor) => mudar(atributo.id, valor)} />
        ))}
        {temGtin && <CampoDoGtin atributos={atributos} emKit={emKit} problemas={problemas} mudar={mudar} />}
        {motivo && (
          <CampoDeAtributo
            atributo={{ ...motivo, nome: "Motivo de não ter GTIN" }}
            valor={atributos.EMPTY_GTIN_REASON}
            problemas={problemas}
            aoMudar={(valor) => mudar("EMPTY_GTIN_REASON", valor)}
          />
        )}
        {outros.map((atributo) => (
          <CampoDeAtributo key={atributo.id} atributo={atributo} valor={atributos[atributo.id]} problemas={problemas} aoMudar={(valor) => mudar(atributo.id, valor)} />
        ))}
      </CaixaDoML>
      {doRise}
    </div>
  );
}

/** A caixa da esquerda: todos os atributos do ML, um por linha. */
function CaixaDoML({ titulo, children }) {
  return (
    <section className="rounded-lg border border-borda">
      <header className="flex items-center gap-1 border-b border-borda bg-fundo px-3 py-2 text-sm font-semibold">
        {titulo}
        <BolhaDeAjuda variante="inline" texto="O que o Mercado Livre pede nesta categoria. * = obrigatório para publicar." />
      </header>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}

/**
 * A coluna da direita: o que o cadastro do produto no Rise ja diz (marca, modelo, EAN, peso, medidas e as linhas
 * "- Nome: valor" da descricao do produto). So leitura: para mudar, edita-se o produto.
 */
function CaracteristicasDoRise({ produto }) {
  const linhas = [];
  if (produto) {
    const decimal = (valor) => String(valor).replace(".", ",");
    const medidas = [produto.comprimentoCm, produto.larguraCm, produto.alturaCm];
    const fixas = [
      ["Marca", produto.marca],
      ["Modelo", produto.modelo],
      ["EAN/GTIN", produto.ean],
      ["Peso", produto.pesoKg === null || produto.pesoKg === undefined ? null : `${decimal(produto.pesoKg)} kg`],
      ["Medidas (C x L x A)", medidas.every((m) => m !== null && m !== undefined) ? `${medidas.map(decimal).join(" x ")} cm` : null],
    ];
    for (const [nome, valor] of fixas) if (valor) linhas.push({ nome, valor });
    linhas.push(...linhasDeEspecificacao(produto.descricaoBase));
  }
  return (
    <section className="rounded-lg border border-borda md:sticky md:top-2">
      <header className="flex items-center gap-1 border-b border-borda bg-fundo px-3 py-2 text-sm font-semibold">
        Características do produto no Rise
        <BolhaDeAjuda variante="inline" texto="Somente leitura: o cadastro do produto e as linhas '- Nome: valor' da descrição dele. Para mudar, edite o produto." />
      </header>
      {linhas.length > 0 ? (
        <dl className="divide-y divide-borda text-sm">
          {linhas.map((linha, posicao) => (
            <div key={posicao} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-1.5">
              <dt className="text-suave">{linha.nome}</dt>
              <dd className="break-words">{linha.valor}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-3 py-3 text-sm text-suave">O produto não tem características cadastradas.</p>
      )}
    </section>
  );
}

/** O GTIN (EAN) da peca avulsa: so numeros. No kit ele nao existe, e o motivo "kit ou pack" vale. */
function CampoDoGtin({ atributos, emKit, problemas, mudar }) {
  if (emKit) {
    return (
      <div>
        <p className="text-sm font-semibold">EAN/GTIN</p>
        <p className="mt-2 text-sm text-suave">Kit não leva EAN/GTIN.</p>
      </div>
    );
  }
  const comErro = problemasDoCampo(problemas, "GTIN").some((problema) => problema.bloqueante);
  return (
    <Campo nome="ml-gtin" rotulo="EAN/GTIN" ajuda="Código de barras da peça avulsa, só números. Sem ele, escolha o motivo ao lado.">
      <input
        id="ml-gtin"
        inputMode="numeric"
        autoComplete="off"
        value={atributos.GTIN ?? ""}
        onChange={(evento) => mudar("GTIN", evento.target.value.replace(/\D/g, ""))}
        className={`${CLASSE_CAMPO} ${bordaDoCampo(comErro)}`}
      />
      <MensagensDoCampo problemas={problemas} campo="GTIN" />
    </Campo>
  );
}
