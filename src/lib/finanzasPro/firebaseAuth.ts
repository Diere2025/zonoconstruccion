type Claims={aud:string;iss:string;sub:string;exp:number;iat:number;auth_time:number;email?:string};
let keyCache:{keys:JsonWebKey[];expires:number}|null=null;
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyFinanzasToken(token:string,project='finanzaspro-2-b28cb'):Promise<Claims>{
 const parts=token.split('.');if(parts.length!==3||token.length>12000)throw Error('Sesión inválida');
 const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Claims;
 const now=Math.floor(Date.now()/1000);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.aud!==project||claims.iss!==`https://securetoken.google.com/${project}`||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||!Number.isFinite(claims.auth_time)||claims.auth_time>now+60)throw Error('La sesión venció. Volvé a ingresar a FinanzasPro.');
 if(!keyCache||keyCache.expires<Date.now()){
  const response=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('No se pudo verificar la sesión');
  const result=await response.json() as {keys:JsonWebKey[]};keyCache={keys:result.keys,expires:Date.now()+Math.min(3600,Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1])||300)*1000};
 }
 const jwk=keyCache.keys.find(key=>(key as JsonWebKey&{kid:string}).kid===header.kid);if(!jwk)throw Error('Sesión inválida');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('Sesión inválida');
 return claims;
}
