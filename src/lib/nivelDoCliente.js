/**
 * O nivel do cliente (Pedidos de venda, 04/11/2026): Bronze, Prata, Ouro ou Platinum, escolhido no cadastro; sem nivel
 * e o padrao. As metricas que o calculariam vem depois. Sem imports: lido pela tela do cadastro, pela acao de salvar,
 * pelo selo dos pedidos e pelo teste.
 */
export const NIVEIS_DO_CLIENTE = [
  { valor: "BRONZE", rotulo: "Bronze" },
  { valor: "PRATA", rotulo: "Prata" },
  { valor: "OURO", rotulo: "Ouro" },
  { valor: "PLATINUM", rotulo: "Platinum" },
];

const VALIDOS = new Set(NIVEIS_DO_CLIENTE.map((nivel) => nivel.valor));

/** O nivel que veio do formulario: `{ nivel }` (null = sem nivel) ou `{ erro }` para valor fora da lista. */
export function lerNivelDoCliente(texto) {
  const valor = String(texto ?? "").trim();
  if (!valor) return { nivel: null };
  return VALIDOS.has(valor) ? { nivel: valor } : { erro: "Escolha um nível da lista." };
}
