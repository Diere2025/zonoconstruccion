begin;
-- Preserve the installed financial core and extend only supplier payments.
do $migration$
declare definition text; anchor text; guard text;
begin
  select pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure) into definition;
  if position('Compra eventual incompatible' in definition)>0 then return; end if;
  anchor := 'if jsonb_typeof(p_payload->''detail'') is distinct from ''object'' then raise exception ''Detalle inválido.''; end if;';
  guard := $guard$
   if p_payload#>>'{detail,supplier_kind}' is not null and
     (v_type<>'supplier_payment' or p_payload#>>'{detail,supplier_kind}' not in ('registered','eventual')) then
     raise exception 'Variante de proveedor inválida.';
   end if;
   if p_payload#>>'{detail,supplier_kind}'='eventual' then
     if v_supplier is not null or jsonb_typeof(coalesce(p_payload->'allocations','[]'))<>'array'
       or jsonb_array_length(coalesce(p_payload->'allocations','[]'))>0
       or length(coalesce(p_payload#>>'{detail,supplier_name}',''))>240 then
       raise exception 'Compra eventual incompatible con proveedor registrado o imputaciones.';
     end if;
   end if;
  $guard$;
  if position(anchor in definition)=0 or
    (length(definition)-length(replace(definition,'if v_type=''supplier_payment'' then','')))/length('if v_type=''supplier_payment'' then')<>2 then
    raise exception 'El núcleo financiero cambió; revisar antes de activar la compra eventual.';
  end if;
  definition := replace(definition,anchor,anchor||guard);
  definition := replace(definition,'if v_type=''supplier_payment'' then',
    'if v_type=''supplier_payment'' and coalesce(p_payload#>>''{detail,supplier_kind}'',''registered'')<>''eventual'' then');
  execute definition;
end $migration$;
commit;
