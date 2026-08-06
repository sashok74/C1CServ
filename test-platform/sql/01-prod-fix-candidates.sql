/* ============================================================================
   КАНДИДАТЫ ПРОД-ФИКСОВ (обкатка на тестовом клоне erp_base_api_c1).
   Применяются reset-плейбуком ПОСЛЕ erp-api-c1-gateway-shim.sql.
   В прод (erp_base_api) переносить только решением владельца после обкатки.

   Ф1. C1_LINKS_S: входы/выходы KOD_IZD/ART_IZD были varchar(10) при домене
       колонок char(15) — коды 1С длиной 11 символов валили процедуру
       ("string right truncation"). Дефект есть и в проде.
   Ф2. EXP_ZAKAZ_IU: при КАЖДОМ вызове создавала новый DOC_HEADER (op=7) и
       строку C1_ZTOD — повторный экспорт заказа падал в EXP_ZAKAZ_ITEMS_IU
       ("multiple rows in singleton select"); 11 исторических дублей C1_ZTOD
       в проде — следы. Теперь документ создаётся только при отсутствии связи.
   Ф3. EXP_NOM_IU: "update or insert ... matching (kod_izd, art_izd)" при
       art_izd IS NULL не матчится (NULL != NULL) — каждый импорт плодил
       дубли в C1_NOM и C1_LINKS. Заменено NULL-безопасным upsert.
   Ф4. C1_ZAKAZ_NOM_I_IU: пара связей «(код, артикул карточки)» и «(код,
       артикул строки заказа)» — РАБОЧИЙ механизм (C1_ZAKAZ_I_S резолвит
       NOM_ID строгим равенством по артикулу строки), удалять её нельзя.
       Настоящий дефект — тот же NULL-небезопасный matching: одинаковые пары
       плодились при повторных вызовах. Заменён NULL-безопасным upsert +
       guard от связи с NULL-кодом.
   ============================================================================ */
SET TERM ^ ;

/* -------- Ф1: C1_LINKS_S — размеры полей до домена колонок -------- */
CREATE OR ALTER PROCEDURE C1_LINKS_S (
  P_KOD_IZD TYPE OF COLUMN C1_LINKS.KOD_IZD,
  P_ART_IZD TYPE OF COLUMN C1_LINKS.ART_IZD,
  P_NOM_ID INTEGER,
  P_OBJ_ID INTEGER)
RETURNS (
  KOD_IZD TYPE OF COLUMN C1_LINKS.KOD_IZD,
  ART_IZD TYPE OF COLUMN C1_LINKS.ART_IZD,
  NOM_ID INTEGER,
  OBJ_ID INTEGER,
  USER_ID SMALLINT,
  USER_NAME VARCHAR(128),
  DATE_MOD TIMESTAMP)
AS
begin
  if (p_kod_izd is not NULL or p_art_izd is not NULL) then
  begin
    for select l.KOD_IZD, l.ART_IZD, l.NOM_ID, l.OBJ_ID, l.user_id, u.user_name, l.date_mod
        from c1_links l
        left join sys_users u on (l.user_id = u.user_id)
        where
        (upper(KOD_IZD) = upper(:p_KOD_IZD) and :p_KOD_IZD is NOT NULL and
          ((upper(ART_IZD) = upper(:p_ART_IZD)) or (art_izd is NULL and :p_art_izd is NULL) )
        ) or
        (nom_id = :p_nom_id) or
        (obj_id = :p_obj_id)
        into :KOD_IZD, :ART_IZD, :NOM_ID, :OBJ_ID, :user_id, :USER_NAME, :date_mod
    do begin
      suspend;
    end
  end

  if (p_nom_id is not NULL or p_obj_id is not NULL) then
  begin
    for select l.KOD_IZD, l.ART_IZD, l.NOM_ID, l.OBJ_ID, l.user_id, u.user_name, l.date_mod
        from c1_links l
        left join sys_users u on (l.user_id = u.user_id)
        where
        (nom_id = :p_nom_id) or
        (obj_id = :p_obj_id)
        into :KOD_IZD, :ART_IZD, :NOM_ID, :OBJ_ID, :user_id, :USER_NAME, :date_mod
    do begin
      suspend;
    end
  end

  exit;
end ^

