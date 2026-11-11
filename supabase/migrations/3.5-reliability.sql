-- PAID HUSTLE OS 3.5. Additive migration for an existing v3.4 relational workspace.
-- No user records are deleted or rewritten. Apply after the v3.4 base setup.
begin;
-- Background writers and browser patches share the same owner lock and revision.
create or replace function public.agency_lock_revision()
returns trigger language plpgsql security definer set search_path=public as $$
declare oid uuid;
begin
 oid:=case when TG_OP='DELETE' then OLD.owner_id else NEW.owner_id end;
 insert into agency_preferences(owner_id) values(oid) on conflict(owner_id) do nothing;
 update agency_preferences set revision=revision+1,updated_at=now() where owner_id=oid;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
revoke all on function public.agency_lock_revision() from public,anon,authenticated;
do $$ declare tbl text; begin
 foreach tbl in array array['agency_clients','agency_leads','agency_projects','agency_tasks','agency_transactions','agency_operations','agency_activity'] loop
  execute format('drop trigger if exists agency_revision_lock on public.%I',tbl);
  execute format('create trigger agency_revision_lock before insert or update or delete on public.%I for each row execute function public.agency_lock_revision()',tbl);
 end loop;
end $$;

-- Browser accounts may read receipts but cannot invent, alter or delete Stripe receipts.
create or replace function public.agency_protect_stripe()
returns trigger language plpgsql security invoker set search_path=public as $$
declare oldp jsonb; newp jsonb;
begin
 if coalesce(auth.role(),'')='service_role' then
  if TG_OP='DELETE' then return OLD; end if; return NEW;
 end if;
 oldp:=case when TG_OP='INSERT' then '{}'::jsonb else OLD.payload end;
 newp:=case when TG_OP='DELETE' then '{}'::jsonb else NEW.payload end;
 if TG_TABLE_NAME='agency_transactions' then
  if coalesce(oldp->>'id','') like 'stripe:%' or coalesce(newp->>'id','') like 'stripe:%'
    or oldp->>'paymentSource'='stripe' or newp->>'paymentSource'='stripe' then
   raise exception 'Stripe receipts can only be changed by the verified payment service' using errcode='42501';
  end if;
 elsif TG_TABLE_NAME='agency_operations' then
  if TG_OP='INSERT' then
   select coalesce(payload,'{}'::jsonb) into oldp from agency_operations where owner_id=NEW.owner_id and id=NEW.id;
   oldp:=coalesce(oldp,'{}'::jsonb);
  end if;
  if oldp->>'paymentSource'='stripe' or oldp ? 'stripePaymentId' then
   if TG_OP='DELETE' or exists(select 1 from unnest(array['status','amount','currency','vatRate','paymentSource','stripePaymentId','stripeInvoiceId','clientId','projectId']) k where oldp->k is distinct from newp->k) then
    raise exception 'Verified payment fields are read-only' using errcode='42501';
   end if;
  elsif newp->>'paymentSource'='stripe' or newp ? 'stripePaymentId' then
   raise exception 'Only the payment service can confirm Stripe payments' using errcode='42501';
  end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
revoke all on function public.agency_protect_stripe() from public,anon,authenticated;
drop trigger if exists agency_payment_guard on public.agency_transactions;
create trigger agency_payment_guard before insert or update or delete on public.agency_transactions for each row execute function public.agency_protect_stripe();
drop trigger if exists agency_payment_guard on public.agency_operations;
create trigger agency_payment_guard before insert or update or delete on public.agency_operations for each row execute function public.agency_protect_stripe();

