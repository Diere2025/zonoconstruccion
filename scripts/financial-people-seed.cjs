// Canonical identities confirmed by the user. Financial concepts remain distinct.
const {createHash}=require('node:crypto');
const key=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ');
function identity(name){
 const aliases=new Map([
 ['OLIVERA, MATIAS','OLIVERA, MATIAS NAHUEL'],['VEGA, MATÍAS (COMBUSTIBLE)','VEGA, MATIAS RICARDO'],
 ['Monotributo Mariano Bravo','BRAVO, MARIANO ERNESTO'],['Monotributo Tomás Ranaldi','RANALDI, LUCAS TOMAS'],
 ['Sergio Radice (Claudio Cipriano)','Sergio Radice'],['Mercedes Arce (Pachi) - Contadora','Mercedes Arce (Pachi)']
 ].map(([a,b])=>[key(a),b]));return aliases.get(key(name))||name.trim();
}
function buildSeed(source){
 const groups=new Map();
 function add(name,kind,origin,id,conceptId,carrierId,employeeId){const canonical=identity(name),normalized=key(canonical);let p=groups.get(normalized);
 if(!p){p={seed_key:createHash('sha256').update(normalized).digest('hex'),full_name:canonical,kinds:[],aliases:[],concept_ids:[],carrier_ids:[],employee_id:null,last_used_at:null,is_active:false};groups.set(normalized,p);}
 if(!p.kinds.includes(kind))p.kinds.push(kind);p.aliases.push({alias:name,source:origin,source_key:id});if(conceptId)p.concept_ids.push(conceptId);if(carrierId)p.carrier_ids.push(carrierId);if(employeeId)p.employee_id=employeeId;return p;
 }
 for(const c of source.concepts){
 let kind=null;
 if(c.category==='Sueldos'&&c.sub_category==='Sueldos y Jornales'&&(c.concept.includes(',')||/^Monotributo (Mariano Bravo|Tomás Ranaldi)$/.test(c.concept)))kind='employee';
 if(c.category==='Eventuales')kind='temporary';
 if(c.category==='Servicio de Flete')kind=['FLETE ENVIO EXPRES','FORD CARGO'].includes(c.concept)?'transport':key(c.concept)===key('VEGA, MATÍAS (COMBUSTIBLE)')?'employee':'carrier';
 if(c.category==='Honorarios'&&['Abogados Caputto y Asoc.','Abogados Caputto y Asoc. - Extraord.','ALTAC - Estudio Contable','Carlos Gallardo - Contador','Escribania Salaverry','Mercedes Arce (Pachi) - Contadora'].includes(c.concept))kind='professional';
 if(kind){const name=c.concept==='Abogados Caputto y Asoc. - Extraord.'?'Abogados Caputto y Asoc.':c.concept;const p=add(name,kind,'concept',c.id,c.id);p.aliases[p.aliases.length-1].alias=c.concept;}
 }
 for(const c of source.carriers){const special={PATO:'cleaning',GYV:'transport'};const normalized=key(c.name);const existing=groups.get(key(identity(c.name)));const kind=existing?.kinds.includes('employee')?'employee':special[normalized]||(/furgon|logistica|retiro deposito/i.test(c.name)?'transport':'carrier');add(c.name,kind,'carrier',c.id,null,c.id);}
 for(const e of source.employees)add(e.full_name,'employee','employee',e.id,null,null,e.id);
 const concepts=new Map();const employees=new Map();const aliases=new Map();
 for(const p of groups.values()){p.concept_ids.forEach(id=>concepts.set(id,p));if(p.employee_id)employees.set(p.employee_id,p);p.aliases.forEach(a=>aliases.set(key(a.alias),p));}
 for(const t of source.movements){const p=concepts.get(t.financial_concept_id)||employees.get(t.employee_id)||aliases.get(key(t.concept||''));if(p&&(!p.last_used_at||new Date(t.created_at)>new Date(p.last_used_at)))p.last_used_at=t.created_at;}
 for(const p of groups.values()){p.is_active=!!p.last_used_at&&key(p.full_name)!==key('GIANLUCA, VALLARINO');p.role=key(p.full_name)===key('Mercedes Arce (Pachi)')?'Contadora':p.kinds.includes('cleaning')?'Servicio de limpieza':'';}
 return [...groups.values()].sort((a,b)=>a.full_name.localeCompare(b.full_name));
}
async function seedPeople(db,source){const plan=buildSeed(source);
 await db.query('create temp table if not exists financial_people_seed_input(plan jsonb,created integer default 0) on commit drop;truncate financial_people_seed_input');
 await db.query('insert into financial_people_seed_input(plan) values($1)',[JSON.stringify(plan)]);
 await db.query(`do $$declare p jsonb;a jsonb;eid uuid;pid uuid;kind text[];row_value jsonb;created_count integer:=0;begin
 for p in select jsonb_array_elements(plan) from financial_people_seed_input loop
  if exists(select 1 from public.financial_people where seed_key=p->>'seed_key') then continue;end if;
  kind:=array(select jsonb_array_elements_text(p->'kinds'));eid:=nullif(p->>'employee_id','')::uuid;
  if eid is null and kind && array['employee','temporary']::text[] then
   insert into public.employees(full_name,role,is_active) values(p->>'full_name',nullif(p->>'role',''),(p->>'is_active')::boolean) returning id into eid;
  end if;
  if eid is not null then update public.employees set is_active=(p->>'is_active')::boolean where id=eid;end if;
  insert into public.financial_people(seed_key,full_name,kinds,role,is_active,employee_id,last_used_at)
   values(p->>'seed_key',p->>'full_name',kind,nullif(p->>'role',''),(p->>'is_active')::boolean,eid,(p->>'last_used_at')::timestamptz) returning id,to_jsonb(financial_people.*) into pid,row_value;
  for a in select jsonb_array_elements(p->'aliases') loop
   insert into public.financial_people_aliases(person_id,alias,source,source_key) values(pid,a->>'alias',a->>'source',a->>'source_key') on conflict(source,source_key) do nothing;
  end loop;
  insert into public.financial_people_concepts(person_id,concept_id) select pid,value::uuid from jsonb_array_elements_text(p->'concept_ids') on conflict(concept_id) do nothing;
  insert into public.financial_people_carriers(person_id,carrier_id) select pid,value::uuid from jsonb_array_elements_text(p->'carrier_ids') on conflict(carrier_id) do nothing;
  insert into public.financial_people_events(person_id,after_value,reason) values(pid,row_value,'Carga inicial autorizada: uso del 01/08/2026 al 01/10/2026 y equivalencias confirmadas');
  created_count:=created_count+1;
 end loop;update financial_people_seed_input set created=created_count;end$$`);
 const created=(await db.query('select created from financial_people_seed_input')).rows[0].created;
 return {created,total:plan.length,initially_active:plan.filter(p=>p.is_active).length};
}
async function readSeedSource(db){return {
 concepts:(await db.query('select id,concept,category,sub_category from financial_concepts order by id')).rows,
 employees:(await db.query('select id,full_name,is_active from employees')).rows,
 carriers:(await db.query('select id,name,is_active from carriers')).rows,
 movements:(await db.query("select t.concept,t.employee_id,t.financial_concept_id,t.created_at from cash_transactions t left join financial_operations o on o.id=t.operation_id where t.created_at>='2026-08-01 00:00:00-03' and t.created_at<'2026-10-02 00:00:00-03' and t.reversal_of_transaction_id is null and coalesce(o.status,'posted')='posted'")).rows
};}
module.exports={key,identity,buildSeed,seedPeople,readSeedSource};
