"use client";

import { Check, ChevronDown, ExternalLink } from "lucide-react";

import MensagensDoCampo from "@/components/anuncios/ml/MensagensDoCampo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { ORIGENS_DA_LI, ROTULO_DO_TIPO_PRODUCAO } from "@/lib/canaisDeVenda/li/rotulos";

/**
 * As abas so de leitura do anuncio da Loja Integrada: Fiscal e Envio. Os valores sao do cadastro do
 * Produto (a fonte e uma so); quem os muda e o cadastro, pelo "Editar produto" (que pergunta antes
 * de sair se o anuncio tem alteracao nao salva).
 */

const vazio = (valor) => valor === null || valor === undefined || String(valor).trim() === "";
const MEDIDA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });


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

/**
 * Um campo das "Informacoes Fiscais" no molde do painel da Loja Integrada (pedido do dono em 24/10/2026: olhar o Rise e
 * saber EXATAMENTE o que escolher na LI). A caixa mostra a opcao que a loja deve ter (a do cadastro do produto), com o
 * texto da LI; embaixo, como a loja esta. So leitura: a API da LI nao grava estes campos (medido em 07/10/2026).
 */
function CampoFiscalDaLI({ rotulo, deve, naLoja, situacao }) {
  const igual = situacao === "igual";
  const borda = situacao === "diferente" || situacao === "vazio" ? "border-amber-400 bg-amber-50" : igual ? "border-emerald-300" : "border-borda";
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">{rotulo}</p>
      <div className={`flex min-h-11 items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${borda}`}>
        <span className={deve ? "" : "text-suave italic"}>{deve ?? "Não definido no cadastro do produto"}</span>
        <ChevronDown size={16} className="shrink-0 text-suave" />
      </div>
      <p className="mt-1.5 flex items-start gap-1.5 text-xs">
        {igual && (
          <span className="flex items-center gap-1 text-emerald-700">
            <Check size={13} /> Igual na Loja Integrada
          </span>
        )}
        {situacao === "diferente" && (
          <span className="text-amber-800">
            Na LI está: <span className="font-semibold">{naLoja}</span>. Escolha a opção acima.
          </span>
        )}
        {situacao === "vazio" && <span className="text-amber-800">Na LI está vazio (a nota usa o padrão do emissor). Escolha a opção acima.</span>}
        {situacao === "lendo" && <span className="text-suave">Lendo a Loja Integrada...</span>}
        {situacao === "fora" && <span className="text-suave">O produto ainda não está na loja: escolha esta opção depois de cadastrar.</span>}
      </p>
    </div>
  );
}

/** Como a loja esta para o campo: igual, diferente, vazio, lendo ou fora (produto que nao esta na loja). */
function situacaoFiscal(leitura, campo, deRise) {
  if (!leitura) return "lendo";
  if (!leitura.ok) return null;
  if (leitura.situacao === "nao_existe") return "fora";
  if (deRise === null || deRise === undefined) return null;
  const daLoja = leitura.daLoja?.[campo] ?? null;
  if (daLoja === null) return "vazio";
  // O codigo da origem pode chegar como numero ou texto: compara o texto.
  return String(daLoja) === String(deRise) ? "igual" : "diferente";
}

const textoDaOrigem = (valor) => (valor === null || valor === undefined ? null : (ORIGENS_DA_LI[valor] ?? String(valor)));
const textoDoTipo = (valor) => (valor ? (ROTULO_DO_TIPO_PRODUCAO[valor] ?? valor) : null);

/**
 * Tributacao: as "Informacoes Fiscais" da Loja Integrada (tipo de producao e origem da mercadoria, so no painel da LI) e,
 * embaixo, NCM e GTIN (esses vao no Sincronizar). A leitura da loja (feita pelo editor ao abrir) diz como a loja esta.
 */
export function AbaFiscal({ contexto, problemas, leitura, vinculo, abrirProduto }) {
  const produto = contexto.produto ?? {};
  const tipo = situacaoFiscal(leitura, "tipoProducao", produto.tipoProducao);
  const origem = situacaoFiscal(leitura, "origem", produto.origem);
  const mudar = [tipo, origem].some((situacao) => situacao === "diferente" || situacao === "vazio");
  const link = linkDoPainelLI(vinculo?.idExterno ?? leitura?.idExterno);
  return (
    <div className="space-y-5">
      <section aria-label="Informações Fiscais da Loja Integrada" className="rounded-lg border border-borda">
        <div className="flex items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <div className="flex items-center gap-1 text-base font-semibold">
            Informações Fiscais
            <BolhaDeAjuda
              variante="inline"
              texto="Os dois campos como estão no painel da Loja Integrada (produto, Informações Fiscais). A API da LI não grava estes campos: o que estiver diferente se muda no painel. O valor certo vem do cadastro do produto."
            />
          </div>
          <EditarNoProduto abrirProduto={abrirProduto} />
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <CampoFiscalDaLI
            rotulo="Tipo de produção"
            deve={textoDoTipo(produto.tipoProducao)}
            naLoja={textoDoTipo(leitura?.daLoja?.tipoProducao)}
            situacao={tipo}
          />
          <CampoFiscalDaLI
            rotulo="Origem da mercadoria"
            deve={textoDaOrigem(produto.origem)}
            naLoja={textoDaOrigem(leitura?.daLoja?.origem)}
            situacao={origem}
          />
        </div>
        {link && (
          <div className="border-t border-borda px-4 py-3">
            {mudar ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Abrir o produto no painel da LI para mudar
                <ExternalLink size={14} />
              </a>
            ) : (
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-acento hover:underline">
                Abrir no painel da LI <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}
      </section>

      <div>
        <p className="mb-2 text-sm font-semibold">Vão no Sincronizar (do cadastro do produto)</p>
        <div className="rounded border border-borda px-3">
          <Linha rotulo="NCM" valor={produto.ncm} />
          <Linha rotulo="GTIN / EAN" valor={produto.ean} nota={vazio(produto.ean) && leitura?.daLoja?.gtin ? `na loja: ${leitura.daLoja.gtin}` : null} />
        </div>
        <MensagensDoCampo problemas={problemas} campo={["ncm", "gtin"]} />
      </div>
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
      <p className="text-xs text-suave">A Loja Integrada guarda medida em centímetro inteiro: o valor sobe para o inteiro de cima.</p>
    </div>
  );
}
