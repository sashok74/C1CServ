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

## Ручная проверка «закинуть файлы»

Положить JSON-ответы 1С в `/srv/c1-test/mock-files/<путь>/<GUID>.json`
(например `mock-files/get_order/98c5cb6f-….json`) — файл имеет приоритет над mongo.
Формат — как отдаёт 1С: `{ "response": { "ЗаказПокупателя": { … } } }`.

## Known issues (ожидаемые расхождения verify)

- `BOMCUR_ID` в строках заказа всегда NULL: схемы передают `BOM_ID`, но в сигнатурах
  `EXP_ZAKAZ_ITEMS_IU`/`EXP_BOM_ITEMS_IU` его нет — fb-port отбрасывает параметр
  (`c1serv_doc/README.md` §12 п.13). Статус `known-issue`.
- Дубли в `C1_LINKS` при повторных прогонах — известный дефект (§12 п. про C1_LINKS).
- `MEASURE_ID` может не проставляться из-за исторической опечатки `GUIDКдиницыИзмерения`.
- Остатки проверяются как «доведение вверх» (`CNT_AVAIL >= MOCK_STOCK_CNT`): клон уже
  содержит исторические остатки, `EXP_NOM_CNT_SET` уменьшение не обрабатывает.

## Окружение

Сервисные env-файлы (`/etc/c1-test/*.env`, systemd `EnvironmentFile`) и `platform.env`
для скриптов создаёт ansible-роль `c1-test` (репозиторий `/opt/infra-ansible` на ansible-ctl).
Локальный запуск мока без mongo: `MOCK_MONGO_URI` не задавать — режим «только файлы».
