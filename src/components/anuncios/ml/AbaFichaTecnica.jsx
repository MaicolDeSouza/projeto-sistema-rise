"use client";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { linhasDeEspecificacao } from "@/lib/medidas";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";

/**
 * Aba Ficha tecnica: nesta fase so os atributos de partida (BRAND, MODEL e GTIN), mais a lista de
 * especificacoes que a descricao ja traz, so para consulta. Os atributos da categoria entram na fase 2.
 */
export default function AbaFichaTecnica({ rascunho, alterar, problemas }) {
  const atributos = rascunho.atributos ?? {};
  const emKit = Boolean(rascunho.composicao);
  const especificacoes = linhasDeEspecificacao(rascunho.descricao);
  const erroDoGtin = problemasDoCampo(problemas, "GTIN").some((problema) => problema.bloqueante);

  // O rascunho guarda os atributos como um objeto so, e o servidor grava ele inteiro: atributo
  // em branco sai do objeto, em vez de ir como "" para o Mercado Livre.
  function mudar(id, valor) {
    alterar((atual) => {
      const novos = { ...atual.atributos };
      if (valor.trim() === "") delete novos[id];
      else novos[id] = valor;
      return { atributos: novos };
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Campo
          nome="ml-brand"
          rotulo="Marca (BRAND)"
          ajuda="Comeca com a marca do cadastro do produto."
          value={atributos.BRAND ?? ""}
          onChange={(evento) => mudar("BRAND", evento.target.value)}
        />
        <Campo
          nome="ml-model"
          rotulo="Modelo (MODEL)"
          ajuda="Comeca com o modelo do cadastro do produto."
          value={atributos.MODEL ?? ""}
          onChange={(evento) => mudar("MODEL", evento.target.value)}
        />

        {emKit ? (
          <div>
            <p className="text-sm font-semibold">EAN/GTIN</p>
            <p className="mt-2 text-sm text-suave">Kit nao exige EAN/GTIN.</p>
          </div>
        ) : (
          <Campo
            nome="ml-gtin"
            rotulo="EAN/GTIN"
            ajuda="Codigo de barras da peca avulsa, so numeros. A maioria das categorias de eletronicos exige."
          >
            <input
              id="ml-gtin"
              inputMode="numeric"
              autoComplete="off"
              value={atributos.GTIN ?? ""}
              onChange={(evento) => mudar("GTIN", evento.target.value.replace(/\D/g, ""))}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoGtin)}`}
            />
            <MensagensDoCampo problemas={problemas} campo="GTIN" />
          </Campo>
        )}
      </div>

      <div>
        <div className="flex items-center gap-1 text-sm font-semibold">
          Especificacoes da descricao
          <BolhaDeAjuda
            variante="inline"
            texto="Somente leitura. Sao as linhas no formato '- Nome: valor' da descricao; para mudar, edite a descricao."
          />
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
          <p className="mt-2 text-sm text-suave">Nenhuma especificacao encontrada na descricao.</p>
        )}
        <p className="mt-2 text-[11px] text-suave">Os atributos da categoria do ML entram na fase 2.</p>
      </div>
    </div>
  );
}
