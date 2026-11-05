-- The requester may resolve or cancel their own incident while it is New.
-- Keep the locked core's version, idempotency, audit and notification checks.
do $migration$
declare source text; anchor text; replacement text;
begin
 perform pg_advisory_xact_lock(106106);
 source:=pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure);
 if strpos(source, 'elsif p_command=''close_requester'' then') > 0 then return; end if;

 anchor:='and not manager and not (t.workflow=''shipping'' and p_command=''cancel'' and creator) then';
 replacement:='and not manager and not (t.workflow=''shipping'' and p_command=''cancel'' and creator) and not (t.workflow=''incident'' and t.status=''new'' and creator and p_command in (''cancel'',''close_requester'')) then';
 if strpos(source,anchor)=0 then raise exception 'Unexpected support permission definition'; end if;
 source:=replace(source,anchor,replacement);

 anchor:='if p_command in (''cancel'',''close_admin'',''restore'') and not administrator and not (t.workflow=''shipping'' and ((p_command=''cancel'' and (manager or creator)) or (p_command=''close_admin'' and manager))) then';
 replacement:='if p_command in (''cancel'',''close_admin'',''restore'') and not administrator and not (t.workflow=''shipping'' and ((p_command=''cancel'' and (manager or creator)) or (p_command=''close_admin'' and manager))) and not (p_command=''cancel'' and t.workflow=''incident'' and t.status=''new'' and creator) then';
 if strpos(source,anchor)=0 then raise exception 'Unexpected support cancellation definition'; end if;
 source:=replace(source,anchor,replacement);

 anchor:='     elsif p_command in (''withdraw'',''cancel'',''close_admin'',''reopen'',''restore'') then';
 replacement:=$patch$     elsif p_command='close_requester' then
       if not creator then raise exception 'SUPPORT_FORBIDDEN'; end if;
       if t.workflow<>'incident' or t.status<>'new' then raise exception 'SUPPORT_INVALID'; end if;
       if body='' then raise exception 'SUPPORT_BODY_REQUIRED'; end if;
       t.status:='closed';t.closed_by:=u;t.closure_kind:='validated';t.closed_at:=now();
     elsif p_command in ('withdraw','cancel','close_admin','reopen','restore') then$patch$;
 if strpos(source,anchor)=0 then raise exception 'Unexpected support closure definition'; end if;
 source:=replace(source,anchor,replacement);
 execute source;
end $migration$;
revoke all on function public.support_command_core(text,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
