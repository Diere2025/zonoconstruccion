export type DateFieldType='date'|'datetime-local'|'month';
export function validCalendarDate(value:string){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!m)return false;const y=+m[1],mo=+m[2],d=+m[3],date=new Date(Date.UTC(y,mo-1,d));return y>=1900&&y<=9999&&date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d;}
export function displayDateField(value:string,type:DateFieldType='date'){if(type==='month'){const m=/^(\d{4})-(\d{2})$/.exec(value);return m&&+m[2]>=1&&+m[2]<=12?`${m[2]}/${m[1]}`:'';}const day=value.slice(0,10);if(!validCalendarDate(day))return '';const display=`${day.slice(8,10)}/${day.slice(5,7)}/${day.slice(0,4)}`;return type==='datetime-local'?display+' '+value.slice(11,16):display;}
export function parseDateField(value:string,type:DateFieldType='date'):string|null{if(type==='month'){const m=/^(\d{2})\/(\d{4})$/.exec(value);return m&&+m[1]>=1&&+m[1]<=12&&+m[2]>=1900?`${m[2]}-${m[1]}`:null;}const m=/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/.exec(value);if(!m)return null;const day=`${m[3]}-${m[2]}-${m[1]}`;if(!validCalendarDate(day))return null;if(type==='date')return m[4]?null:day;return m[4]&&+m[4]<=23&&+m[5]<=59?`${day}T${m[4]}:${m[5]}`:null;}
export function formatDateDigits(value:string,type:DateFieldType){const d=value.replace(/\D/g,'').slice(0,type==='month'?6:type==='datetime-local'?12:8);if(type==='month')return d.slice(0,2)+(d.length>2?'/'+d.slice(2):'');return d.slice(0,2)+(d.length>2?'/'+d.slice(2,4):'')+(d.length>4?'/'+d.slice(4,8):'')+(d.length>8?' '+d.slice(8,10):'')+(d.length>10?':'+d.slice(10,12):'');}

export function displayErpInstant(value:string){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const part=(name:string)=>parts.find(p=>p.type===name)?.value||'';
 return part('day')+'/'+part('month')+'/'+part('year')+' '+part('hour')+':'+part('minute');
}
