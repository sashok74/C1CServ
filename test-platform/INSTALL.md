# Установка тестовой платформы

Разворачивает весь стек — **C1CServ + мок-1С + fb-port + MongoDB** — на одной машине.
1С эмулируется моком, запись идёт в **тестовую копию** базы HiTek (Firebird).

Проверено на Debian 12 (bookworm): Node.js 20.20, MongoDB 7.0, Firebird-клиент 3.0,
сервер Firebird 6 (совместим с 5). Ручная установка — ~40 минут, из них ~30 занимает apt.

Документ рассчитан на установку **в любом окружении**. Раздел 1 — короткий путь для
инфраструктуры hitek-pro (ansible); разделы 2–5 от неё не зависят.

---

## 0. Что нужно до начала

| Что | Требование |
|---|---|
| Машина под платформу | чистый Debian 12, 4 ГБ RAM, 20 ГБ диска, root-доступ, выход в интернет (apt, github.com) |
| Сервер Firebird с **копией** базы HiTek | версия 3.0+; нужен сетевой доступ с машины платформы; понадобятся хост, путь/алиас базы и пароль SYSDBA |
| Пароль MongoDB | придумываете сами при установке (раздел 2.4) |
| Исходники | `https://github.com/sashok74/C1CServ` и `https://github.com/sashok74/fb-port` |

Обозначения ниже: `<FB_HOST>` — хост Firebird, `<FB_DB>` — путь или алиас **тестовой копии**,
`<SYSDBA_PWD>` — её пароль SYSDBA, `<MONGO_PWD>` — пароль, который вы задаёте сами.

> ⚠️ **Никогда не указывайте боевую базу.** Платформа выполняет процедуры экспорта, которые
> пишут данные. Сделайте копию (`gbak -b` + `gbak -c`) и работайте только с ней.
> Раздел 2.10 добавляет в копию процедуры выгрузки; сервис при старте проверяет, что имя
> базы совпадает с `EXPECTED_DB_SUFFIX` — задайте туда имя файла копии.

---

## 1. Путь А — ansible (только для инфраструктуры hitek-pro)

```bash
ssh raa@ansible-ctl && cd /opt/infra-ansible

# основной контейнер c1-test (vmid 143, 192.168.7.143):
sudo ansible-playbook playbooks/services/c1-test.yml

# ЛИБО одноразовый контейнер для проверки чистой установки (vmid 943, 192.168.7.243):
sudo ansible-playbook playbooks/infra/test-lxc.yml -e "service=c1-test"
sudo ansible-playbook playbooks/services/c1-test.yml -e target_host=test-c1-test
# удалить одноразовый:
sudo ansible-playbook playbooks/infra/test-lxc.yml -e "service=c1-test state=absent"
```

Плейбук делает всё из разделов 2 и 3 и берёт секреты из vault
(`vault_c1_test_mongo_password`, `vault_firebird5_sysdba_password`), а набор данных
мока — из `roles/c1_test/files/seed-data.tar.gz`. Дальше — сразу раздел 4.

**В любом другом окружении** этот раздел пропускается: идите в раздел 2.

---

## 2. Путь Б — ручная установка (любое окружение)

Подставляйте свои `<FB_HOST>`, `<FB_DB>`, `<SYSDBA_PWD>` и выбранный `<MONGO_PWD>`.
Все команды — от root на машине платформы.

### Шаг 2.0. Подготовка машины

Зайти на машину под root (`ssh root@<хост>` или `ssh <user>@<хост>` + `sudo -i`).

Проверка: `cat /etc/debian_version` → `12.x`; `ping -c1 <FB_HOST>` проходит.

> В инфраструктуре hitek-pro свежесозданный LXC пускает только пользователя `raa`:
> `ssh raa@ansible-ctl`, затем `sudo ssh raa@<IP>` и `sudo -i`.

### Шаг 2.1. Базовые пакеты

