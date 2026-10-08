"use client";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import MensagensDoCampo from "./MensagensDoCampo";

// Marca e Modelo sao sempre MAIUSCULAS (padrao de dado do CLAUDE.md).
const EM_MAIUSCULAS = new Set(["BRAND", "MODEL"]);

/// "5 V" -> { numero: "5", unidade: "V" }. O que nao casa fica inteiro no numero, para nao sumir.
function separarUnidade(valor, unidades) {
  const texto = String(valor ?? "").trim();
  const casamento = /^([\d.,]+)\s*(.*)$/.exec(texto);
  if (!casamento) return { numero: texto, unidade: unidades[0] ?? "" };
  return { numero: casamento[1], unidade: unidades.includes(casamento[2]) ? casamento[2] : (unidades[0] ?? "") };
}

/**
 * Um atributo da categoria do ML, no controle certo para o tipo dele: lista e sim/nao viram
 * `<select>` com os valores oficiais (grava o NOME do valor, que e o que o anuncio manda); numero com
 * unidade vira numero + unidade ("5 V"); o resto e texto. `aoMudar(texto)` recebe o valor final,
 * vazio quando o dono apagou.
 */
export default function CampoDeAtributo({ atributo, valor, problemas, aoMudar }) {
  const id = `ml-atributo-${atributo.id}`;
  const comErro = (problemas ?? []).some((problema) => problema.campo === atributo.id && problema.bloqueante);
  const classe = `${CLASSE_CAMPO} ${bordaDoCampo(comErro)}`;
  const rotulo = `${atributo.nome}${atributo.obrigatorio ? " *" : ""}`;
  const mensagens = <MensagensDoCampo problemas={problemas} campo={atributo.id} />;

  if ((atributo.tipo === "lista" || atributo.tipo === "booleano") && atributo.valores.length > 0) {
    const atual = String(valor ?? "");
    // Valor gravado que nao esta na lista (digitado antes, ou a lista mudou) continua visivel: a
    // validacao aponta o erro, e o dono escolhe outro.
    const fora = atual && !atributo.valores.some((opcao) => opcao.nome === atual);
    return (
      <Campo nome={id} rotulo={rotulo} ajuda={atributo.dica ?? undefined}>
        <select id={id} value={atual} onChange={(evento) => aoMudar(evento.target.value)} className={classe}>
          <option value="">(não informado)</option>
          {fora && <option value={atual}>{atual} (fora da lista)</option>}
          {atributo.valores.map((opcao) => (
            <option key={opcao.id} value={opcao.nome}>
              {opcao.nome}
            </option>
          ))}
        </select>
        {mensagens}
      </Campo>
    );
  }

  if (atributo.tipo === "numero_unidade" && atributo.unidades.length > 0) {
    const { numero, unidade } = separarUnidade(valor, atributo.unidades);
    const juntar = (novoNumero, novaUnidade) => aoMudar(novoNumero.trim() ? `${novoNumero.trim()} ${novaUnidade}` : "");
    return (
      <Campo nome={id} rotulo={rotulo} ajuda={atributo.dica ?? undefined}>
        <div className="flex gap-2">
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={numero}
            onChange={(evento) => juntar(evento.target.value.replace(/[^\d.,]/g, ""), unidade)}
            className={classe}
          />
          {atributo.unidades.length > 1 ? (
            <select
              aria-label={`Unidade de ${atributo.nome}`}
              value={unidade}
              onChange={(evento) => juntar(numero, evento.target.value)}
              className={`${CLASSE_CAMPO} w-24 border-borda`}
            >
              {atributo.unidades.map((opcao) => (
                <option key={opcao}>{opcao}</option>
              ))}
            </select>
          ) : (
            <span className="mt-1 self-center text-sm text-suave">{unidade}</span>
          )}
        </div>
        {mensagens}
      </Campo>
    );
  }

  function digitar(evento) {
    const campo = evento.currentTarget;
    if (!EM_MAIUSCULAS.has(atributo.id)) {
      aoMudar(campo.value);
      return;
    }
    // Converte enquanto se digita e refaz a selecao: trocar so pelo React levaria o cursor ao fim.
    const convertido = campo.value.toLocaleUpperCase("pt-BR");
    if (convertido !== campo.value) {
      const { selectionStart: inicio, selectionEnd: fim } = campo;
      campo.value = convertido;
      campo.setSelectionRange(inicio, fim);
    }
    aoMudar(convertido);
  }

  return (
    <Campo nome={id} rotulo={rotulo} ajuda={atributo.dica ?? undefined}>
      <input
        id={id}
        inputMode={atributo.tipo === "numero" ? "decimal" : undefined}
        autoComplete="off"
        value={valor ?? ""}
        onChange={digitar}
        className={classe}
      />
      {mensagens}
    </Campo>
  );
}
