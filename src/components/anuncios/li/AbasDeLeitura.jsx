"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";

import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import { ORIGENS, TIPOS_PRODUCAO } from "@/lib/fiscal";

/**
 * As abas so de leitura do anuncio da Loja Integrada: Fiscal e Envio. Os valores sao do cadastro do
 * Produto (a fonte e uma so); quem os muda e o cadastro, pelo "Editar produto" (que pergunta antes
 * de sair se o anuncio tem alteracao nao salva).
 */

const vazio = (valor) => valor === null || valor === undefined || String(valor).trim() === "";
const MEDIDA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const rotuloDaOrigem = (valor) => ORIGENS.find((item) => item.valor === valor)?.rotulo ?? null;
const rotuloDoTipo = (valor) => TIPOS_PRODUCAO.find((item) => item.valor === valor)?.rotulo ?? null;

/** O produto no painel de administracao da LI (pedido do dono em 07/10/2026). */
export function linkDoPainelLI(idExterno) {
  return /^\d+$/.test(String(idExterno ?? "")) ? `https://app.lojaintegrada.com.br/catalogo/produto/${idExterno}/editar` : null;
}

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

/** "Editar produto": o editor decide se pergunta antes (alteracao nao salva) e abre o cadastro. */
export function EditarNoProduto({ abrirProduto, className = "text-xs" }) {
  if (!abrirProduto) return null;
  return (
    <button type="button" onClick={abrirProduto} className={`${className} text-acento hover:underline`}>
      Editar produto
    </button>
  );
}

const ROTULO_DO_CAMPO_FISCAL = { origem: "Origem", tipoProducao: "Tipo de producao" };

function valorFiscal(campo, valor) {
  if (valor === null || valor === undefined) return null;
  return campo === "origem" ? rotuloDaOrigem(valor) : rotuloDoTipo(valor);
}

/**
 * O que o dono precisa mudar NO PAINEL da LI: a API nao grava origem nem tipo de producao (medido em
 * 07/10/2026, no PUT e no POST). Aviso grande, com o link direto ao produto no admin da loja.
 */
function AjustesNoPainel({ leitura, idExterno }) {
  if (!leitura) return <p className="rounded border border-borda bg-fundo p-3 text-xs text-suave">Lendo a Loja Integrada para conferir origem e tipo de producao...</p>;
  if (!leitura.ok) return null;
  if (leitura.situacao === "nao_existe") {
    return (
      <p className="rounded border border-borda bg-fundo p-3 text-xs text-suave">
        O produto ainda nao esta na loja. Depois de &quot;Cadastrar na LI&quot;, confira origem e tipo de producao no painel da Loja Integrada: a API nao os grava.
      </p>
    );
  }
  const link = linkDoPainelLI(idExterno);
  const fiscais = leitura.fiscais ?? [];
  if (fiscais.length === 0) {
    return (
      <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
        Origem e tipo de producao na loja conferem com o Rise.
        {link && (
          <>
            {" "}
            <a href={link} target="_blank" rel="noreferrer" className="font-medium underline">
              Abrir no painel da LI
            </a>
          </>
        )}
      </p>
    );
  }
  return (
    <section aria-label="Ajustar no painel da Loja Integrada" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
      <p className="flex items-center gap-2 text-base font-semibold">
        <TriangleAlert size={20} className="shrink-0" />
        Ajuste no painel da Loja Integrada
      </p>
      <p className="mt-1 text-sm">A API da Loja Integrada nao grava estes campos: o Sincronizar nao consegue mudar. Altere-os no produto, no painel da loja:</p>
      <ul className="mt-3 space-y-2">
        {fiscais.map((item) => (
          <li key={item.campo} className="rounded border border-amber-300 bg-white/70 px-3 py-2 text-sm">
            <span className="font-semibold">{ROTULO_DO_CAMPO_FISCAL[item.campo] ?? item.campo}:</span> colocar{" "}
            <span className="font-semibold">{valorFiscal(item.campo, item.rise) ?? "o do Rise"}</span>
            <span className="text-amber-800">
              {" "}
              (na loja: {item.li === null ? "vazio, a nota usa o padrao do emissor" : valorFiscal(item.campo, item.li)})
            </span>
          </li>
        ))}
      </ul>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Abrir o produto no painel da LI
          <ExternalLink size={14} />
        </a>
      ) : (
        <p className="mt-3 text-xs">O link do painel aparece quando o anuncio estiver vinculado ao produto da loja.</p>
      )}
      {link && <p className="mt-1 text-[11px] break-all text-amber-800">{link}</p>}
    </section>
  );
}

/**
 * Fiscal: o que a NF-e nativa da LI usa. NCM e GTIN vao no Sincronizar; origem e tipo de producao a
 * API da LI NAO grava (medido em 07/10/2026): a leitura da loja (feita pelo editor ao abrir) diz o
 * que a loja tem, e o aviso grande lista o que mudar no painel.
 */
export function AbaFiscal({ contexto, problemas, leitura, vinculo, abrirProduto }) {
  const produto = contexto.produto ?? {};
  return (
    <div className="space-y-4">
      <AjustesNoPainel leitura={leitura} idExterno={vinculo?.idExterno ?? leitura?.idExterno} />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Dados da nota fiscal (do cadastro do produto)</p>
        <EditarNoProduto abrirProduto={abrirProduto} />
      </div>
      <div className="rounded border border-borda px-3">
        <Linha rotulo="NCM" valor={produto.ncm} />
        <Linha rotulo="GTIN / EAN" valor={produto.ean} nota={vazio(produto.ean) && leitura?.daLoja?.gtin ? `na loja: ${leitura.daLoja.gtin}` : null} />
        <Linha rotulo="Origem" valor={rotuloDaOrigem(produto.origem)} nota="so leitura na LI: ajuste no painel" />
        <Linha rotulo="Tipo de producao" valor={rotuloDoTipo(produto.tipoProducao)} nota="so leitura na LI: ajuste no painel" />
      </div>
      <MensagensDoCampo problemas={problemas} campo={["ncm", "gtin"]} />
    </div>
  );
}

/** Envio: peso e medidas do cadastro, com o inteiro em cm que vai para a LI (ela nao aceita decimal). */
export function AbaEnvio({ contexto, problemas, abrirProduto }) {
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
        <EditarNoProduto abrirProduto={abrirProduto} />
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