```bash
apt-get update
apt-get install -y git curl gnupg ca-certificates build-essential python3 rsync \
  libfbclient2 firebird-dev firebird3.0-utils
```

`firebird-dev` обязателен: драйвер fb-port ищет симлинк `libfbclient.so`.
На медленном хранилище шаг идёт 20–30 минут — это не зависание (dpkg висит в состоянии `D`,
но `cat /proc/<pid>/io` растёт).

Проверка: `ls -l /usr/lib/x86_64-linux-gnu/libfbclient.so` → симлинк на `libfbclient.so.2`.

### Шаг 2.2. Node.js 20 и yarn

```bash
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /usr/share/keyrings/nodesource.asc
echo "deb [signed-by=/usr/share/keyrings/nodesource.asc] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update && apt-get install -y nodejs
npm install -g yarn@1.22.22
```

Проверка: `node -v` → `v20.x`, `yarn -v` → `1.22.22`.

### Шаг 2.3. MongoDB 7.0

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc -o /usr/share/keyrings/mongodb-server-7.0.asc
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.asc] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
  > /etc/apt/sources.list.d/mongodb-org.list
apt-get update && apt-get install -y mongodb-org
systemctl enable --now mongod        # bindIp по умолчанию 127.0.0.1 — наружу не торчит
```

Проверка: `systemctl is-active mongod` → `active`.

### Шаг 2.4. Пользователи MongoDB

```bash
for d in c1_data_test c1_mock; do
  mongosh --quiet $d --eval \
    "db.createUser({user:'ind', pwd:'<MONGO_PWD>', roles:[{role:'readWrite', db:'$d'}]})"
done
```

Пользователь создаётся именно **в каждой базе** — C1CServ строит URI без `authSource`.

Проверка: `mongosh --quiet c1_mock --eval "db.getUser('ind') ? 'ok' : 'НЕТ'"` → `ok`.

### Шаг 2.5. Системный пользователь и каталоги

```bash
useradd -m -s /bin/bash c1test
mkdir -p /srv/c1-test/{mock-files,seed,logs,reports}
chown -R c1test:c1test /srv/c1-test
mkdir -p /opt/c1cserv /opt/fb-port && chown c1test:c1test /opt/c1cserv /opt/fb-port
```

### Шаг 2.6. Код и сборка

```bash
sudo -u c1test git clone https://github.com/sashok74/C1CServ.git /opt/c1cserv
sudo -u c1test git clone https://github.com/sashok74/fb-port.git /opt/fb-port

cd /opt/c1cserv && sudo -u c1test bash -lc "yarn install --frozen-lockfile && yarn build"

# fb-port: нативный модуль node-firebird-native-api 3.0.0 собирается только
# против заголовков Node <=20.11 (NAPI ABI-стабилен — работает на любом 20.x)
cd /opt/fb-port && sudo -u c1test bash -lc \
  "npm_config_target=20.11.1 yarn install --frozen-lockfile && yarn build"
```

Проверка: `ls -l /opt/c1cserv/build/server.js /opt/fb-port/build/server.js` — оба есть.

### Шаг 2.7. Файлы окружения `/etc/c1-test/`

```bash
mkdir -p /etc/c1-test

cat > /etc/c1-test/c1cserv.env <<'EOF'
PORT=3738
SERVER=0.0.0.0
MODE_ENV=test
DB_HOST=127.0.0.1
DB_PORT=3333
MONGODB_SERVER=127.0.0.1
MONGODB_USER=ind
MONGODB_PASSWORD=<MONGO_PWD>
MONGODB_BASE=c1_data_test
C1_WEBSERVER=127.0.0.1:8125
EOF

# только loopback: /query исполняет процедуры под SYSDBA без аутентификации
cat > /etc/c1-test/fb-port.env <<'EOF'
PORT=3333
SERVER=127.0.0.1
DB_PORT=3050
DB_HOST=<FB_HOST>
DB_NAME=<FB_DB>
DB_USER=SYSDBA
DB_PASSWORD=<SYSDBA_PWD>
CACHE_RES_TTL=3000
CACHE_PREPARE_TTL=60000
EOF

