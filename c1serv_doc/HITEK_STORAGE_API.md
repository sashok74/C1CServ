# Интеграция HiTek ↔ «умный склад» (Storage Solutions)

Отдельный от 1С контур: HiTek регистрирует во внешней складской системе **позиции
номенклатуры (item)** и **катушки SMD-компонентов (reel)**. Обмен односторонний —
HiTek только пишет наружу, обратно ничего не читает и идентификаторы склада не хранит.

Проверено 2026-08-11 по исходникам `C:\RADProjects\HiTek12` и копии боевой базы
(`erp_base_api_copy` на firebird5). Все запросы ниже воспроизводимы.

---

## 1. Где код

| Что | Файл |
|---|---|
| Класс `TStorageSolutions`, структуры `ItemInfo`/`ReelInfo`, коды ошибок `API_Error` | `StorageSolutions/StorageSolutions.h` |
| Реализация запросов и разбор XML | `StorageSolutions/StorageSolutions.cpp` |
| Единственное место вызова — карточка номенклатуры `TfrmFolder` | `src/uCatalogEdit.cpp` |
| Поле объекта | `src/uCatalogEdit.h:680` — `StorageSolutions::TStorageSolutions* Stor` |
| Подключение к сборке | `HiTek.cbproj`: `StorageSolutions\` в `IncludePath`/`ILINK_LibraryPath`, файл в `CppCompile` |

**Документация протокола лежит прямо в коде** — большой комментарий в конце
`StorageSolutions.h` (строки 146–227): там примеры всех запросов и реальных ответов
сервера, включая случай просроченного токена. Это первичный источник по API.

В `C:\RADProjects\HiTek12_indukchiy\StorageSolutions\` лежит более старая копия того же
модуля (комментарии в битой кодировке, в `ReelInfo` нет полей `partnumber`/`brand`).
Актуальная версия — в `HiTek12`.

## 2. Протокол

HTTP GET через VCL `TNetHTTPClient`/`TNetHTTPRequest`, ответ — XML, разбирается
`TXMLDocument`. Все URL собираются одним методом (`StorageSolutions.h:90`):

```
http://<server>:<port>/?f=<функция>&<аргументы>&tkn=<токен>
```

| Функция | Метод класса | Назначение |
|---|---|---|
| `login` / `logout` | `Login()` / `Logout()` | получить/освободить токен |
| `item_get` | `GetItem(item_code)` | найти позицию |
| `item_create` | `AddItem(ItemInfo)` | создать позицию |
| `item_delete` | `RemoveItem(item_code)` | удалить позицию |
| `reel_get` | `GetReel(reel_code)` | найти катушку |
| `reel_create` | `AddReel(ReelInfo)` | создать катушку |
| `reel_delete` | `RemoveReel(reel_code)` | удалить катушку |

**Ошибка приходит не HTTP-статусом, а атрибутом `err` в XML** (статус всегда 200) —
разбирает `CheckError()`. Коды (`enum class API_Error`): `0 Done`, `2 InvalidFunction`,
`3 InvalidParameters`, `4 InvalidAccessToken`, `20 DeleteBlocked`, `30 NotFound`,
`40 MoreFound`, `100 OtherError`, `101 InternalException`.

Адрес и учётные данные **захардкожены** в `src/uCatalogEdit.cpp:577`:

```cpp
Stor = new StorageSolutions::TStorageSolutions("192.168.11.10", "8081", "INNER", "INNER");
```

## 3. Единственный сценарий вызова

`src/uCatalogEdit.cpp:3183–3207`, внутри добавления серийных номеров к партии.
Срабатывает **только если тип серийника — `RLSN`** (катушка):

1. `item_code` берётся из справочника: `GLB_NAMES_S(KEYWORD='SMD_NAME', ID=Pack->NomId)`,
   за которым стоит процедура `nom_list_name_create_short` — короткое SMD-имя вида
   `0.1UF_0603`, а не полное наименование номенклатуры.
2. Если токен пуст — `Login()`.
3. `GetItem(item_code)`; если ответ `NotFound` (30) — `AddItem()` с описанием из имени партии.
4. Если позиция есть/создана — `AddReel()` с полями: `code` = текст серийника,
   `itemCode`, `quantity` = `Pack->pack_cnt`, `partnumber` = `Pack->ManKod`,
   `brand` = `Pack->ManufacturerName`.

Объект живёт от `FormCreate` до `FormDestroy` (`delete Stor` — `uCatalogEdit.cpp:620`;
деструктор класса сам делает `Logout()`).

---

## 4. Доказательства в данных

Запросы выполнялись к копии боевой базы через MCP `db_hitek_api`; их можно повторить
в любом isql/инструменте на копии.

### 4.1 Все серийные номера в базе — катушечные

`SN_SELECT` умеет пять типов серийников (`PSN`, `RLSN`, `WEEK`, `WEEKPSN`, `WEEK8`),
но использовался ровно один — тот, что дёргает склад:

```sql
select substring(sn_text from 1 for 4) as PREFIX, count(*) as CNT,
       min(times) as FIRST, max(times) as LAST
  from sn_list group by 1 order by 2 desc;