/* -------- Ф2: EXP_ZAKAZ_IU — идемпотентность повторного экспорта -------- */
CREATE OR ALTER PROCEDURE EXP_ZAKAZ_IU (ID INTEGER,
FIRM_ID INTS,
NUM_Z TYPE OF COLUMN C1_ZAKAZ_H.NUM,
DATA_Z TYPE OF COLUMN C1_ZAKAZ_H.DATA_Z,
SROK_Z TYPE OF COLUMN C1_ZAKAZ_H.SROK_Z)
RETURNS (RES_ID INTS,
RES_STR RES_STR)
AS
declare variable NUM_ZAIY varchar(10);
declare variable DATA_ZAIY date;
declare variable NAME_ZAK varchar(50);
declare variable KOD_ZAK varchar(8);
declare variable DOC_ID integer;
declare variable OPERATION integer;
declare variable STORAGE_IN integer;
declare variable STORAGE_OUT integer;
declare variable FIRM_IN integer;
declare variable FIRM_OWNER integer;
declare variable NUMBER type of column DOC_HEADER.NUMBER;
declare variable DATE_DOC type of column DOC_HEADER.DATE_DOC;
begin
    /* сначала находим или создаём заказ (c1_zakaz_h_i — upsert по num+data_z) */
    select res_id
      from c1_zakaz_h_i(:num_z, :data_z, :srok_z, null, null, null, null, :firm_id)
      into :res_id;

    /* документ "Заказ в производство" и связь создаём только один раз */
    select first 1 t.doc_id from c1_ztod t where t.id_zakaz = :res_id into :doc_id;
    if (doc_id is null) then
    begin
      operation = 7;
      select v.ints from glb_variables v where v.var_name = 'DEF_SGP' into :storage_in;
      select v.ints from glb_variables v where v.var_name = 'DEF_PROD_AREA' into :storage_out;
      select v.ints from glb_variables v where v.var_name = 'DEF_FIRM' into :firm_owner;
      firm_in = firm_owner;
      date_doc = current_date;
      select res_id
        from doc_header_iu(null, :operation, :date_doc, :number, :firm_owner, :firm_in, :storage_in , null, :storage_out, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null)
        into :doc_id;
      insert into c1_ztod(id_zakaz, doc_id) values (:res_id, :doc_id);
      res_str = 'добавлен заказ';
    end
    else
    begin
      /* повторная выгрузка = полный снапшот заказа из 1С: старые строки
         заменяются (иначе EXP_ZAKAZ_ITEMS_IU задваивала бы позиции) */
      delete from c1_zakaz_nom_i zn
       where zn.id_zakaz_i in (select zi.id_zakaz_i from c1_zakaz_i zi where zi.id_zakaz = :res_id);
      delete from c1_zakaz_i zi where zi.id_zakaz = :res_id;
      delete from doc_items di where di.doc_id = :doc_id;
      res_str = 'заказ уже существует, строки заменены';
    end
    suspend;
end ^

