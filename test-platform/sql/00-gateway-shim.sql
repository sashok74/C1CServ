/* Шим тестового клона erp_base_api_c1 (платформа C1CServ).
   В erp_base_api_copy данные/структура реестра MET$ заменены из techs, поэтому
   прод-процедуры MET$PROC_*_INFO_S отсутствуют. fb-port для вызова процедур
   читает только PARAM_NAME/PARAM_TYPE/PARAM_NUMBER — этого достаточно
   поверх системной SYS$PROC_PARAMS. Применяется после каждого переклона. */
SET TERM ^ ;

CREATE OR ALTER PROCEDURE MET$PROC_IN_PARAM_INFO_S (
  PROC_NAME CHAR(31) CHARACTER SET UTF8)
RETURNS (
  PARAM_NAME CHAR(31) CHARACTER SET UTF8,
  PARAM_TYPE CHAR(31) CHARACTER SET UTF8,
  PARAM_NUMBER INTEGER,
  IN_PARAM INTEGER)
AS
begin
  for select p.param_name, p.param_type, p.param_number, p.in_param
        from sys$proc_params(:proc_name) p
        where p.in_param = 0
        order by p.param_number
        into :param_name, :param_type, :param_number, :in_param
  do suspend;
end ^

SET TERM ; ^

/* Ниже — пересадка двух процедур экспорта, отсутствующих в erp_base_api_copy
   (реестр копии пересобирался из techs и потерял их). Тексты взяты из
   прод-DDL erp_base_api (HiTek12/doc/api_full_ddl.sql) без изменений, кроме:
   first_day(of month from CURRENT_DATE) -> (CURRENT_DATE - EXTRACT(DAY FROM CURRENT_DATE) + 1)
   (функции FIRST_DAY в копии нет);
   вызовы DOC_ITEMS_IU приведены к сигнатуре копии (25 входных параметров,
   в проде 26 — без PACK_CNT_RES-аналога; маппинг по именам сверен по RDB$). */
SET TERM ^ ;

CREATE OR ALTER PROCEDURE EXP_ZAKAZ_ITEMS_IU (ID_ZAKAZ INTS,
NOM_ID INTS,
MEASURE_ID INTS,
CNT CNT_DOC,
CNTW CNT_DOC)
RETURNS (RES_ID INTS,
RES_STR RES_STR)
AS
declare variable DOC_ID INTS;
declare variable TRANS_STATUS INTS;
declare variable NAME_IZD type of column C1_ZAKAZ_I.NAME_IZD;
declare variable ID_ZAKINOM INTS;
declare variable ID_ZAKINOM_RES INTS;
declare variable ITEM_ID INTS;
declare variable ID_ZAKAZ_I INTS;
declare variable KOD_IZD type of column C1_ZAKAZ_I.KOD_IZD;
declare variable TEMP_NOM_ID INTS;
begin
  trans_status = null;
  id_zakaz = nullif(id_zakaz,0);
  kod_izd = trim(kod_izd);
  kod_izd = nullif(kod_izd,'');
  cntw = coalesce(cntw, 0);
  cnt = coalesce(cnt, 0);

  /* изготовлено. может быть больше чем требуется, это количесвто вычитаем из требуется */
  if (cntw > 0 and cntw < cnt) then cnt = cnt - cntw;
  else if (cntw > cnt) then cnt = 0;

  select doc_id from c1_ztod where id_zakaz = :id_zakaz into :doc_id;
  if (doc_id is null) then
  begin
    res_id = -1;
    res_str = 'не найден документ заказ в производство';
    suspend;
    exit;
  end

  select nom_id from nom_list n where n.nom_id = :nom_id into :temp_nom_id;
  if (temp_nom_id is null) then
  begin
    res_id = -1;
    res_str = 'не найдена номенклатура!';
   -- suspend;
   -- exit;
  end

  select substring(n.name from 0 for 150) from nom_list n where n.nom_id = :nom_id into :name_izd;
  select l.kod_izd from c1_links l where l.nom_id = :nom_id rows 1 into :kod_izd;
  select res_id
  from doc_items_iu(null, :doc_id, :nom_id, null, null, null, :cnt, null, null, :measure_id, null, null, null, :trans_status, null, null, null, null, null, null, null, null, null, 0, null)
  into :item_id;
  select res_id
  from c1_zakaz_i_i(:id_zakaz, :kod_izd, null, :name_izd, null, null, :cnt, null)
  into :id_zakaz_i;
  res_id = id_zakaz_i;

  select i.id_zakinom from  c1_zakaz_nom_i i where i.id_zakaz_i = :id_zakaz_i into :id_zakinom;

  select res_id
  from c1_zakaz_nom_i_iu(:id_zakinom, :id_zakaz_i, :nom_id, :cnt, :item_id, null, null)
  into :id_zakinom_res;

  if (res_id > 0) then res_str = 'добавлена строка';
  suspend;
