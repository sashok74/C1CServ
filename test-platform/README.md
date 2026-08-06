# Тестовая платформа C1CServ

Контур, где C1CServ работает по-настоящему end-to-end, но 1С эмулируется моком, а запись
идёт в **тестовый клон** базы HiTek. Ничего в этом каталоге не попадает в сборку сервиса
(tsc/eslint покрывают только `src/`).

## Архитектура

```
Windows-станция ──ssh──► LXC c1-test (192.168.7.143)                     firebird5
  run-test.ps1           ├ c1cserv-test.service :3738  ─┐
  deploy.ps1             ├ c1-mock.service      :8125 ◄─┘ C1_WEBSERVER
  reset.ps1              ├ fb-port.service      :3333 ──сеть──► :3050 …/erp_base_api_c1.fdb
                         └ mongod (localhost)   :27017   (клон, алиасы erp_base_api_c1 / db_hitek_api_c1)
                             c1_data_test — тестовый журнал C1CServ
                             c1_mock      — данные мока (засев из прод-журнала)
```

Прод-журнал `c1_data` (LXC 104, 192.168.7.104) используется только при засеве, read-only.

## Компоненты

| Каталог/файл | Назначение |
|---|---|
| `mock-1c/server.js` | Мок 1С: `GET /unf/hs/ht/<путь>/<GUID>`. Источники по приоритету: файл из `MOCK_FILES_DIR/<путь>/<GUID>.json` → mongo `c1_mock` → 404. Остатки (`get_quantity_nomenclature`) синтезируются (`stock.js`). Каждый ответ пишется в `served.jsonl` — эталон «что отдали» |
| `mock-1c/clean.js` | Очистка полей, дописанных C1CServ в журнал (`GUID`, `SYNC_ID`, `ADD`, `PARENT_ID`, `_id`, `res`) — мок отдаёт «как 1С» |
| `scripts/seed-mock.js` | Засев `c1_mock` из прод-журнала: `--all` \| `--order <GUID>` \| `--load-only` |
| `scripts/pick-order.js` | Выбор связного набора GUID (`--auto` / `--guid`), генерация сценария, отчёт о «дырах» замыкания |
| `scripts/run-scenario.js` | Preflight-гейты + прогон ручек C1CServ. Ошибки ищутся в теле HTTP 201 (`err.errCode`) |
| `scripts/verify.js` | Сверка A(лог мока) ↔ B(журнал `c1_data_test`) ↔ C(Firebird через fb-port, только `*_S`-процедуры, READ_ONLY). Отчёт `report.json`/`report.md`, exit≠0 при fail |
| `scripts/run-all.js` | reset журнала → прогон → verify |
| `scripts/win/*.ps1` | Обёртки для Windows-станции: `run-test`, `deploy`, `reset` |
| `scenarios/` | Сценарии прогона (генерируются `pick-order.js`) |
| `seed-golden/` | Маленький закоммиченный связный набор JSON для оффлайн-проверки мока |

## Preflight-гейты (прогон прерывается)

1. Мок жив (`/__health`).
2. C1CServ жив (`GET /`).
3. **`GET /test_db` обязан вернуть путь `…erp_base_api_c1.fdb`** — защита от записи в прод.
4. Журнал `c1_data_test` пуст (иначе анти-дубль молча пропустит импорт); `--force-reset` очищает.

## Типовой цикл

```powershell
# с рабочей станции
.\test-platform\scripts\win\deploy.ps1     # push → pull+build+restart на c1-test
.\test-platform\scripts\win\run-test.ps1   # прогон + verify, отчёт копируется в .\reports\
.\test-platform\scripts\win\reset.ps1      # полный сброс: переклон базы + очистка журнала
```

На самом контейнере (все переменные — в `/etc/c1-test/platform.env`):

```bash
node test-platform/scripts/seed-mock.js --all        # засев мока (один раз / по требованию)
node test-platform/scripts/pick-order.js --auto      # выбрать заказ, создать сценарий
node test-platform/scripts/run-all.js                # прогон + verify
```

## Синтетический сценарий: объекты, которых нет в базе

Проверяет ветку **создания с нуля** (в HiTek нет ни соответствий, ни самих записей):
3 заказа, 3 новых контрагента, 8 новых номенклатур (2 — чип-компоненты с парсингом
параметров из имени), 4 новые группы каталога (с иерархией), 2 единицы измерения,
участок и 2 спецификации с составом и операциями. GUID детерминированные
(`5e57….-0000-4000-9000-…`), набор кладётся в `mock-files/` (файлы приоритетнее mongo).

