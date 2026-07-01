-- "Shop the look": product-link edits carry a Buy URL + listing metadata.
alter table public.restyle_edits add column if not exists buy_url text;
alter table public.restyle_edits add column if not exists product_title text;
alter table public.restyle_edits add column if not exists product_price text;
