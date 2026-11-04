// Mismo formato que los códigos aceptados al pegar planillas de logística.
export function getMPOrderLinkWarnings(code: string, exists: boolean | null): string[] {
  const warnings: string[] = [];
  if (!/^[A-Z]{1,8}(?:-[A-Z]{1,8})?-?\d+$/i.test(code)) {
    warnings.push(`“${code}” no tiene un formato de código de pedido reconocido. Revisá que no sea un teléfono u otro dato.`);
  }
  if (exists === false) {
    warnings.push(`El código “${code}” no se encuentra en el ERP. Podés guardarlo igualmente si el pedido todavía no fue cargado.`);
  } else if (exists === null) {
    warnings.push('No se pudo verificar si el código existe en el ERP. Podés guardarlo igualmente y revisarlo después.');
  }
  return warnings;
}