cat > /etc/c1-test/mock.env <<'EOF'
MOCK_PORT=8125
MOCK_BIND=0.0.0.0
MOCK_FILES_DIR=/srv/c1-test/mock-files
MOCK_LOG_DIR=/srv/c1-test/logs
MOCK_MONGO_URI=mongodb://ind:<MONGO_PWD>@127.0.0.1:27017/c1_mock?authSource=c1_mock
MOCK_STOCK_CNT=100
MOCK_STOCK_RES=0
MOCK_STOCK_PRICE=0
MOCK_STOCK_STORAGE_GUID=
EOF

# окружение скриптов платформы
cat > /etc/c1-test/platform.env <<'EOF'
TEST_JOURNAL_URI=mongodb://ind:<MONGO_PWD>@127.0.0.1:27017/c1_data_test
SEED_DST_URI=mongodb://ind:<MONGO_PWD>@127.0.0.1:27017/c1_mock?authSource=c1_mock
MOCK_FILES_DIR=/srv/c1-test/mock-files
SEED_DIR=/srv/c1-test/seed
MOCK_LOG_DIR=/srv/c1-test/logs
RUN_DIR=/srv/c1-test/reports
FBPORT_URL=http://127.0.0.1:3333
C1CSERV_URL=http://127.0.0.1:3738
MOCK_URL=http://127.0.0.1:8125
MOCK_STOCK_CNT=100
MOCK_STOCK_STORAGE_GUID=
EXPECTED_DB_SUFFIX=<имя файла тестовой копии, например erp_base_api_c1.fdb>
EOF

