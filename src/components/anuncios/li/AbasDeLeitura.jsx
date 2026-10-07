"use client";

import Link from "next/link";

import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import { ORIGENS, TIPOS_PRODUCAO } from "@/lib/fiscal";

/**
 * As duas abas so de leitura do anuncio da Loja Integrada: Fiscal e Envio. Os valores sao do
 * cadastro do Produto (a fonte e uma so); quem os muda e o cadastro, pelo link "Editar no produto".
 */

const vazio = (valor) => valor === null || valor === undefined || String(valor).trim() === "";
const MEDIDA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function Linha({ rotulo, valor, nota }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 border-b border-borda py-2 text-sm last:border-b-0">
      <span className="text-suave">{rotulo}</span>
      <span>
        {vazio(valor) ? <span className="text-suave italic">vazio</span> : valor}
        {nota && <span className="ml-2 text-xs text-suave">{nota}</span>}
      </span>
    </div>
  );
}

function EditarNoProduto({ produto }) {
  if (!produto?.id) return null;
  return (
    <Link href={`/produtos/${produto.id}`} target="_blank" className="text-xs text-acento hover:underline">
      Editar no produto
    </Link>
  );
}

/**
 * Fiscal: o que a NF-e nativa da LI usa. NCM e GTIN vao no Sincronizar; origem e tipo de producao a
 * API da LI NAO grava (medido em 07/10/2026): o pop-up do icone compara com a loja e avisa quando o
 * dono precisa ajustar no painel da LI.
 */
export function AbaFiscal({ contexto, problemas }) {
  const produto = contexto.produto ?? {};
  const origem = ORIGENS.find((item) => item.valor === produto.origem)?.rotulo ?? null;
  const tipo = TIPOS_PRODUCAO.find((item) => item.valor === produto.tipoProducao)?.rotulo ?? null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Dados da nota fiscal (do cadastro do produto)</p>
        <EditarNoProduto produto={produto} />
      </div>
      <div className="rounded border border-borda px-3">
        <Linha rotulo="NCM" valor={produto.ncm} />
        <Linha rotulo="GTIN / EAN" valor={produto.ean} />
        <Linha rotulo="Origem" valor={origem} nota="so leitura na LI: ajuste no painel" />
        <Linha rotulo="Tipo de producao" valor={tipo} nota="so leitura na LI: ajuste no painel" />
      </div>
      <MensagensDoCampo problemas={problemas} campo={["ncm", "gtin"]} />
      <p className="text-xs text-suave">
        A API da Loja Integrada nao grava origem nem tipo de producao. O pop-up do icone da Loja Integrada, na lista de Produtos, mostra o que a loja tem e avisa quando difere.
      </p>
    </div>
  );
}

/** Envio: peso e medidas do cadastro, com o inteiro em cm que vai para a LI (ela nao aceita decimal). */
export function AbaEnvio({ contexto, problemas }) {
  const produto = contexto.produto ?? {};
  const medida = (valor) => {
    if (vazio(valor) || !(Number(valor) > 0)) return null;
    const inteiro = Math.ceil(Number(Number(valor).toFixed(3)));
    return Number(valor) === inteiro ? `${inteiro} cm` : `${MEDIDA.format(Number(valor))} cm -> ${inteiro} cm`;
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Peso e medidas (do cadastro do produto)</p>
        <EditarNoProduto produto={produto} />
      </div>
      <div className="rounded border border-borda px-3">
        <Linha rotulo="Peso" valor={vazio(produto.pesoKg) ? null : `${MEDIDA.format(Number(produto.pesoKg))} kg`} />
        <Linha rotulo="Comprimento" valor={medida(produto.comprimentoCm)} />
        <Linha rotulo="Largura" valor={medida(produto.larguraCm)} />
        <Linha rotulo="Altura" valor={medida(produto.alturaCm)} />
      </div>
      <MensagensDoCampo problemas={problemas} campo={["peso", "medidas"]} />
      <p className="text-xs text-suave">A Loja Integrada guarda medida em centimetro inteiro: o valor sobe para o inteiro de cima.</p>
    </div>
  );
}
