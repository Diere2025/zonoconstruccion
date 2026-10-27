export function reopeningReason(value:unknown):string {
 const reason=typeof value==='string'?value.trim():'';
 if(reason.length<20||reason.length>2000||(reason.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/g)||[]).length<4)
  throw new Error('Explicá qué se cerró mal, qué vas a corregir y por qué corresponde reabrir (20 a 2000 caracteres).');
 return reason;
}
