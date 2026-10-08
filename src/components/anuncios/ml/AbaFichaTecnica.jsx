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
  const especificacoes = linhasDeEspecificacao(rascunho.descricao);
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
    if (!categoria || !motivoDoKit || motivoJaEscolhido || motivoPostoEm.current === categoria.id) return;
    motivoPostoEm.current = categoria.id;
    alterar((atual) => (String(atual.atributos?.EMPTY_GTIN_REASON ?? "").trim() ? {} : { atributos: { ...atual.atributos, EMPTY_GTIN_REASON: motivoDoKit } }));
  }, [categoria, motivoDoKit, motivoJaEscolhido, alterar]);

  const listaDeEspecificacoes = (
    <div>
      <div className="flex items-center gap-1 text-sm font-semibold">
        Especificações da descrição
        <BolhaDeAjuda variante="inline" texto="Somente leitura. São as linhas no formato '- Nome: valor' da descrição; para mudar, edite a descrição." />
      </div>
      {especificacoes.length > 0 ? (
        <ul className="mt-2 divide-y divide-borda rounded border border-borda text-sm">
          {especificacoes.map((linha, posicao) => (
            <li key={posicao} className="px-3 py-2">
              <span className="font-medium">{linha.nome}:</span> {linha.valor}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-suave">Nenhuma especificação encontrada na descrição.</p>
      )}
    </div>
  );

  if (!categoria) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>Escolha a categoria na aba Geral para ver os atributos dela.</span>
          <button type="button" onClick={() => irPara("geral")} className="rounded border border-borda bg-superficie px-2 py-1 text-xs text-texto hover:bg-fundo">
            Ir para Geral
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <CampoDeAtributo atributo={{ id: "BRAND", nome: "Marca (BRAND)", tipo: "texto", valores: [], unidades: [] }} valor={atributos.BRAND} problemas={problemas} aoMudar={(valor) => mudar("BRAND", valor)} />
          <CampoDeAtributo atributo={{ id: "MODEL", nome: "Modelo (MODEL)", tipo: "texto", valores: [], unidades: [] }} valor={atributos.MODEL} problemas={problemas} aoMudar={(valor) => mudar("MODEL", valor)} />
          <CampoDoGtin atributos={atributos} emKit={emKit} problemas={problemas} mudar={mudar} />
        </div>
        {listaDeEspecificacoes}
      </div>
    );
  }

  const obrigatorios = listaDaCategoria.filter((atributo) => atributo.obrigatorio && !DO_GTIN.has(atributo.id));
  const motivo = listaDaCategoria.find((atributo) => atributo.id === "EMPTY_GTIN_REASON");
  const temGtin = listaDaCategoria.some((atributo) => atributo.id === "GTIN");
  const outros = listaDaCategoria.filter((atributo) => !atributo.obrigatorio && !DO_GTIN.has(atributo.id));
  const preenchidosDosOutros = outros.filter((atributo) => String(atributos[atributo.id] ?? "").trim()).length;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold">Obrigatórios nesta categoria</p>
        <div className="mt-2 grid gap-4 md:grid-cols-3">
          {obrigatorios.map((atributo) => (
            <CampoDeAtributo key={atributo.id} atributo={atributo} valor={atributos[atributo.id]} problemas={problemas} aoMudar={(valor) => mudar(atributo.id, valor)} />
          ))}
        </div>
      </section>

      {(temGtin || motivo) && (
        <section>
          <p className="text-sm font-semibold">Código de barras</p>
          <div className="mt-2 grid gap-4 md:grid-cols-3">
            {temGtin && <CampoDoGtin atributos={atributos} emKit={emKit} problemas={problemas} mudar={mudar} />}
            {motivo && (
              <CampoDeAtributo
                atributo={{ ...motivo, nome: "Motivo de não ter GTIN" }}
                valor={atributos.EMPTY_GTIN_REASON}
                problemas={problemas}
                aoMudar={(valor) => mudar("EMPTY_GTIN_REASON", valor)}
              />
            )}
          </div>
        </section>
      )}

      <SugestaoDeFicha rascunho={rascunho} alterar={alterar} />

      {outros.length > 0 && (
        <details className="rounded border border-borda">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            Outros atributos da categoria ({preenchidosDosOutros} de {outros.length} preenchidos)
          </summary>
          <div className="grid gap-4 border-t border-borda p-3 md:grid-cols-3">
            {outros.map((atributo) => (
              <CampoDeAtributo key={atributo.id} atributo={atributo} valor={atributos[atributo.id]} problemas={problemas} aoMudar={(valor) => mudar(atributo.id, valor)} />
            ))}
          </div>
        </details>
      )}

      {listaDeEspecificacoes}
    </div>
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
