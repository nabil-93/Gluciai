-- Moroccan Nutrition Database — server-side mirror of
-- src/data/moroccanFoods.ts. Searchable like USDA, first stop of the
-- nutrition provider chain. Read-only for clients.

create table if not exists public.moroccan_foods (
  id text primary key,
  name_en text not null,
  name_fr text not null,
  name_ar text not null,
  category text not null check (category in
    ('breakfast','soup','salad','main','seafood','snack','dessert','drink')),
  serving_size text not null,
  serving_grams numeric not null,
  calories numeric not null,
  carbs numeric not null,
  sugar numeric not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  fiber numeric not null default 0,
  sodium numeric not null default 0,
  glycemic_index numeric,
  description text,
  image_url text,
  aliases text[] default '{}',
  created_at timestamptz not null default now()
);

-- Anyone authenticated can read; only service role can write.
alter table public.moroccan_foods enable row level security;

create policy "moroccan_foods_read" on public.moroccan_foods
  for select using (true);

-- Fast multilingual search
create index if not exists moroccan_foods_name_en_idx
  on public.moroccan_foods using gin (to_tsvector('english', name_en));
create index if not exists moroccan_foods_name_fr_idx
  on public.moroccan_foods using gin (to_tsvector('french', name_fr));

-- Seed (values per serving)
insert into public.moroccan_foods
  (id, name_en, name_fr, name_ar, category, serving_size, serving_grams,
   calories, carbs, sugar, protein, fat, fiber, sodium, glycemic_index, aliases)