end ^

CREATE OR ALTER PROCEDURE EXP_NOM_CNT_SET (NOM_ID INTS,
PACK_NAME TYPE OF COLUMN NOM_PACK.NAME,
STR_ID INTS,
CNT_NEW CNT_DOC,
RES_NEW CNT_DOC,
PRICE_NEW MONEY_NULL)
RETURNS (CNT_RET CNT_DOC,
RES_ID INTS,
RES_STR RES_STR)
AS
declare variable CNT_CUR numeric(18,4);
declare variable CNT_OUT numeric(18,4);
declare variable CNT_TMP numeric(18,4);
declare variable PACK_ID integer;
declare variable TRANS_ID integer;
declare variable NAME varchar(150);
declare variable DOC_ID integer;
declare variable FIRM_OWNER integer;
begin
  pack_name = trim(pack_name);
  pack_name = nullif(pack_name,'');

  select a.cnt_avail
    from nom_avail_s (:nom_id, null, null, :str_id, null, null) a
    into :cnt_cur;

  cnt_ret = 0;
  cnt_tmp = cnt_cur - cnt_new;

  if (cnt_tmp > 0) then
  begin
     -- не обрабатываем уменьшение количесвта.
     suspend;
     exit;
  end
  cnt_new = - cnt_tmp;
  -- поиск документа приход излишков за этот месяц и для нужного склада. если нет то добавляем

  select h.doc_id
    from doc_header h
    where h.operation = 5
      and h.date_doc >= (CURRENT_DATE - EXTRACT(DAY FROM CURRENT_DATE) + 1)
      and h.storage_in = :str_id
      and h.registed != 1
      into :doc_id;
  if (doc_id is null) then
  begin
   select v.ints from glb_variables v where v.var_name = 'DEF_FIRM' into :firm_owner;

   select res_id
     from DOC_HEADER_IU(null, 5, current_date, null, :firm_owner, :firm_owner, :str_id, null, null, null, null, null, null, null, null, null, 'Экспорт номенклатуры из 1С', null, null, null, null, null, null, null, null, null, null, null, null)
    into :doc_id;

  end
  -- добавляем партию на номенклатуру. + цена
  if (pack_name is null) then
    select name||' '||coalesce(sheet,'') from nom_list where nom_id = :nom_id into :pack_name;

  select pack_id
  from nom_pack_i(1, :pack_name, :nom_id, null, null, null, :price_new, null, null, 1, null, null, null)
  into :pack_id;

  -- добавляем строку в документ номенклатура, количесвто.  цена ???
  -- проводим эту строку.
   select res_id
  from doc_items_iu(null, :doc_id, :nom_id, :pack_id, :pack_name, null, :cnt_new, null, :cnt_new, null, :price_new, null, null, 2, null, null, null, null, null, null, null, null, null, 0, null)
  into res_id;


  select a.cnt_avail
    from nom_avail_s (:nom_id, null, null, :str_id, null, null) a
    into :cnt_ret;

  if (cnt_ret = cnt_new)
    then  res_id = nom_id;
    else  res_id = -1;

  suspend;
end ^

SET TERM ; ^

/* Очистка заказного контура клона.
   EXP_ZAKAZ_IU при КАЖДОМ экспорте вставляет новый DOC_HEADER (op=7) и строку
   C1_ZTOD, поэтому повторный экспорт существующего заказа падает на
   "multiple rows in singleton select" в EXP_ZAKAZ_ITEMS_IU (исторические
   11 дублей C1_ZTOD в проде — следы таких повторов). Тестовый прогон должен
   импортировать заказы «с нуля», поэтому заказные данные из клона удаляются;
   номенклатура и справочники остаются — их IU-процедуры корректно апдейтят. */
delete from doc_items where doc_id in (select doc_id from doc_header where operation = 7);
delete from c1_zakaz_nom_i;
delete from c1_zakaz_i;
delete from c1_ztod;
delete from c1_zakaz_h;
delete from doc_header where operation = 7;
commit;