```

Результат: **одна строка — `RLSN`, 113 записей, 2024-01-29 … 2024-03-20.**

Префикс задаётся самой процедурой (`SN_SELECT`, ветка `var = 'RLSN'`):
`sn_text = 'RLSN' || lpad(sn, 10, '0')`, счётчик — генератор `SN_REEL_GEN`.

### 4.2 К каким партиям привязаны катушки

Связь: `SN_TO_PACK.SLOT_ID → SN_SLOT.SLOT_ID → SN_SLOT.PACK_ID`.

```sql
select sl.pack_id, count(*) as REELS, cast(n.name as varchar(70)) as NOM,
       min(sl.datetime) as FIRST, max(sl.datetime) as LAST
  from sn_to_pack sp
       join sn_slot sl on sl.slot_id = sp.slot_id
       left join nom_pack p on p.pack_id = sl.pack_id
       left join nom_list n on n.nom_id = p.nom_id
 group by 1, 3 order by 2 desc;
```

Результат — 111 катушек на 7 партиях:

| Партия | Катушек | Номенклатура |
|---:|---:|---|
| 1368 | 60 | Конденсатор чип CC-0,1uF-±10%-50v-X7R-(0603) |
| 583 | 20 | Конденсатор чип CC-820pF-±1%-50v-NP0-(0603) |
| 1223 | 10 | Конденсатор чип CC-4,7uF-±10%-50v-X5R-(0805) |
| 5628 | 9 | Конденсатор чип CC-10pF-±5%-50v-NP0-(0603) |
| 5626 | 8 | SLO01-NO/NC-P-P18 |
| 171 | 3 | Резистор чип RC-0402-3k-±5% |
| 1225 | 1 | Конденсатор чип CC-1uF-±10%-50v-X7R-(0805) |

### 4.3 Какой `item_code` уходил в склад

```sql
select cast(name as varchar(60)) as SMD_NAME
  from nom_list_name_create_short((select p.nom_id from nom_pack p where p.pack_id = 1368));
```

Результат: **`0.1UF_0603`** — подтверждает, что в склад отдавалось короткое SMD-имя.

### 4.4 Атрибуты катушек почти везде пустые

```sql
select count(*) as REELS,
       sum(iif(p.man_kod is null, 1, 0))      as NO_MANKOD,
       sum(iif(p.manufacturer is null, 1, 0)) as NO_BRAND,
       sum(iif(p.pack_cnt is null, 1, 0))     as NO_CNT
  from sn_to_pack sp
       join sn_slot sl on sl.slot_id = sp.slot_id
       left join nom_pack p on p.pack_id = sl.pack_id;
```

Результат: **111 катушек, из них у 102 пусты все три поля**, которые код отправляет как
`reel_partnumber`, `reel_brand`, `reel_quantity`. Заполнены только у партии 5628
(`MAN_KOD = TEST00001`, изготовитель 1157, количество 1000) — по виду тестовая заливка.

### 4.5 Идентификаторы склада в HiTek не сохраняются

В коде результат отбрасывается — `uCatalogEdit.cpp:3205`:

```cpp
String ReelId = Stor->AddReel(reel);   // локальная переменная, дальше не используется
```

Подтверждение по схеме: **в базе нет ни одной колонки, связанной с reel**
(поиск по имени колонки `reel` — пусто). Сопоставить катушку HiTek с записью склада
можно только по тексту серийника `RLSN…`.

### 4.6 Смежные механизмы не задействованы

```sql
select (select count(*) from mac_list)          as MAC_ALL,
       (select count(*) from sn_to_route)       as SN_TO_ROUTE,
       (select count(*) from sn_note)           as SN_NOTE,
       (select count(*) from doc_item_sn_list)  as DOC_ITEM_SN
  from rdb$database;
```

Результат: **все нули** — серийники дальше по маршрутам, документам и MAC-адресам
не использовались.

Ещё деталь: два первых серийника (`RLSN0000000001`, `RLSN0000000002`, 29.01.2024)
сгенерированы, но к партиям не привязаны — прерванные первые пробы:

```sql
select s.sn_text, s.times from sn_list s
 where not exists (select 1 from sn_to_pack p where p.sn_text = s.sn_text)
 order by s.times;
```

---

## 5. Выводы и слабые места

**Интеграция реально работала**, но недолго и в опытном режиме: два месяца
(29.01–20.03.2024), 113 катушек на 7 партиях, преимущественно чип-конденсаторы,
атрибуты партий в большинстве случаев не заполнялись.

Что стоит учитывать при возврате к этой теме:

1. **Адрес и учётные данные захардкожены** (`uCatalogEdit.cpp:577`), не в `htmain.ini`
   и не в БД — смена адреса склада требует пересборки.
2. **Токен не переполучается по ошибке.** Комментарий в заголовке (`StorageSolutions.h:223`)
   прямо описывает ответ `err="4" invalidaccesstoken`, но код делает повторный `Login()`
   только при пустом токене; реакции на код 4 нет.
3. **Параметры подставляются в URL без экранирования** — `item_code` вида
   `R0805_680OM_5%` (пример из документации в заголовке) содержит `%`.
4. **Нет обратной связи**: идентификаторы `item_id`/`reel_id` не сохраняются, повторная
   регистрация той же катушки ничем не блокируется на стороне HiTek.
5. `AddItem`/`AddReel` объявлены как `String`, но в ветке ошибки делают `return -1`
   (неявное преобразование целого в строку).

## 6. Как проверить, жив ли склад сегодня

```bash
curl -s "http://192.168.11.10:8081/?f=login&username=INNER&password=INNER"
# ожидается: <resp f="login" ... err="0" errdesc="done"><out><token>…</token></out></resp>
```

Дальше с полученным токеном:
`curl -s "http://192.168.11.10:8081/?f=item_get&item_code=0.1UF_0603&tkn=<TOKEN>"`.

Адрес — из кода, актуальность на сегодня не проверялась.
