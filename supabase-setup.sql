begin;
create table public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1 (
 id bigint generated always as identity primary key,
 verse smallint not null check (verse between 14 and 17),
 start_word smallint not null check (start_word >= 0),
 end_word smallint not null check (end_word >= start_word),
 color smallint not null check (color in (1,2)),
 created_at timestamptz not null default now(),
 unique (verse, start_word, end_word)
);
create table public.vivienne_haftorah_isaiah_49_14_17_group_recordings_v1 (
 highlight_group_id bigint primary key references public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1(id),
 object_path text not null check (object_path ~ '^groups/[0-9]+[.](webm|ogg|mp4)$'),
 mime_type text not null check (mime_type in ('audio/webm','audio/ogg','audio/mp4')),
 byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
 updated_at timestamptz not null default now()
);
alter table public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1 enable row level security;
alter table public.vivienne_haftorah_isaiah_49_14_17_group_recordings_v1 enable row level security;
revoke all on public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1, public.vivienne_haftorah_isaiah_49_14_17_group_recordings_v1 from anon, authenticated;
grant select on public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1 to anon, authenticated;
grant select, insert, update on public.vivienne_haftorah_isaiah_49_14_17_group_recordings_v1 to anon, authenticated;
create policy vivienne_haftorah_groups_read on public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1 for select to anon, authenticated using (true);
create policy vivienne_haftorah_recordings_read on public.vivienne_haftorah_isaiah_49_14_17_group_recordings_v1 for select to anon, authenticated using (true);
create policy vivienne_haftorah_recordings_insert on public.vivienne_haftorah_isaiah_49_14_17_group_recordings_v1 for insert to anon, authenticated with check (object_path ~ ('^groups/' || highlight_group_id || '[.](webm|ogg|mp4)$'));
create policy vivienne_haftorah_recordings_update on public.vivienne_haftorah_isaiah_49_14_17_group_recordings_v1 for update to anon, authenticated using (true) with check (object_path ~ ('^groups/' || highlight_group_id || '[.](webm|ogg|mp4)$'));
insert into public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1(verse,start_word,end_word,color) values
(14,0,3,1),
(14,4,5,2),
(15,0,2,1),
(15,3,4,2),
(15,5,6,1),
(15,7,9,2),
(16,0,2,1),
(16,3,5,2),
(17,0,1,1),
(17,2,5,2);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('vivienne-haftorah-isaiah-49-14-17-group-recordings-v1','vivienne-haftorah-isaiah-49-14-17-group-recordings-v1',true,52428800,array['audio/webm','audio/ogg','audio/mp4']);
create policy vivienne_haftorah_14_17_audio_select on storage.objects for select to anon, authenticated using (bucket_id = 'vivienne-haftorah-isaiah-49-14-17-group-recordings-v1');
create policy vivienne_haftorah_14_17_audio_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'vivienne-haftorah-isaiah-49-14-17-group-recordings-v1' and exists (select 1 from public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1 g where name in ('groups/' || g.id || '.webm','groups/' || g.id || '.ogg','groups/' || g.id || '.mp4')));
create policy vivienne_haftorah_14_17_audio_update on storage.objects for update to anon, authenticated using (bucket_id = 'vivienne-haftorah-isaiah-49-14-17-group-recordings-v1') with check (bucket_id = 'vivienne-haftorah-isaiah-49-14-17-group-recordings-v1' and exists (select 1 from public.vivienne_haftorah_isaiah_49_14_17_highlight_groups_v1 g where name in ('groups/' || g.id || '.webm','groups/' || g.id || '.ogg','groups/' || g.id || '.mp4')));
commit;