/* -------- Ф3: EXP_NOM_IU — NULL-безопасные upsert'ы C1_NOM/C1_LINKS -------- */
CREATE OR ALTER PROCEDURE EXP_NOM_IU (ID INTEGER,
NAME_IZD TYPE OF COLUMN OBJ_LIST.NAME,
KOD_IZD C1_KOD_IZD,
ART_IZD C1_ART_IZD,
BARCODE_IZD C1_BARCODE_IZD,
MEASURE_ID INTS,
CATALOG_ID INTS,
OBJ_LIST_NAME TYPE OF COLUMN OBJ_LIST.NAME,
ATRR_LIST VARCHAR_1024,
VAL_LIST VARCHAR_1024)
RETURNS (RES_ID INTS,
RES_STR RES_STR)
AS
declare variable OBJ_ID INTS;
begin
  obj_list_name = trim(obj_list_name);
  obj_list_name = nullif(obj_list_name,'');
  name_izd = trim(name_izd);
  name_izd = nullif(name_izd, '');
  art_izd = trim(art_izd);
  art_izd = nullif(art_izd,'');
  barcode_izd = nullif(barcode_izd,'');
  res_str = 'номенклатура создана';
  res_id = nullif(id, 0);

  -- найти группу
     if (not exists ( select * from obj_catalog c where c.catalog_id = :catalog_id)) then
     begin
       select ints from glb_variables_s('DEF_CATALOG') into :catalog_id;
     end

  -- ищиь по коду изделия. считаем, что код1с = nom_id не зависимо от артикля.
     if (res_id is null) then
       select l.nom_id from c1_links l where l.kod_izd = :kod_izd and l.art_izd is not distinct from :art_izd and l.nom_id is not null into :res_id;

     if (res_id is not null and res_id != -1) then
     begin
       update c1_nom set barcode_izd = :barcode_izd, name_izd = :name_izd
        where kod_izd = :kod_izd and art_izd is not distinct from :art_izd;
       if (row_count = 0) then
         insert into c1_nom (kod_izd, art_izd, barcode_izd, name_izd)
           values (:kod_izd, :art_izd, :barcode_izd, :name_izd);

       update c1_links set nom_id = :res_id
        where kod_izd = :kod_izd and art_izd is not distinct from :art_izd;
       if (row_count = 0) then
         insert into c1_links (kod_izd, art_izd, nom_id)
           values (:kod_izd, :art_izd, :res_id);

       suspend;
       exit;
     end

  -- если obj_list_name не null то мы хотим добавить номенклатуру с параметрами.
     if (obj_list_name is not null) then
     begin
       select l.obj_id from obj_list l where upper(l.name) = upper(:obj_list_name) into :obj_id;
       if (obj_id is null) then
         select res_id
         from obj_list_iu(null, :catalog_id, :obj_list_name, null, null, 1,:measure_id, null, null, null)
         into :obj_id;
      select nom_id
        from nom_list_item_i(:obj_id, null, :atrr_list, :val_list)
        into :res_id;
     end
     else
     begin
      -- найти номенклутуру 1с в группе по нименованию
        select l.obj_id  from obj_list l where l.catalog_id = :catalog_id and upper(l.name) = upper(:name_izd) into :obj_id;

      -- добавить группу
        if (obj_id is not null) then
        begin
          select n.nom_id from nom_list n where n.obj_id = :obj_id and upper(n.name) = upper(:name_izd) into :res_id;
          if (res_id is not null) then
          begin
            res_str = 'номенклатура найдена по наименованию';
            suspend;
            exit;
          end
        end
      -- добавить номенклатуру
        if (obj_id is null) then
          select res_id from obj_list_iu(null, :catalog_id, :name_izd, null, null, 1, :measure_id, null, null, null)
          into :obj_id;
          --
        insert into nom_list (nom_id, obj_id, name, is_filter)
          values (gen_id(gen_nom_id,1), :obj_id, :name_izd, 0)
          returning nom_id
          into :res_id;
     end

     update c1_nom set barcode_izd = :barcode_izd, name_izd = :name_izd
      where kod_izd = :kod_izd and art_izd is not distinct from :art_izd;
     if (row_count = 0) then
       insert into c1_nom (kod_izd, art_izd, barcode_izd, name_izd)
         values (:kod_izd, :art_izd, :barcode_izd, :name_izd);

     update c1_links set nom_id = :res_id
      where kod_izd = :kod_izd and art_izd is not distinct from :art_izd;
     if (row_count = 0) then
       insert into c1_links (kod_izd, art_izd, nom_id)
         values (:kod_izd, :art_izd, :res_id);
  -- добавить связм номенклатуры hitek и 1с
  suspend;
end ^

/* -------- Ф4: C1_ZAKAZ_NOM_I_IU — не плодить связь с пустым артикулом -------- */
CREATE OR ALTER PROCEDURE C1_ZAKAZ_NOM_I_IU (ID_ZAKINOM INTEGER,
ID_ZAKAZ_I INTEGER,
NOM_ID INTEGER,
CNT NUMERIC(18,4),
ITEM_ID INTEGER,
DESCRIPT VARCHAR(64),
EXPORTED INTEGER)
RETURNS (RES_ID INTEGER)
AS
declare variable KOD_IZD type of column C1_LINKS.KOD_IZD;
declare variable ART_IZD type of column C1_LINKS.ART_IZD;
begin

  if (id_zakinom is null or id_zakinom = 0) then
    id_zakinom = gen_id(gen_c1_zakinom,1);
  item_id = nullif(item_id,0);

  if (exists(select id_zakaz_i from c1_zakaz_nom_i where (id_zakinom = :id_zakinom))) then
    update c1_zakaz_nom_i
    set nom_id = :nom_id,
        cnt = :cnt,
        item_id = :item_id,
        exported = :exported,
        descript = :descript
    where (id_zakinom = :id_zakinom);
  else
    insert into c1_zakaz_nom_i(id_zakinom, id_zakaz_i, nom_id, cnt, item_id, descript, exported)
    values (:id_zakinom, :id_zakaz_i, :nom_id, :cnt, :item_id, :descript, :exported);

  select zi.kod_izd, zi.art_izd
    from c1_zakaz_i zi
    where zi.id_zakaz_i = :id_zakaz_i
    into :kod_izd, :art_izd;

  /* связь (код, артикул строки заказа) нужна для резолва NOM_ID в C1_ZAKAZ_I_S
     (строгое равенство по артикулу) — создаём её NULL-безопасно, не плодя
     одинаковые пары и не создавая связей с NULL-кодом */
  if (kod_izd is not null) then
  begin
    update c1_links set nom_id = :nom_id
     where kod_izd = :kod_izd and art_izd is not distinct from :art_izd;
    if (row_count = 0) then
      insert into c1_links (kod_izd, art_izd, nom_id)
        values (:kod_izd, :art_izd, :nom_id);
  end

  res_id = id_zakinom;
  suspend;
end ^

SET TERM ; ^
