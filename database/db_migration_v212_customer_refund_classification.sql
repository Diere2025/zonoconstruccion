-- Add outgoing refunds without changing classifications of historical income.
begin;
select pg_advisory_xact_lock(hashtextextended('customer_refund_classification_v212',0));
do $$
declare v_category uuid; v_concept uuid; legacy_id uuid; label text;
begin
 insert into public.financial_classification_items(kind,name)
 values('category','Recaudación') on conflict do nothing;
 select id into strict v_category from public.financial_classification_items
 where kind='category' and lower(trim(name))=lower('Recaudación');

 foreach label in array array['Devolución de cobro','Devolución parcial de cobro'] loop
  select id into legacy_id from public.financial_concepts
  where concept=label and category='Recaudación' and movement_type='Egreso'
  order by is_active desc,id limit 1;
  if legacy_id is null then
   insert into public.financial_concepts(concept,category,sub_category,movement_type,efe_category)
   values(label,'Recaudación','Venta - MercadoPago','Egreso','Ventas Minoristas') returning id into legacy_id;
  end if;
  insert into public.financial_concept_operation_types(financial_concept_id,operation_type)
  values(legacy_id,'general') on conflict do nothing;

  insert into public.financial_classification_items(kind,name,category_id)
  values('concept',label,v_category) on conflict do nothing;
  select i.id into strict v_concept from public.financial_classification_items i
  where i.kind='concept' and i.category_id=v_category and lower(trim(i.name))=lower(label);
  insert into public.financial_classification_items(kind,name,concept_id,legacy_concept_id,movement_type,efe_category,origin)
  values('preset',label,v_concept,legacy_id,'Egreso','Ventas Minoristas','customer_refund')
  on conflict(legacy_concept_id) do nothing;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