```powershell
.\test-platform\scripts\win\gen-synthetic.ps1          # генерация + полный сброс + прогон + verify
.\test-platform\scripts\win\gen-synthetic.ps1 -GenOnly # только сгенерировать набор
```

На контейнере: `node test-platform/scripts/gen-synthetic.js`, затем
`node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-synthetic.json`
(после полного сброса — `win/reset.ps1` / `c1-test-reset.yml`).

Сценарий несёт блок `expect` — verify сверяет точно: имена/коды номенклатур,
привязку к созданным группам и единицам, заказчика в шапке заказа (`NAME_ZAK`),
число строк. Для чип-компонентов точная группа/единица не гарантируется
(`EXP_NOM_IU` может привязать их к существующему `OBJ_LIST` по имени паттерна).

**Очистка базы** (перед любым прогоном): `.\test-platform\scripts\win\reset.ps1` —
переклон `erp_base_api_c1` из копии + шим + очистка журнала `c1_data_test`.

## Ручная проверка «закинуть файлы»

Положить JSON-ответы 1С в `/srv/c1-test/mock-files/<путь>/<GUID>.json`
(например `mock-files/get_order/98c5cb6f-….json`) — файл имеет приоритет над mongo.
Формат — как отдаёт 1С: `{ "response": { "ЗаказПокупателя": { … } } }`.

## Важно: полный сброс перед каждым прогоном

`EXP_ZAKAZ_IU` при **каждом** экспорте вставляет новый `DOC_HEADER` (op=7) и строку
`C1_ZTOD` — повторный экспорт уже существующего заказа падает на
`multiple rows in singleton select` в `EXP_ZAKAZ_ITEMS_IU` (прод-дефект; 11 исторических
дублей `C1_ZTOD` в проде — следы таких повторов). Поэтому прогон всегда начинается
с переклона базы: `win/run-test.ps1` делает это сам (пропустить: `-NoReset`), вручную —
`playbooks/services/c1-test-reset.yml`. Шим переклона
(`files/firebird/erp-api-c1-gateway-shim.sql` в infra-репо) дополнительно:
восстанавливает `MET$PROC_IN_PARAM_INFO_S` (реестр MET$ копии заменён из techs),
пересаживает `EXP_ZAKAZ_ITEMS_IU`/`EXP_NOM_CNT_SET` (потеряны в копии, вызовы
`DOC_ITEMS_IU` приведены к её сигнатуре) и очищает заказный контур клона.

## Known issues (ожидаемые расхождения verify)

- `BOM_ID` в `EXP_ZAKAZ_ITEMS_IU`/`EXP_BOM_ITEMS_IU` отбрасывается fb-port — параметра
  нет в сигнатурах (`c1serv_doc/README.md` §12 п.13); при этом `BOMCUR_ID` связки
  база вычисляет сама (заполнен = pass, NULL = known-issue).
- `C1_LINKS_S` в копии падает с `string right truncation (10 vs 11)` на кодах 1С длиной
  11 символов — сверка `KOD_IZD` для таких номенклатур помечается known-issue.
- Дубли в `C1_LINKS` при повторных прогонах — известный дефект (§12 п. про C1_LINKS).
- `MEASURE_ID` может не проставляться из-за исторической опечатки `GUIDКдиницыИзмерения`.
- Даты (`DATA_Z`/`SROK_Z`) сверяются с допуском ±1 день: Firebird DATE приезжает из
  fb-port как UTC-ISO и сдвигается относительно локальной даты 1С.
- Остатки проверяются как «доведение вверх» (`CNT_AVAIL >= MOCK_STOCK_CNT`): клон уже
  содержит исторические остатки, `EXP_NOM_CNT_SET` уменьшение не обрабатывает.
- «Дыры замыкания» (ссылки на объекты, которых нет в историческом журнале, включая
  нулевой GUID) — мок отвечает 404, verify помечает warn; лечится файлами в `mock-files/`.

## Окружение

Сервисные env-файлы (`/etc/c1-test/*.env`, systemd `EnvironmentFile`) и `platform.env`
для скриптов создаёт ansible-роль `c1-test` (репозиторий `/opt/infra-ansible` на ansible-ctl).
Локальный запуск мока без mongo: `MOCK_MONGO_URI` не задавать — режим «только файлы».
