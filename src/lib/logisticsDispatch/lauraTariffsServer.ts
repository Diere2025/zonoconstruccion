import {fetchSpreadsheetValues} from '@/lib/googleSheets';
import {resolveCarrierIdentity,carrierIdentityKey} from '@/lib/carrierIdentity';
import {rateAmount} from './tariffs';
import {planningCatalog} from './planningServer';
export async function previewLauraTariffs(db:any){
 const spreadsheet='1l_PASp0hMX2ECGcAs5SXbPNstsrzAXHrxE0UBcTiAAU',range="'BD Fleteros'!A3:H100";
 const [values,catalog]=await Promise.all([fetchSpreadsheetValues(spreadsheet,range),planningCatalog(db)]);
 const rows=values.map((v,row)=>({sourceRow:row+3,name:String(v[0]||'').trim(),group:String(v[1]||'').trim(),baseDay:rateAmount(v[3]),hour:rateAmount(v[4]),extraKm:rateAmount(v[5]),trailer:rateAmount(v[6]),withoutCompanionAdjustment:rateAmount(v[7])})).filter(r=>r.name);
 return rows.map(r=>{const companyKey=/^(gyv|gv)$/i.test(r.group)?'gyv':null,match=resolveCarrierIdentity(r.name,catalog),duplicate=rows.filter(x=>carrierIdentityKey(x.name)===carrierIdentityKey(r.name)).length>1;return {...r,carrierId:match.carrier?.id||null,companyKey,duplicate,requiresEffectiveDate:true,source:spreadsheet+':BD Fleteros:'+r.sourceRow};});
}