-- One transaction records the receipt, invoice status and event marker. Retried events
-- and two event types for the same Checkout cannot double count collected revenue.
create or replace function public.agency_record_stripe_payment(p_owner uuid,p_record text,p_event text,p_event_type text,p_payment text,p_amount_cents bigint,p_currency text,p_paid_at timestamptz)
returns text language plpgsql security definer set search_path=public as $$
declare invoice agency_operations%rowtype; tx jsonb; paid jsonb; expected bigint; vat numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 insert into agency_preferences(owner_id) values(p_owner) on conflict(owner_id) do nothing;
 perform 1 from agency_preferences where owner_id=p_owner for update;
 if exists(select 1 from agency_stripe_events where id=p_event) then return 'Already processed'; end if;
 select * into invoice from agency_operations where owner_id=p_owner and id=p_record for update;
 if not found or invoice.category<>'invoices' then raise exception 'Invoice not found'; end if;
 vat:=coalesce((invoice.payload->>'vatRate')::numeric,0);
 if vat<0 or vat>100 then raise exception 'Invalid VAT'; end if;
 expected:=round((invoice.payload->>'amount')::numeric*(1+vat/100)*100);
 if expected is null or p_amount_cents<=0 or expected<>p_amount_cents or lower(coalesce(invoice.payload->>'currency','DKK'))<>lower(p_currency) then raise exception 'Amount/currency mismatch'; end if;
 if p_event is null or p_payment is null or length(p_payment)>180 then raise exception 'Invalid payment identifiers'; end if;
 tx:=jsonb_build_object('id','stripe:'||p_payment,'description','Stripe payment: '||(invoice.payload->>'title'),'clientId',coalesce(invoice.client_id,''),'projectId',coalesce(invoice.project_id,''),'invoiceId',p_record,'paymentSource','stripe','stripePaymentId',p_payment,'amount',p_amount_cents::numeric/100,'currency',upper(p_currency),'kind','Income','status','Paid','date',to_char(p_paid_at at time zone 'Europe/Copenhagen','YYYY-MM-DD'),'notes','Verified Stripe payment '||p_payment,'createdAt',p_paid_at);
 insert into agency_transactions(owner_id,id,client_id,project_id,amount,kind,payload)
 values(p_owner,tx->>'id',invoice.client_id,invoice.project_id,p_amount_cents::numeric/100,'Income',tx) on conflict(owner_id,id) do nothing;
 paid:=invoice.payload||jsonb_build_object('status','Paid','paymentSource','stripe','stripePaymentId',p_payment,'updatedAt',now());
 update agency_operations set payload=paid,updated_at=now() where owner_id=p_owner and id=p_record;
 insert into agency_stripe_events(id,owner_id,record_id,event_type) values(p_event,p_owner,p_record,p_event_type);
 return 'Payment reconciled';
end $$;
revoke all on function public.agency_record_stripe_payment(uuid,text,text,text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.agency_record_stripe_payment(uuid,text,text,text,text,bigint,text,timestamptz) to service_role;
-- Keep the existing bucket private, without deleting or moving any objects.
update storage.buckets set public=false where id='agency-documents';

-- Consume a public token, store its receipt, and update the linked record together.
-- A failed request rolls back token consumption, so the client can safely retry.
create or replace function public.agency_submit_public_response(p_token_hash text,p_expected_record jsonb,p_response jsonb,p_operation jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare link agency_public_links%rowtype; record agency_operations%rowtype; accepted text; changed jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into link from agency_public_links where token_hash=p_token_hash;
 if not found then raise exception 'Link unavailable'; end if;
 insert into agency_preferences(owner_id) values(link.owner_id) on conflict(owner_id) do nothing;
 perform 1 from agency_preferences where owner_id=link.owner_id for update;
 select * into link from agency_public_links where token_hash=p_token_hash for update;
 if link.used_at is not null or link.expires_at<=now() then raise exception 'Link already used or expired'; end if;
 select * into record from agency_operations where owner_id=link.owner_id and id=link.record_id for update;
 if not found or record.payload is distinct from p_expected_record then raise exception 'Record changed; request a new link'; end if;
 if link.kind='approval' and (p_response->>'acknowledged'<>'true' or p_response->>'reviewHash' is distinct from link.review_hash) then raise exception 'Review acknowledgement required'; end if;
 insert into agency_public_submissions(owner_id,link_id,kind,payload) values(link.owner_id,link.id,link.kind,p_response);
 insert into agency_operations(owner_id,id,client_id,project_id,category,title,due_date,payload)
 values(link.owner_id,p_operation->>'id',record.client_id,record.project_id,p_operation->>'category',p_operation->>'title',nullif(p_operation->>'dueDate','')::date,p_operation);
 if link.kind='approval' and p_response->>'decision'='approved' then
  accepted:=case record.category when 'proposals' then 'Accepted' when 'qa' then 'Approved to launch' when 'handovers' then 'Handed over' when 'reports' then 'Reviewed' when 'documents' then 'Approved' end;
 elsif link.kind='intake' then accepted:='Received';
 elsif link.kind='booking' then accepted:='Requested'; end if;
 if accepted is not null then
  changed:=record.payload||jsonb_build_object('status',accepted,'updatedAt',now());
  if link.kind='booking' then changed:=changed||jsonb_build_object('dueDate',p_response->>'date'); end if;
  update agency_operations set payload=changed,due_date=nullif(changed->>'dueDate','')::date,updated_at=now() where owner_id=link.owner_id and id=link.record_id;
 end if;
 update agency_public_links set used_at=now() where id=link.id;
 return 'Response recorded';
end $$;
revoke all on function public.agency_submit_public_response(text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.agency_submit_public_response(text,jsonb,jsonb,jsonb) to service_role;

commit;
