-- Supabase table schema for stored scraper products

create table if not exists products (
  id text primary key,
  title text not null,
  store text not null,
  url text not null,
  image text,
  price numeric,
  original_price numeric,
  rating numeric,
  review_count integer,
  in_stock boolean default true,
  store_color text,
  source_query text,
  scraped_at timestamptz not null,
  created_at timestamptz default now()
);

alter table products enable row level security;

create policy "Public users can select products"
  on products for select
  using (auth.role() = 'anon');

create policy "Authenticated users can select products"
  on products for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert products"
  on products for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update products"
  on products for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can delete products"
  on products for delete
  using (auth.role() = 'authenticated');