chown root:c1test /etc/c1-test /etc/c1-test/*.env
chmod 0750 /etc/c1-test && chmod 0640 /etc/c1-test/*.env
```

`EXPECTED_DB_SUFFIX` — предохранитель: прогон не начнётся, если сервис смотрит не в ту базу.

Если у вас есть работающий C1CServ со своим журналом соответствий в MongoDB и вы хотите
взять оттуда данные для мока (раздел 3, вариант Б), добавьте туда же строку:
`SEED_SRC_URI=mongodb://<user>:<pwd>@<host>:27017/<база_журнала>?authSource=<база_журнала>`.

### Шаг 2.8. systemd-юниты

```bash
cat > /etc/systemd/system/fb-port.service <<'EOF'
[Unit]
Description=fb-port gateway to Firebird test copy
After=network-online.target
Wants=network-online.target
[Service]
User=c1test
WorkingDirectory=/opt/fb-port
EnvironmentFile=/etc/c1-test/fb-port.env
ExecStart=/usr/bin/node build/server.js
Restart=on-failure
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/c1-mock.service <<'EOF'
[Unit]
Description=mock 1C for C1CServ test platform
After=network-online.target mongod.service
Wants=network-online.target
[Service]
User=c1test
WorkingDirectory=/opt/c1cserv
EnvironmentFile=/etc/c1-test/mock.env
ExecStart=/usr/bin/node test-platform/mock-1c/server.js
Restart=on-failure
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/c1cserv-test.service <<'EOF'
[Unit]
Description=C1CServ (test instance)
After=network-online.target mongod.service fb-port.service c1-mock.service
Wants=network-online.target
[Service]
User=c1test
WorkingDirectory=/opt/c1cserv
EnvironmentFile=/etc/c1-test/c1cserv.env
ExecStart=/usr/bin/node build/server.js
Restart=on-failure
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now fb-port c1-mock c1cserv-test
```

### Шаг 2.9. Смоук установки

```bash
sleep 10                                                   # сервисам нужно время на старт
systemctl is-active mongod fb-port c1-mock c1cserv-test    # 4x active
curl -s http://127.0.0.1:8125/__health                     # {"status":"ok","mongo":"ok",...}
curl -s http://127.0.0.1:3738/                             # {"message":"Hello World!!!"}
curl -s http://127.0.0.1:3738/test_db | grep -o '<имя файла тестовой копии>'
# ^ ОБЯЗАН вернуть имя ВАШЕЙ тестовой копии (то же, что в EXPECTED_DB_SUFFIX).
#   Если вернулось имя другой базы — остановитесь и исправьте fb-port.env.
```

Пустой ответ curl сразу после `enable --now` — сервисы ещё поднимаются, повторить через 10 c.
Если юнит не `active`: `journalctl -u <юнит> -n 30`.

### Шаг 2.10. Процедуры в тестовой копии базы

В копию нужно доложить процедуры выгрузки (и, при необходимости, исправления). SQL лежит
в репозитории: `/opt/c1cserv/test-platform/sql/` — там же `README.md` с описанием, какой
файл зачем и нужен ли он вам.

```bash
cd /opt/c1cserv/test-platform/sql
export ISC_USER=SYSDBA ISC_PASSWORD='<SYSDBA_PWD>'

# нужен, только если в копии урезан реестр MET$ (см. sql/README.md):
isql -q -bail -i 00-gateway-shim.sql        <FB_HOST>:<FB_DB>
# исправления дефектов (желательно: без него повторный экспорт заказа падает):
isql -q -bail -i 01-prod-fix-candidates.sql <FB_HOST>:<FB_DB>
# процедуры выгрузки в 1С (нужны для /exp2/v1/*):
isql -q -bail -i 02-exp2-export.sql         <FB_HOST>:<FB_DB>
```

Проверка: `curl -s http://127.0.0.1:3738/exp2/v1/state` → все источники `"доступна":true`.

Если Firebird-сервер на другой машине и `isql` там удобнее — скопируйте туда каталог `sql/`
и выполните локально. **После каждого пересоздания копии применять заново.**

---

## 3. Данные для мока 1С

Все скрипты платформы запускаются от `c1test` с окружением из `platform.env`. Объявите
функцию один раз (она используется и в разделе 4):

```bash
c1run() { sudo -u c1test bash -c "set -a; . /etc/c1-test/platform.env; set +a; cd /opt/c1cserv && $*"; }
```

Дальше — один из двух вариантов.

### Вариант А (по умолчанию): синтетический набор, данные не нужны

Генератор создаёт заказы, контрагентов, номенклатуру, группы, единицы, склад и
спецификации сам — **никаких внешних данных и доступов не требуется**:

```bash
c1run 'node test-platform/scripts/gen-synthetic.js'
```

Затем допишите в `/etc/c1-test/mock.env` и `/etc/c1-test/platform.env` GUID склада из
синтетического набора (без него мок не сможет синтезировать остатки):

```
MOCK_STOCK_STORAGE_GUID=5e570006-0000-4000-9000-000000000001
```

и перезапустите мок: `systemctl restart c1-mock`.

Проверка: `ls /opt/c1cserv/test-platform/scenarios/order-synthetic.json` — файл есть.
Этого достаточно, чтобы перейти к разделу 4 и получить зелёный прогон.

### Вариант Б (опционально): исторические данные из вашего журнала C1CServ

Имеет смысл, если у вас уже работает C1CServ и в MongoDB накоплен журнал соответствий:
тогда мок будет отдавать **реальные исторические ответы 1С**.

```bash
# 1. выгрузить журнал в файлы и залить в c1_mock (нужен SEED_SRC_URI в platform.env)
c1run 'node test-platform/scripts/seed-mock.js --all'

# 2. выбрать связный заказ и создать сценарий
c1run 'node test-platform/scripts/pick-order.js --auto'
```

`pick-order.js` печатает «дыры замыкания» — ссылки на объекты, которых в журнале нет.
Это нормально: мок ответит на них 404, verify пометит `warn`.

Если набор уже выгружен ранее в `SEED_DIR` (каталог `/srv/c1-test/seed`), залить его без
похода в источник: `c1run 'node test-platform/scripts/seed-mock.js'`.

> В инфраструктуре hitek-pro готовый набор поставляется с ansible-ролью
> (`roles/c1_test/files/seed-data.tar.gz`) и заливается автоматически (таск `seed`);
> пересеять — `ansible-playbook playbooks/services/c1-test.yml --tags seed`, принудительно —
> предварительно `mongosh --quiet c1_mock --eval "db.dropDatabase()"`.

---

## 4. Запуск тестов и проверка результатов

### 4.1. Нужно ли пересоздавать копию базы

«Сброс» = восстановить копию из бэкапа заново + применить SQL из `test-platform/sql/`
(раздел 2.10) + очистить журнал `c1_data_test` + перезапустить сервисы.

- **После свежей установки сброс не нужен** — копия пригодна.
- `order-synthetic` идемпотентен (после `01-prod-fix-candidates.sql`): повторные прогоны
  зелёные без сброса.
- `order-basic` в «грязной» копии может упасть на повторном экспорте того же заказа —
  перед ним сброс делать стоит.

Вручную:

```bash
# на сервере Firebird: восстановить копию из бэкапа (перед этим остановить fb-port,
# иначе активные подключения не дадут перезаписать файл)
gbak -b -g <FB_HOST>:<исходная_база> /tmp/hitek.fbk
gbak -c -rep /tmp/hitek.fbk <FB_HOST>:<FB_DB>
# затем заново применить SQL из test-platform/sql/ (раздел 2.10)
```

> В инфраструктуре hitek-pro всё это делает один плейбук:
> `sudo ansible-playbook playbooks/services/c1-test-reset.yml` (с Windows-станции —
> `.\test-platform\scripts\win\reset.ps1`). ⚠️ Копия базы там **одна на все контейнеры**,
> и сброс оборвёт прогон, идущий на соседнем — согласуйте перед запуском.

### 4.2. Запуск

```bash
# (c1run — функция из раздела 3)
c1run 'node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-synthetic.json'
c1run 'node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-basic.json'
```

`run-all` чистит журнал (`--force-reset`), прогоняет сценарий, запускает verify и снимает
выгрузку в 1С (раздел 5). Код возврата: `0` — все проверки pass/known-issue; `≠0` — есть
fail или ошибки импорта.

Обёртки для Windows-станции (`win/run-test.ps1`, `win/gen-synthetic.ps1`) рассчитаны на
инфраструктуру hitek-pro: они ходят по ssh на `192.168.7.143` и вызывают ansible-плейбук
сброса. В другом окружении задайте свой хост параметром `-TestHost` и используйте
`-NoReset`, либо запускайте команды выше прямо на машине платформы.

### 4.3. Проверить результат последнего прогона

Каждый прогон создаёт `/srv/c1-test/reports/run-<время>/` с тремя файлами: `run.json`
(что отправляли и что ответил C1CServ), `report.json` (все проверки), `report.md` (сводка).

```bash
LAST=$(ls -1 /srv/c1-test/reports | grep '^run-' | tail -1)

# 1) сводка: счётчики + таблица всех не-pass проверок
cat /srv/c1-test/reports/$LAST/report.md

# 2) счётчики — главный критерий приёмки fail == 0
python3 -c "import json;print(json.load(open('/srv/c1-test/reports/$LAST/report.json'))['counts'])"

# 3) ошибки самого импорта (C1CServ прячет их в теле HTTP 201)
python3 -c "import json;d=json.load(open('/srv/c1-test/reports/$LAST/run.json'));print('errors:',len(d['errors']));[print(e) for e in d['errors']]"
```

Статусы: **pass** — совпало; **fail** — расхождение (тест провален); **warn** — ожидаемое
отклонение (например, 404 на исторические «дыры»); **known-issue** — задокументированный
дефект системы.

С Windows-станции отчёты копируются в `.\reports\run-<время>\` после каждого
`run-test.ps1` / `gen-synthetic.ps1`.

### 4.4. Сводка по всем прогонам

```bash
for d in /srv/c1-test/reports/run-*/; do
  printf '%s  ' "$(basename $d)"
  python3 -c "import json;print(json.load(open('$d/report.json'))['counts'])" 2>/dev/null \
    || echo "(нет report.json)"
