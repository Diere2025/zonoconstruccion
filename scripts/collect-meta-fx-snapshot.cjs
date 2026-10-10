// Collect a public Binance P2P purchase quotation. No ERP or customer data.
const REFERENCE_ARS=1000000;
async function collectQuote(fetcher=fetch,now=Date.now) {
 for(const host of ['https://p2p.binance.com','https://www.binance.com','https://c2c.binance.com']) {
  try {
   const r=await fetcher(host+'/bapi/c2c/v2/friendly/c2c/adv/search',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({fiat:'ARS',asset:'USDT',tradeType:'BUY',page:1,rows:20,transAmount:String(REFERENCE_ARS),publisherType:'merchant',payTypes:[],countries:[],proMerchantAds:false,shieldMerchantAds:false,filterType:'all'})});
   if(!r.ok)throw Error('Quote unavailable');const body=await r.json();if(body.code!=='000000'||!Array.isArray(body.data))throw Error('Invalid response');
   const prices=body.data.flatMap(({adv})=>{const p=Number(adv?.price),min=Number(adv?.minSingleTransAmount),max=Number(adv?.maxSingleTransAmount),available=Number(adv?.surplusAmount);return [p,min,max,available].every(Number.isFinite)&&p>0&&min>0&&min<=REFERENCE_ARS&&max>=REFERENCE_ARS&&available*p>=REFERENCE_ARS?[p]:[]}).sort((a,b)=>a-b).slice(0,5);
   if(prices.length<3)throw Error('Insufficient offers');const middle=Math.floor(prices.length/2);const baseRate=prices.length%2?prices[middle]:(prices[middle-1]+prices[middle])/2;
   return {source:'binance_p2p',transport:'direct',baseRate,referenceArs:REFERENCE_ARS,quotedAt:new Date(now()).toISOString()};
  } catch {}
 }
 const r=await fetcher('https://criptoya.com/api/binancep2p/usdt/ars/500',{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});if(!r.ok)throw Error('Binance sources unavailable');const b=await r.json(),rate=Number(b.ask),timestamp=Number(b.time)*1000;
 if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(timestamp)||timestamp>now()+60000||now()-timestamp>600000)throw Error('Aggregator quote expired or invalid');
 return {source:'binance_p2p',transport:'criptoya',baseRate:rate,referenceUsdt:500,referenceArs:REFERENCE_ARS,quotedAt:new Date(timestamp).toISOString()};
}
async function publish(quote,token,repository) {
 if(!/^[\w-]+\/[\w.-]+$/.test(repository||''))throw Error('Invalid repository');
 const url=`https://api.github.com/repos/${repository}/contents/quote.json`,branch='codex/meta-fx-quotes';
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'Zono-meta-fx','Content-Type':'application/json'};
 const previous=await fetch(url+'?ref='+encodeURIComponent(branch),{headers});if(!previous.ok)throw Error('Snapshot read failed: '+previous.status);const existing=await previous.json();
 const r=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'[skip ci] Update public Binance P2P quotation',branch,sha:existing.sha,content:Buffer.from(JSON.stringify(quote,null,2)+'\n').toString('base64')})});if(!r.ok)throw Error('Snapshot publish failed: '+r.status);
}
module.exports={collectQuote};
if(require.main===module)(async()=>{const quote=await collectQuote();if(process.argv.includes('--publish'))await publish(quote,process.env.GITHUB_TOKEN,process.env.GITHUB_REPOSITORY);else require('fs').writeFileSync(process.argv[2]||'tmp/meta-fx-quote.json',JSON.stringify(quote,null,2));console.log(JSON.stringify({status:'updated',...quote}))})().catch(e=>{console.error(e.message);process.exitCode=1});
