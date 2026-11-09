import type { SupplierAccountReport } from './report';

export async function downloadSupplierReport(report:SupplierAccountReport,format:'excel'|'pdf') {
  const filename='CC-Proveedores';
  if(format==='excel'){
    const XLSX=await import('xlsx');
    const rows=[[report.title],[report.context],[],...report.notes,[],report.headers,...report.rows];
    const sheet=XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols']=report.headers.map((title,i)=>({wch:Math.min(55,Math.max(title.length+2,
      ...report.rows.slice(0,200).map(row=>String(row[i]??'').length+2),14))}));
    const headerRow=rows.length-report.rows.length-1;
    sheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:headerRow,c:0},e:{r:rows.length-1,c:report.headers.length-1}})};
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,sheet,'CC Proveedores');
    XLSX.writeFile(book,filename+'.xlsx');
    return;
  }
  const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
  const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const number=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const cell=(value:string|number)=>typeof value==='number'?number.format(value):value;
  pdf.setFontSize(16);
  const title=pdf.splitTextToSize(report.title,270);
  pdf.text(title,12,15);
  pdf.setFontSize(10);
  const context=pdf.splitTextToSize(report.context,270);
  const contextY=15+title.length*6;
  pdf.text(context,12,contextY);
  const options={margin:{left:12,right:12},styles:{fontSize:8,overflow:'linebreak' as const},headStyles:{fillColor:[30,64,110] as [number,number,number]}};
  autoTable(pdf,{...options,startY:contextY+context.length*4,body:report.notes.map(row=>row.map(cell))});
  autoTable(pdf,{...options,head:[report.headers],body:report.rows.map(row=>row.map(cell)),showHead:'everyPage'});
  pdf.save(filename+'.pdf');
}
