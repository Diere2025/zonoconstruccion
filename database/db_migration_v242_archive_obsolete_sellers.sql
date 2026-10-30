begin;

alter table public.sellers add column if not exists archived_at timestamptz;
comment on column public.sellers.archived_at is 'Archived profiles are excluded from user management; historical business references remain intact.';

do $$
declare matched integer;
begin
  select count(*) into matched from public.sellers s
  join (values
    ('ab8cef0f-7d13-4648-9b22-220d568f21ba'::uuid, 'beln.romero@zono.com.ar'),
    ('26b64721-4c76-4d22-88e6-1ced936d6364'::uuid, 'brian.gomez@historico.zono.com.ar'),
    ('bfa08cde-0997-47e9-a6b1-0afa32bf7936'::uuid, 'carlos.carabajal@historico.zono.com.ar'),
    ('8bed0c4b-2fd6-408b-af45-3d61dbfc56b2'::uuid, 'gabriela.fathala@historico.zono.com.ar'),
    ('f83f2bb3-d9d5-4c8c-9c9a-acc6d0dc6d9c'::uuid, 'mariano.bravo@zono.com.ar'),
    ('ec53abc0-ff5a-4a16-838f-acd0f3b58077'::uuid, 'nadia.matto@historico.zono.com.ar'),
    ('ff850e14-d49d-4f39-8d63-ddfead89d3e9'::uuid, 'omar.miranda@historico.zono.com.ar'),
    ('c94ca6be-eff6-4d99-b6d2-8ccfc6e4bfe3'::uuid, 'soledad.camara@historico.zono.com.ar')
  ) expected(id,email) on s.id = expected.id and lower(s.email) = expected.email
  where s.is_active = false;
  if matched <> 8 then raise exception 'Los ocho perfiles autorizados deben existir y estar inactivos.'; end if;

  update public.sellers set archived_at = coalesce(archived_at, now())
  where id = any(array[
    'ab8cef0f-7d13-4648-9b22-220d568f21ba', '26b64721-4c76-4d22-88e6-1ced936d6364',
    'bfa08cde-0997-47e9-a6b1-0afa32bf7936', '8bed0c4b-2fd6-408b-af45-3d61dbfc56b2',
    'f83f2bb3-d9d5-4c8c-9c9a-acc6d0dc6d9c', 'ec53abc0-ff5a-4a16-838f-acd0f3b58077',
    'ff850e14-d49d-4f39-8d63-ddfead89d3e9', 'c94ca6be-eff6-4d99-b6d2-8ccfc6e4bfe3'
  ]::uuid[]);
end;
$$;

notify pgrst, 'reload schema';
commit;
