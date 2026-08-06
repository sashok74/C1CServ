/* ============================================================================
   EXP2_*: селект-процедуры выгрузки HiTek -> 1С:Бухгалтерия.
   Спецификация: c1serv_doc/EXP2_1C_BUH.md, разделы 9-10.

   Соглашения (продиктованы шлюзом fb-port — он умеет только вызовы процедур
   и превращает параметры 0/'' в NULL):
     - NULL во входном параметре = «без фильтра» / «с начала»;
     - выдача плоская и денормализованная, группировку делает сервис;
     - коды 1С резолвятся как «последняя связь по DATE_MOD», рядом отдаётся
       KOD_CNT = число РАЗЛИЧНЫХ кодов (>1 => неоднозначность, разбирает человек).

   Обкатка на тестовом клоне erp_base_api_c1; в прод — отдельным решением.
   ============================================================================ */
SET TERM ^ ;

/* -------- 9.1 Номенклатура и её код 1С (+ сигналы для вывода счёта) -------- */
CREATE OR ALTER PROCEDURE EXP2_NOM_LINK_S (
  FROM_NOM_ID_IN INTEGER,
  MAX_ROWS_IN INTEGER)
RETURNS (
  NOM_ID INTEGER,
  KOD_IZD VARCHAR(15),
  ART_IZD VARCHAR(15),
  KOD_CNT SMALLINT,
  NOM_NAME VARCHAR(250),
  NOM_SHEET VARCHAR(50),
  MEASURE_ID INTEGER,
  MSR_NAME VARCHAR(15),
  MSR_CODE CHAR(3),
  CATALOG_ID INTEGER,
  CATALOG_NAME VARCHAR(400),
  ROOT_CATALOG_ID INTEGER,
  ROOT_CATALOG_NAME VARCHAR(400),
  HAS_BOM SMALLINT,
  USED_IN_BOM SMALLINT)
AS
declare variable PARENT INTEGER;
declare variable GUARD INTEGER;
begin
  for select first (coalesce(:MAX_ROWS_IN, 1000))
             n.nom_id, n.name, n.sheet, o.catalog_id, c.name, o.base_measure, m.msr_name, m.msr_code
        from nom_list n
             left join obj_list o on o.obj_id = n.obj_id
             left join obj_catalog c on c.catalog_id = o.catalog_id
             left join glb_measure m on m.measure_id = o.base_measure
       where (:FROM_NOM_ID_IN is null or n.nom_id > :FROM_NOM_ID_IN)
       order by n.nom_id
        into :nom_id, :nom_name, :nom_sheet, :catalog_id, :catalog_name,
             :measure_id, :msr_name, :msr_code
  do
  begin
    /* код 1С: последняя связь по DATE_MOD; KOD_CNT — сколько различных кодов */
    kod_izd = null;
    art_izd = null;
    select count(distinct l.kod_izd) from c1_links l where l.nom_id = :nom_id into :kod_cnt;
    kod_cnt = coalesce(kod_cnt, 0);
    if (kod_cnt > 0) then
      select first 1 l.kod_izd, l.art_izd
        from c1_links l
       where l.nom_id = :nom_id
       order by l.date_mod desc
        into :kod_izd, :art_izd;

    /* корень каталога: подъём по PARENT_ID, guard от циклов */
    root_catalog_id = catalog_id;
    root_catalog_name = catalog_name;
    guard = 0;
    parent = catalog_id;
    while (parent is not null and guard < 20) do
    begin
      select c.parent_id from obj_catalog c where c.catalog_id = :parent into :parent;
      if (parent is not null) then
      begin
        root_catalog_id = parent;
        select c.name from obj_catalog c where c.catalog_id = :parent into :root_catalog_name;
      end
      guard = guard + 1;
    end

    /* сигналы типа номенклатуры (правило вывода счёта живёт в конфиге сервиса) */
    has_bom = iif(exists(select 1 from bom_list b where b.nom_id = :nom_id and b.main_bom = 1), 1, 0);
    used_in_bom = iif(exists(select 1 from bom_items i where i.nom_id = :nom_id), 1, 0);

    suspend;
  end
end ^

/* -------- 9.2 Складские единицы с мерой «живости» -------- */
CREATE OR ALTER PROCEDURE EXP2_STORAGE_S
RETURNS (
  STR_ID INTEGER,
  NAME VARCHAR(50),
  MOVES_CNT INTEGER,
  NOM_CNT INTEGER,
  LAST_MOVE DATE)
AS
begin
  for select s.str_id, s.name from str_storage s order by s.str_id
       into :str_id, :name
  do
  begin
    select count(*), count(distinct p.nom_id), max(t.date_trans)
      from nom_trans t
           left join nom_pack p on p.pack_id = t.pack_id
     where t.storage_id = :str_id
      into :moves_cnt, :nom_cnt, :last_move;
    suspend;
  end
end ^

