-- 009_item_price.sql
-- Adds a structured price level (1–4) to items so the Restaurants deck can offer
-- a price filter. Populated by the get-restaurants edge function from the Places
-- `priceLevel` enum (the same source as the $/$$ subtitle label). Nullable: seed
-- rows and places with no price stay null and always pass the filter.
-- Service-role SELECT/INSERT/UPDATE on items is already covered by 007.

alter table items add column if not exists price_level smallint;
