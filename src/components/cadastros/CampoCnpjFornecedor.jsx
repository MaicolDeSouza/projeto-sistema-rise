"use client";

import { useState } from "react";
import { Globe } from "lucide-react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";

/**
 * CNPJ do fornecedor, com o botao "Estrangeiro" ao lado (pedido do dono em
 * 04/10/2026). O CNPJ e obrigatorio; fornecedor de fora do Brasil nao tem, e para
 * ele so o nome vale.
 *
 * Marcado, o campo fica desabilitado e VAZIO na tela (nao mostra um CNPJ digitado
 * antes de marcar), mas o que foi digitado fica guardado: desmarcar devolve o valor.
 * O navegador nao envia campo desabilitado, entao a marca vai num campo oculto
 * (`estrangeiro=on`, o mesmo formato de uma caixa marcada). O servidor tambem zera o
 * CNPJ de quem chega marcado, em `exigirCnpjSalvoEstrangeiro`.
 *
 * Usado no formulario completo e no cadastro rapido dentro de Produtos: os dois sao
 * o mesmo cadastro, e a regra tem que ser a mesma nos dois.
 */
export default function CampoCnpjFornecedor({ erro, cnpjInicial = "", estrangeiroInicial = false }) {
  const [estrangeiro, setEstrangeiro] = useState(estrangeiroInicial);
  const [cnpj, setCnpj] = useState(cnpjInicial);

  return (
    <Campo
      nome="cnpj"
      rotulo="CNPJ"
      erro={erro}
      ajuda="Obrigatorio. Fornecedor de fora do Brasil nao tem CNPJ: use o botao Estrangeiro."
    >
      <div className="flex gap-2">
        <input
          id="cnpj"
          name="cnpj"
          value={estrangeiro ? "" : cnpj}
          onChange={(evento) => setCnpj(evento.target.value)}
          disabled={estrangeiro}
          required={!estrangeiro}
          placeholder={estrangeiro ? "Sem CNPJ (estrangeiro)" : "00.000.000/0000-00"}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)} min-w-0 flex-1 disabled:bg-fundo disabled:text-suave`}
        />
        <button
          type="button"
          aria-pressed={estrangeiro}
          onClick={() => setEstrangeiro((marcado) => !marcado)}
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded border px-3 text-sm font-medium whitespace-nowrap ${
            estrangeiro
              ? "border-acento bg-acento text-white"
              : "border-borda text-suave hover:bg-fundo hover:text-texto"
          }`}
        >
          <Globe size={15} />
          Estrangeiro
        </button>
      </div>
      {estrangeiro && <input type="hidden" name="estrangeiro" value="on" />}
    </Campo>
  );
}
