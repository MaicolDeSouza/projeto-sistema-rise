/**
 * Os problemas da validacao que pertencem a um campo (ou a varios), na lista que cada aba
 * recebe: o `campo` de `validarRascunhoML` diz a que campo a mensagem se refere.
 */
export function problemasDoCampo(problemas, campo) {
  const campos = [campo].flat();
  return problemas.filter((problema) => campos.includes(problema.campo));
}

/**
 * Embaixo do campo, uma linha por problema: vermelho quando impede publicar (`bloqueante`), ambar
 * quando e so alerta. `campo` pode ser uma lista (o cartao do produto junta "produto" e "blingId").
 */
export default function MensagensDoCampo({ problemas, campo }) {
  return problemasDoCampo(problemas, campo).map((item, posicao) => (
    <p key={posicao} className={`mt-1 text-[11px] ${item.bloqueante ? "text-red-700" : "text-amber-700"}`}>
      {item.problema}
    </p>
  ));
}
