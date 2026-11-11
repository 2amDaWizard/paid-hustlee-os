-- Optional private owner-scoped document bucket.
-- Run only in the PAID-HUSTLE-TEST Supabase project until validated.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('agency-documents','agency-documents',false,10485760,
 array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- All operations are restricted to paths prefixed with the authenticated user's UUID.
-- No anonymous upload, access, listing, or deletion is granted.
do $$
begin
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agency_docs_owner_read') then
   create policy agency_docs_owner_read on storage.objects for select to authenticated
     using (bucket_id='agency-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agency_docs_owner_insert') then
   create policy agency_docs_owner_insert on storage.objects for insert to authenticated
     with check (bucket_id='agency-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agency_docs_owner_delete') then
   create policy agency_docs_owner_delete on storage.objects for delete to authenticated
     using (bucket_id='agency-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
end $$;