/* -------- 10.3 Расход материалов в производство (Требование-накладная) --------
   Источник истины — NOM_TRANS (факт), а не DOC_ITEMS (намерение).
   Шапка несёт изделие запуска -> субконто «Продукция» на 20.01.
   Приход (operation 1 и 5) не возвращается никогда — защита от «кольца». */
CREATE OR ALTER PROCEDURE EXP2_ISSUE_S (
  FROM_ID_IN INTEGER,
  MAX_ROWS_IN INTEGER)
RETURNS (
  TRANS_ID INTEGER,
  DOC_ID INTEGER,
  DOC_NUMBER VARCHAR(60),
  DATE_DOC DATE,
  DOC_DESCRIPT VARCHAR(1020),
  REGISTED INTEGER,
  STORAGE_ID INTEGER,
  STORAGE_NAME VARCHAR(50),
  PROD_NOM_ID INTEGER,
  PROD_KOD VARCHAR(15),
  PROD_NAME VARCHAR(250),
  PROD_CNT NUMERIC(15,4),
  PROD_KOD_CNT SMALLINT,
  NOM_ID INTEGER,
  KOD_IZD VARCHAR(15),
  KOD_CNT SMALLINT,
  NOM_NAME VARCHAR(250),
  MSR_NAME VARCHAR(15),
  CNT NUMERIC(15,4),
  PACK_ID INTEGER,
  ITEM_ID INTEGER,
  DATE_TRANS DATE)
AS
begin
  for select first (coalesce(:MAX_ROWS_IN, 1000))
             t.trans_id, h.doc_id, h.number, h.date_doc, h.descript, coalesce(h.registed,0),
             t.storage_id, s.name, pr.nom_id, prn.name, h.pack_cnt,
             t.pack_id, p.nom_id, n.name, m.msr_name, -t.cnt, t.item_id, t.date_trans
        from nom_trans t
             join doc_items i on i.item_id = t.item_id
             join doc_header h on h.doc_id = i.doc_id
             left join str_storage s on s.str_id = t.storage_id
             left join nom_pack p on p.pack_id = t.pack_id
             left join nom_list n on n.nom_id = p.nom_id
             left join obj_list o on o.obj_id = n.obj_id
             left join glb_measure m on m.measure_id = o.base_measure
             left join nom_pack pr on pr.pack_id = h.pack_id
             left join nom_list prn on prn.nom_id = pr.nom_id
       where h.operation = 3
         and h.deleted = 0
         and t.cnt < 0
         and (:FROM_ID_IN is null or t.trans_id > :FROM_ID_IN)
       order by t.trans_id
        into :trans_id, :doc_id, :doc_number, :date_doc, :doc_descript, :registed,
             :storage_id, :storage_name, :prod_nom_id, :prod_name, :prod_cnt,
             :pack_id, :nom_id, :nom_name, :msr_name, :cnt, :item_id, :date_trans
  do
  begin
    kod_izd = null; kod_cnt = 0;
    if (nom_id is not null) then
    begin
      select count(distinct l.kod_izd) from c1_links l where l.nom_id = :nom_id into :kod_cnt;
      kod_cnt = coalesce(kod_cnt, 0);
      select first 1 l.kod_izd from c1_links l where l.nom_id = :nom_id order by l.date_mod desc into :kod_izd;
    end
    prod_kod = null; prod_kod_cnt = 0;
    if (prod_nom_id is not null) then
    begin
      select count(distinct l.kod_izd) from c1_links l where l.nom_id = :prod_nom_id into :prod_kod_cnt;
      prod_kod_cnt = coalesce(prod_kod_cnt, 0);
      select first 1 l.kod_izd from c1_links l where l.nom_id = :prod_nom_id order by l.date_mod desc into :prod_kod;
    end
    suspend;
  end
end ^

/* -------- 10.4 Перемещение между складами --------
   Пара движений с одним ITEM_ID: отрицательное = отправитель, положительное = получатель.
   Курсор — TRANS_ID приходного (большего) движения. */
CREATE OR ALTER PROCEDURE EXP2_TRANSFER_S (
  FROM_ID_IN INTEGER,
  MAX_ROWS_IN INTEGER)
RETURNS (
  TRANS_ID INTEGER,
  TRANS_ID_OUT INTEGER,
  TRANS_ID_IN INTEGER,
  DOC_ID INTEGER,
  DOC_NUMBER VARCHAR(60),
  DATE_DOC DATE,
  DOC_DESCRIPT VARCHAR(1020),
  REGISTED INTEGER,
  STORAGE_OUT_ID INTEGER,
  STORAGE_OUT_NAME VARCHAR(50),
  STORAGE_IN_ID INTEGER,
  STORAGE_IN_NAME VARCHAR(50),
  NOM_ID INTEGER,
  KOD_IZD VARCHAR(15),
  KOD_CNT SMALLINT,
  NOM_NAME VARCHAR(250),
  MSR_NAME VARCHAR(15),
  CNT NUMERIC(15,4),
  PACK_ID INTEGER,
  ITEM_ID INTEGER,
  DATE_TRANS DATE)
