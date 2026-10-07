"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { CLASSE_CAMPO, bordaDoCampo } from "./Campo";

/**
 * Lista de valores de um mesmo campo (telefones, e-mails) — o cliente pode ter
 * mais de um. Sempre ha pelo menos uma linha, para o campo nao "sumir" num
 * cadastro sem nenhum valor.
 *
 * Cada linha e um <input> com o MESMO `name`: o formulario as envia na ordem da
 * tela, e o servidor le com `formData.getAll(nome)`. O primeiro valor e o
 * principal. Linha em branco e ignorada la, entao nao ha o que "limpar" aqui.
 *
 * Os valores ficam no estado (controlados) e a chave e o indice: ao remover uma
 * linha, quem vem depois desce um lugar, e como o texto vem do estado ele desce
 * junto. Com campo nao controlado e chave por indice, o texto ficaria para tras.
 *
 * `filtrar` limpa o texto A CADA TECLA (tirar letra de um telefone) e `formatar` o
 * arruma AO SAIR do campo — o mesmo momento em que CPF/CNPJ sao formatados. Formatar
 * a cada tecla trava o apagar: apagar o hifen nao muda os digitos, a mascara o
 * devolve, e o cursor nao anda.
 */
export default function ListaDeValores({
  nome,
  rotulo,
  rotuloIncluir,
  inicial,
  erro,
  type = "text",
  inputMode,
  placeholder,
  maxLength,
  filtrar,
  formatar,
  maximo = 10,
}) {
  const [valores, setValores] = useState(() => (inicial?.length ? inicial : [""]));

  const mudar = (indice, texto) =>
    setValores((atual) => atual.map((valor, i) => (i === indice ? texto : valor)));
  const remover = (indice) =>
    setValores((atual) => (atual.length > 1 ? atual.filter((_, i) => i !== indice) : [""]));
  const incluir = () => setValores((atual) => (atual.length < maximo ? [...atual, ""] : atual));

  return (
    <div>
      <p className="text-sm font-semibold">{rotulo}</p>

      <div className="space-y-2">
        {valores.map((valor, indice) => (
          <div key={indice} className="flex items-center gap-1.5">
            <input
              name={nome}
              type={type}
              inputMode={inputMode}
              value={valor}
              onChange={(evento) =>
                mudar(indice, filtrar ? filtrar(evento.target.value) : evento.target.value)
              }
              onBlur={formatar ? () => mudar(indice, formatar(valor)) : undefined}
              placeholder={placeholder}
              maxLength={maxLength}
              aria-label={`${rotulo} ${indice + 1}`}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)}`}
            />
            {valores.length > 1 && (
              <button
                type="button"
                onClick={() => remover(indice)}
                aria-label={`Remover ${rotulo.toLowerCase()} ${indice + 1}`}
                className="mt-1 rounded p-1.5 text-suave hover:bg-fundo hover:text-red-600"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {valores.length < maximo && (
          <button
            type="button"
            onClick={incluir}
            className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
          >
            <Plus size={15} />
            {rotuloIncluir}
          </button>
        )}
        {valores.length > 1 && <span className="text-xs text-suave">O primeiro é o principal.</span>}
      </div>

      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
    </div>
  );
}