done
```

### 4.5. Эталонные результаты

**Критерий приёмки обоих сценариев: `fail = 0` и `errors: 0` в `run.json`.**

| Сценарий | Ожидание |
|---|---|
| `order-synthetic` (вариант А, только синтетика) | **92 pass / 0 fail / 0 warn / 0 known-issue** |
| `order-synthetic` (вариант Б, `c1_mock` засеян историей) | **93 pass / 0 fail** — на одну проверку больше |
| `order-synthetic` повторно, без сброса | те же числа, 0 fail — проверка идемпотентности повторного экспорта |
| `order-basic` (только вариант Б, после сброса) | **0 fail**; на эталонной установке было 108 pass / 6 warn. Абсолютные числа зависят от заказа, который выбрал `pick-order.js --auto`, и числа «дыр» в исторических данных — сверять надо `fail`, а не сумму |

Если есть `fail` — смотреть таблицу не-pass в `report.md`, ответы сервиса в `run.json`
(`err.errCode`) и журналы: `journalctl -u c1cserv-test -u fb-port -u c1-mock`.

---

## 5. Выгрузка в 1С: как посмотреть результат глазами

Прогон не только импортирует данные из мока 1С, но и **снимает обратную выгрузку**
HiTek → 1С (маршруты `/exp2/v1/*`, см. `c1serv_doc/EXP2_API.md`). Снимок кладётся
рядом с отчётом прогона:

```
/srv/c1-test/reports/run-<время>/export/
├── export.md          ← ЧИТАТЬ ЭТО: документы, спецификации, номенклатура таблицами
├── requirements.json  ← сырые ответы сервиса, как их получит 1С
├── transfers.json
├── specifications.json
├── nomenclature.json
├── storages.json
└── state.json
```

### Посмотреть

```bash
LAST=$(ls -1 /srv/c1-test/reports | grep '^run-' | tail -1)
cat /srv/c1-test/reports/$LAST/export/export.md
```

С Windows-станции файл приезжает сам вместе с отчётом (`run-test.ps1` /
`gen-synthetic.ps1`) — открыть `.\reports\run-<время>\export\export.md`.

### Что в `export.md`

- **Сводка** — сколько чего выгрузилось (номенклатура, склады, спецификации, документы).
- **Требование-накладная** — документ целиком: изделие запуска (то самое субконто
  «Продукция» для счёта 20.01), склад, комментарий и таблица списанных материалов
  с кодами 1С и количествами.
- **Перемещение товаров** — откуда, куда, что и сколько.
- **Спецификации** — первые две расписаны построчно (продукция + состав).
- **Номенклатура** — первые 15 позиций и **отдельный список тех, что требуют ручного
  разбора** (нет кода 1С или кодов несколько) — их нельзя грузить в 1С молча.
- **Складские единицы** — с числом движений и датой последнего, чтобы видеть живые.

### Снять выгрузку отдельно, без прогона теста

```bash
c1run 'node test-platform/scripts/export-dump.js --out /srv/c1-test/reports/manual'
c1run 'node test-platform/scripts/export-dump.js --out /srv/c1-test/reports/manual --full'
```

`--full` листает все страницы (вся номенклатура и все 2 719 спецификаций);
без него берётся обзорный срез. В составе прогона можно попросить полный снимок:
`run-all.js --scenario … --full-export`.

### Чего ожидать по объёму

Справочники выгружаются целиком, а **документов будет мало — по одному**: в базе
всего один отпуск в производство с движениями и одно перемещение. Это состояние
данных HiTek, а не дефект выгрузки (разбор — `c1serv_doc/EXP2_1C_BUH.md` §10.1).
