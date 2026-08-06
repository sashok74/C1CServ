# SQL-артефакты платформы

Применяются к **тестовой копии** базы HiTek (не к боевой) в порядке номеров:

```bash
isql -q -bail -i 00-gateway-shim.sql          <host>:<путь_или_алиас_тестовой_базы>
isql -q -bail -i 01-prod-fix-candidates.sql   <host>:<путь_или_алиас_тестовой_базы>
isql -q -bail -i 02-exp2-export.sql           <host>:<путь_или_алиас_тестовой_базы>
```

| Файл | Что делает | Нужен ли вам |
|---|---|---|
| `00-gateway-shim.sql` | Восстанавливает `MET$PROC_IN_PARAM_INFO_S` (её читает шлюз fb-port, чтобы узнать сигнатуру процедуры), пересаживает `EXP_ZAKAZ_ITEMS_IU` и `EXP_NOM_CNT_SET`, очищает заказный контур копии | **Только если** ваша копия сделана из базы с урезанным реестром `MET$`. Проверьте: `select count(*) from rdb$procedures where rdb$procedure_name='MET$PROC_IN_PARAM_INFO_S'` — если 1, шим не нужен |
| `01-prod-fix-candidates.sql` | Кандидаты исправлений дефектов: размеры полей `C1_LINKS_S`, идемпотентность повторного экспорта заказа `EXP_ZAKAZ_IU`, NULL-безопасные upsert'ы в `EXP_NOM_IU` и `C1_ZAKAZ_NOM_I_IU` | Желателен: без него повторный экспорт того же заказа падает. Обоснование — `c1serv_doc/README.md` §12 и `test-platform/README.md` |
| `02-exp2-export.sql` | Селект-процедуры выгрузки в 1С: `EXP2_NOM_LINK_S`, `EXP2_STORAGE_S`, `EXP2_ISSUE_S`, `EXP2_TRANSFER_S`, `EXP2_BOM_S` | Нужен для маршрутов `/exp2/v1/*` (`c1serv_doc/EXP2_API.md`) |

Все три файла — только `CREATE OR ALTER PROCEDURE` и правка данных **в копии**;
боевую базу они не трогают. Применять повторно безопасно (идемпотентны), кроме
секции очистки заказного контура в `00-gateway-shim.sql` — она удаляет заказы
и документы операции 7 из копии.

После пересоздания копии из бэкапа применить заново.