values
  ('msemen','Msemen','Msemen','المسمن','breakfast','1 pièce (100 g)',100,240,30,2,5,11,1,210,65,'{msemmen,rghaif}'),
  ('baghrir','Baghrir with honey','Baghrir au miel','البغرير بالعسل','breakfast','1 pièce + miel (80 g)',80,180,35,12,4,3,1,120,70,'{beghrir}'),
  ('harcha','Harcha','Harcha','الحرشة','breakfast','1 pièce (90 g)',90,260,34,3,6,11,2,240,65,'{harsha}'),
  ('khobz','Moroccan bread (khobz)','Pain marocain (khobz)','الخبز المغربي','breakfast','¼ de pain (80 g)',80,160,32,1,5,1,2,300,70,'{pain,bread}'),
  ('butter','Butter','Beurre','الزبدة','breakfast','1 c. à soupe (14 g)',14,100,0,0,0,11,0,90,0,'{zebda}'),
  ('honey','Honey','Miel','العسل','breakfast','1 c. à soupe (21 g)',21,64,17,17,0,0,0,1,58,'{aassal}'),
  ('olive-oil','Olive oil','Huile d''olive','زيت الزيتون','breakfast','1 c. à soupe (14 g)',14,119,0,0,0,14,0,0,0,'{zit}'),
  ('harira','Harira soup','Harira','الحريرة','soup','1 bol (300 ml)',300,220,32,5,9,5,5,780,55,'{hrira}'),
  ('bissara','Bissara (fava bean soup)','Bissara','البيصارة','soup','1 bol (300 ml)',300,250,35,3,14,6,9,620,45,'{bessara}'),
  ('salade-marocaine','Moroccan salad','Salade marocaine','الشلاضة المغربية','salad','1 assiette (200 g)',200,90,10,6,2,5,3,320,25,'{chlada}'),
  ('zaalouk','Zaalouk (eggplant salad)','Zaalouk','الزعلوك','salad','1 portion (200 g)',200,120,12,6,3,7,5,380,30,'{}'),
  ('taktouka','Taktouka','Taktouka','التكتوكة','salad','1 portion (200 g)',200,110,11,7,2,7,4,360,30,'{}'),
  ('couscous','Couscous with vegetables and meat','Couscous aux légumes et viande','كسكس بالخضر واللحم','main','1 assiette (400 g)',400,550,75,10,25,15,8,720,65,'{kesksou,seksu}'),
  ('couscous-poulet','Chicken couscous','Couscous au poulet','كسكس بالدجاج','main','1 assiette (400 g)',400,520,70,9,30,12,7,700,65,'{}'),
  ('couscous-boeuf','Beef couscous','Couscous au bœuf','كسكس باللحم البقري','main','1 assiette (400 g)',400,580,72,9,32,18,7,740,65,'{}'),
  ('couscous-legumes','Vegetable couscous','Couscous aux légumes','كسكس بالخضر','main','1 assiette (380 g)',380,430,72,9,12,9,8,640,65,'{}'),
  ('couscous-7-legumes','Seven vegetable couscous','Couscous aux sept légumes','كسكس بسبع خضاري','main','1 assiette (400 g)',400,460,74,11,14,10,10,660,62,'{}'),
  ('tajine-poulet-olives','Chicken tagine with olives','Tajine de poulet aux olives','طاجين الدجاج بالزيتون','main','1 assiette (350 g)',350,380,18,5,35,18,4,850,40,'{tajine poulet}'),
  ('tajine-boeuf','Beef tagine','Tajine de bœuf','طاجين اللحم','main','1 assiette (350 g)',350,450,20,8,38,24,4,800,40,'{tajine viande}'),
  ('tajine-kefta','Kefta tagine with eggs','Tajine de kefta aux œufs','طاجين الكفتة بالبيض','main','1 assiette (350 g)',350,480,12,6,34,32,3,880,30,'{kefta oeuf}'),
  ('tajine-poisson','Fish tagine','Tajine de poisson','طاجين السمك','main','1 assiette (350 g)',350,340,16,5,36,14,4,760,35,'{tajine hout}'),
  ('rfissa','Rfissa','Rfissa','الرفيسة','main','1 assiette (400 g)',400,620,65,6,32,24,5,820,60,'{}'),
  ('seffa','Seffa medfouna','Seffa medfouna','السفة المدفونة','main','1 assiette (350 g)',350,600,80,18,20,18,4,480,65,'{}'),
  ('trid','Trid','Trid','التريد','main','1 assiette (380 g)',380,560,55,5,30,24,4,760,60,'{}'),
  ('tanjia','Tanjia marrakchia','Tanjia marrakchia','الطنجية المراكشية','main','1 portion (300 g)',300,450,8,2,40,28,1,720,25,'{tangia}'),
  ('adass','Lentils (Moroccan style)','Lentilles à la marocaine','العدس','main','1 assiette (300 g)',300,300,40,4,16,6,10,560,35,'{lentilles,lentils}'),
  ('loubia','Loubia (white bean stew)','Loubia (haricots blancs)','اللوبيا','main','1 assiette (300 g)',300,320,45,5,15,8,12,640,40,'{haricots}'),
  ('hommos','Chickpeas (stewed)','Pois chiches mijotés','الحمص','main','1 assiette (300 g)',300,340,46,6,16,10,11,600,35,'{pois chiche,chickpea}'),
  ('sardines','Grilled sardines','Sardines grillées','السردين المشوي','seafood','4 sardines (200 g)',200,320,2,0,38,18,0,520,5,'{sardine}'),
  ('poisson-grille','Grilled fish','Poisson grillé','السمك المشوي','seafood','1 portion (250 g)',250,300,1,0,42,14,0,420,5,'{hout,fish}'),
  ('dattes','Dates','Dattes','التمر','snack','3 dattes (60 g)',60,200,54,48,1,0,4,1,55,'{tmar,dates}'),
  ('olives','Olives','Olives','الزيتون','snack','10 olives (40 g)',40,60,2,0,0,6,1,620,0,'{zitoun}'),
  ('briouat','Briouat (savory)','Briouate salée','البريوات','snack','2 pièces (80 g)',80,260,22,2,10,15,1,380,55,'{briouate}'),
  ('chebakia','Chebakia','Chebakia','الشباكية','dessert','1 pièce (40 g)',40,190,22,14,3,10,1,45,70,'{mkharka}'),
  ('sellou','Sellou','Sellou','السلو','dessert','2 c. à soupe (50 g)',50,220,18,10,6,14,3,20,55,'{sfouf,zmita}'),
  ('kaab-ghzal','Kaab el ghzal (gazelle horns)','Cornes de gazelle','كعب الغزال','dessert','1 pièce (30 g)',30,120,14,8,3,6,1,15,60,'{corne de gazelle}'),
  ('ghriba','Ghriba','Ghriba','الغريبة','dessert','1 pièce (35 g)',35,160,18,10,3,9,1,40,65,'{}'),
  ('fekkas','Fekkas','Fekkas','الفقاص','dessert','3 pièces (45 g)',45,190,28,12,4,7,1,60,65,'{}'),
  ('the-menthe','Mint tea (sweetened)','Thé à la menthe sucré','أتاي بالنعناع','drink','1 verre (150 ml)',150,60,15,15,0,0,0,2,65,'{atay}'),
  ('jus-orange','Fresh orange juice','Jus d''orange frais','عصير البرتقال','drink','1 verre (250 ml)',250,110,25,22,1,0,0,2,50,'{orange juice}'),
  ('jus-avocat','Avocado juice','Jus d''avocat','عصير الأفوكادو','drink','1 verre (250 ml)',250,250,28,24,4,13,4,30,45,'{avocado}')
on conflict (id) do update set
  name_en = excluded.name_en,
  name_fr = excluded.name_fr,
  name_ar = excluded.name_ar,
  category = excluded.category,
  serving_size = excluded.serving_size,
  serving_grams = excluded.serving_grams,
  calories = excluded.calories,
  carbs = excluded.carbs,
  sugar = excluded.sugar,
  protein = excluded.protein,
  fat = excluded.fat,
  fiber = excluded.fiber,
  sodium = excluded.sodium,
  glycemic_index = excluded.glycemic_index,
  aliases = excluded.aliases;
