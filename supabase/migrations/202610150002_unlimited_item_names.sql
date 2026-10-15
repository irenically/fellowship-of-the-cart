-- Remove the former 120-character limit, preserving non-blank trimmed names.
begin;
alter table public.shopping_items drop constraint shopping_items_name_check;
alter table public.shopping_items add constraint shopping_items_name_check
  check (char_length(name) >= 1 and name = btrim(name) and name ~ '[^[:space:]]');
commit;
