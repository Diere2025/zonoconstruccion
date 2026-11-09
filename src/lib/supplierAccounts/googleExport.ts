import { getGoogleAccessToken } from '@/lib/googleSheets';
import type { SupplierAccountReport } from './report';

export function parseSupplierSpreadsheetUrl(value:unknown) {
  if(typeof value!=='string')return null;
  try {
    const url=new URL(value.trim());
    return url.origin==='https://docs.google.com'
      ? url.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,120})(?:\/|$)/)?.[1]??null
      : null;
  } catch { return null; }
}

export async function exportSupplierReportToSheets(spreadsheetId:string,report:SupplierAccountReport) {
  const lines=[[report.title],[report.context],[],...report.notes,[],report.headers,...report.rows];
  const sheetId=crypto.getRandomValues(new Uint32Array(1))[0]>>>1;
  const title='CC Proveedores '+crypto.randomUUID().slice(0,8);
  const rows=lines.map(line=>({values:line.map(value=>({
    userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:value},
  }))}));
  const headerRow=lines.length-report.rows.length-1;
  const payload=JSON.stringify({requests:[
    {addSheet:{properties:{sheetId,title,gridProperties:{rowCount:Math.max(lines.length,1),columnCount:report.headers.length,frozenRowCount:headerRow+1}}}},
    {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows,fields:'userEnteredValue'}},
    {repeatCell:{range:{sheetId,startRowIndex:headerRow,endRowIndex:headerRow+1},
      cell:{userEnteredFormat:{backgroundColor:{red:0.90,green:0.94,blue:0.99},textFormat:{bold:true}}},fields:'userEnteredFormat'}},
    {autoResizeDimensions:{dimensions:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:report.headers.length}}},
  ]});
  if(new TextEncoder().encode(payload).length>8_000_000)throw new Error('El informe es demasiado grande para Google Sheets. Acotá el período o descargalo en Excel.');
  const token=await getGoogleAccessToken();
  const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:payload,
    signal:AbortSignal.timeout(45_000),
  });
  if(response.status===403||response.status===404)throw new Error('La planilla no está disponible para el ERP. Usá una planilla a la que la cuenta de Google del ERP tenga permiso de edición.');
  if(!response.ok)throw new Error('Google Sheets no pudo crear la pestaña del informe.');
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}