AS
begin
  for select first (coalesce(:MAX_ROWS_IN, 1000))
             tin.trans_id, tout.trans_id, tin.trans_id,
             h.doc_id, h.number, h.date_doc, h.descript, coalesce(h.registed,0),
             tout.storage_id, sout.name, tin.storage_id, sin.name,
             tin.pack_id, p.nom_id, n.name, m.msr_name, tin.cnt, tin.item_id, tin.date_trans
        from nom_trans tin
             join doc_items i on i.item_id = tin.item_id
             join doc_header h on h.doc_id = i.doc_id
             join nom_trans tout on tout.item_id = tin.item_id and tout.cnt < 0
             left join str_storage sout on sout.str_id = tout.storage_id
             left join str_storage sin on sin.str_id = tin.storage_id
             left join nom_pack p on p.pack_id = tin.pack_id
             left join nom_list n on n.nom_id = p.nom_id
             left join obj_list o on o.obj_id = n.obj_id
             left join glb_measure m on m.measure_id = o.base_measure
       where h.operation = 2
         and h.deleted = 0
         and tin.cnt > 0
         and (:FROM_ID_IN is null or tin.trans_id > :FROM_ID_IN)
       order by tin.trans_id
        into :trans_id, :trans_id_out, :trans_id_in,
             :doc_id, :doc_number, :date_doc, :doc_descript, :registed,
             :storage_out_id, :storage_out_name, :storage_in_id, :storage_in_name,
             :pack_id, :nom_id, :nom_name, :msr_name, :cnt, :item_id, :date_trans
  do
  begin
    kod_izd = null; kod_cnt = 0;
    if (nom_id is not null) then
    begin
      select count(distinct l.kod_izd) from c1_links l where l.nom_id = :nom_id into :kod_cnt;
      kod_cnt = coalesce(kod_cnt, 0);
      select first 1 l.kod_izd from c1_links l where l.nom_id = :nom_id order by l.date_mod desc into :kod_izd;
    end
    suspend;
  end
end ^

/* -------- Спецификации: 2719 основных, «быстрая победа» (§5 п.3) --------
   Выгружается плоско: строка состава + шапка. В 1С грузится штатной
   «Загрузить из файла» справочника «Спецификации номенклатуры». */
CREATE OR ALTER PROCEDURE EXP2_BOM_S (
  FROM_BOM_ID_IN INTEGER,
  MAX_ROWS_IN INTEGER)
RETURNS (
  BOM_LIST_ID INTEGER,
  BOM_NAME VARCHAR(50),
  PROD_NOM_ID INTEGER,
  PROD_KOD VARCHAR(15),
  PROD_NAME VARCHAR(250),
  PROD_MSR VARCHAR(15),
  ITEM_ORD SMALLINT,
  ITEM_NOM_ID INTEGER,
  ITEM_KOD VARCHAR(15),
  ITEM_KOD_CNT SMALLINT,
  ITEM_NAME VARCHAR(250),
  ITEM_MSR VARCHAR(15),
  ITEM_CNT NUMERIC(15,4))
AS
begin
  for select first (coalesce(:MAX_ROWS_IN, 5000))
             b.bom_list_id, b.name, b.nom_id, pn.name, pm.msr_name,
             it.ord, it.nom_id, inn.name, im.msr_name, it.cnt
        from bom_list b
             join bom_items it on it.bom_list_id = b.bom_list_id
             left join nom_list pn on pn.nom_id = b.nom_id
             left join obj_list po on po.obj_id = pn.obj_id
             left join glb_measure pm on pm.measure_id = po.base_measure
             left join nom_list inn on inn.nom_id = it.nom_id
             left join obj_list io on io.obj_id = inn.obj_id
             left join glb_measure im on im.measure_id = io.base_measure
       where b.main_bom = 1
         and (:FROM_BOM_ID_IN is null or b.bom_list_id > :FROM_BOM_ID_IN)
       order by b.bom_list_id, it.ord
        into :bom_list_id, :bom_name, :prod_nom_id, :prod_name, :prod_msr,
             :item_ord, :item_nom_id, :item_name, :item_msr, :item_cnt
  do
  begin
    prod_kod = null;
    if (prod_nom_id is not null) then
      select first 1 l.kod_izd from c1_links l where l.nom_id = :prod_nom_id order by l.date_mod desc into :prod_kod;
    item_kod = null; item_kod_cnt = 0;
    if (item_nom_id is not null) then
    begin
      select count(distinct l.kod_izd) from c1_links l where l.nom_id = :item_nom_id into :item_kod_cnt;
      item_kod_cnt = coalesce(item_kod_cnt, 0);
      select first 1 l.kod_izd from c1_links l where l.nom_id = :item_nom_id order by l.date_mod desc into :item_kod;
    end
    suspend;
  end
end ^

SET TERM ; ^
