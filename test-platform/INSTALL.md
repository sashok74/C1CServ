# Установка тестовой платформы на пустой контейнер — по шагам

Документ описывает развёртывание всего стека платформы (C1CServ + мок-1С + fb-port +
MongoDB) на **абсолютно пустой LXC-контейнер** и проверку результатов тестов.

Проверено на: Debian 12 (bookworm), Node.js 20, MongoDB 7.0, Firebird-клиент 3.0.11,
сервер Firebird 6 на firebird5.home.lan.

---

## 0. Предусловия (один раз, вне контейнера)

| Что | Где | Как проверить |
|---|---|---|
| Тестовый клон базы `erp_base_api_c1.fdb` (+ алиасы `erp_base_api_c1`, `db_hitek_api_c1`) | firebird5.home.lan | `isql localhost:erp_base_api_c1` → `SHOW DATABASE;` |
| Секреты в vault infra-репо | ansible-ctl:/opt/infra-ansible | `inventory/group_vars/all/vault_c1_test.yml`: `vault_c1_test_mongo_password`, `vault_c1_test_prod_mongo_password`; `group_vars/all/vault.yml`: `vault_firebird5_sysdba_password` |
| Готовый набор данных мока | распространяется с ролью: `roles/c1_test/files/seed-data.tar.gz` (снимок прод-журнала от 2026-08-06) | входит в infra-репо — отдельно ничего не нужно |

Прод-журнал Mongo (LXC 104) для установки **не требуется** — он нужен только чтобы
обновить комплектный набор: `node test-platform/scripts/seed-mock.js --all` при
доступе к проду, затем перепаковать `roles/c1_test/files/seed-data.tar.gz`.

Клон создаётся/пересоздаётся плейбуком (шим и фикс-кандидаты применяются им же):

```bash
ssh raa@ansible-ctl
cd /opt/infra-ansible
sudo ansible-playbook playbooks/services/firebird5-erp-api-c1.yml -e c1_clone_confirm=RECLONE-ERP-BASE-API-C1
```

---

## 1. Путь А — штатная установка (ansible, рекомендуется)

Весь контейнер создаётся и настраивается одним плейбуком:

```bash
ssh raa@ansible-ctl
cd /opt/infra-ansible

# основной контейнер c1-test (vmid 143, 192.168.7.143):
sudo ansible-playbook playbooks/services/c1-test.yml

# ЛИБО одноразовый контейнер для проверки чистой установки (vmid 943, .243):
sudo ansible-playbook playbooks/infra/test-lxc.yml -e "service=c1-test"
sudo ansible-playbook playbooks/services/c1-test.yml -e target_host=test-c1-test
# удалить одноразовый: sudo ansible-playbook playbooks/infra/test-lxc.yml -e "service=c1-test state=absent"
```

Плейбук делает всё из разделов 2 и 3 автоматически (создание LXC, пакеты, MongoDB,
пользователи, клонирование репозиториев, сборка, env, systemd, **распаковка комплектного
набора, засев `c1_mock` и генерация обоих сценариев**). Чистая установка занимает
~50 минут (apt + две сборки yarn). Дальше — сразу раздел 4 (тесты).

---

## 2. Путь Б — ручная установка всех модулей (пустой Debian 12 LXC)

Если ставить без ansible — шаги в точности повторяют роль `roles/c1_test`.

### Шаг 2.1. Базовые пакеты

```bash
apt-get update
apt-get install -y git curl gnupg ca-certificates build-essential python3 rsync \
  libfbclient2 firebird-dev firebird3.0-utils
```

`firebird-dev` обязателен: драйвер fb-port ищет симлинк `libfbclient.so`.

### Шаг 2.2. Node.js 20 и yarn

```bash
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /usr/share/keyrings/nodesource.asc
echo "deb [signed-by=/usr/share/keyrings/nodesource.asc] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update && apt-get install -y nodejs
npm install -g yarn@1.22.22
```

### Шаг 2.3. MongoDB 7.0

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc -o /usr/share/keyrings/mongodb-server-7.0.asc
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.asc] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
  > /etc/apt/sources.list.d/mongodb-org.list
apt-get update && apt-get install -y mongodb-org
systemctl enable --now mongod        # bindIp по умолчанию 127.0.0.1 — наружу не торчит
```

### Шаг 2.4. Пользователи MongoDB

Пароль — из vault (`vault_c1_test_mongo_password`), ниже обозначен `<MONGO_PWD>`:

```bash
mongosh --quiet c1_data_test --eval \
  "db.createUser({user:'ind', pwd:'<MONGO_PWD>', roles:[{role:'readWrite', db:'c1_data_test'}]})"
mongosh --quiet c1_mock --eval \
  "db.createUser({user:'ind', pwd:'<MONGO_PWD>', roles:[{role:'readWrite', db:'c1_mock'}]})"
```

Важно: юзер создаётся именно **в каждой базе** — C1CServ строит URI без `authSource`.

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

### Шаг 2.7. Файлы окружения `/etc/c1-test/` (mode 0640, root:c1test)

`c1cserv.env`:

```
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
```

`fb-port.env` (`<SYSDBA_PWD>` — из vault; только loopback — /query исполняет процедуры под SYSDBA):

```
PORT=3333
SERVER=127.0.0.1
DB_PORT=3050
DB_HOST=firebird5.home.lan
DB_NAME=/var/lib/firebird/erp_base_api_c1.fdb
DB_USER=SYSDBA
DB_PASSWORD=<SYSDBA_PWD>
CACHE_RES_TTL=3000
CACHE_PREPARE_TTL=60000
```

`mock.env`:

```
MOCK_PORT=8125
MOCK_BIND=0.0.0.0
MOCK_FILES_DIR=/srv/c1-test/mock-files
MOCK_LOG_DIR=/srv/c1-test/logs
MOCK_MONGO_URI=mongodb://ind:<MONGO_PWD>@127.0.0.1:27017/c1_mock?authSource=c1_mock
MOCK_STOCK_CNT=100
MOCK_STOCK_RES=0
MOCK_STOCK_PRICE=0
MOCK_STOCK_STORAGE_GUID=
```

`platform.env` (окружение скриптов; `<PROD_PWD>` — пароль ind прод-журнала):

```
TEST_JOURNAL_URI=mongodb://ind:<MONGO_PWD>@127.0.0.1:27017/c1_data_test
SEED_DST_URI=mongodb://ind:<MONGO_PWD>@127.0.0.1:27017/c1_mock?authSource=c1_mock
SEED_SRC_URI=mongodb://ind:<PROD_PWD>@192.168.7.104:27017/c1_data?authSource=c1_data
MOCK_FILES_DIR=/srv/c1-test/mock-files
SEED_DIR=/srv/c1-test/seed
MOCK_LOG_DIR=/srv/c1-test/logs
RUN_DIR=/srv/c1-test/reports
FBPORT_URL=http://127.0.0.1:3333
C1CSERV_URL=http://127.0.0.1:3738
MOCK_URL=http://127.0.0.1:8125
MOCK_STOCK_CNT=100
MOCK_STOCK_STORAGE_GUID=
EXPECTED_DB_SUFFIX=erp_base_api_c1.fdb
```

### Шаг 2.8. systemd-юниты

`/etc/systemd/system/fb-port.service`:

```
[Unit]
Description=fb-port gateway to Firebird test clone (erp_base_api_c1)
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
```

`c1-mock.service` — то же, но `WorkingDirectory=/opt/c1cserv`,
`EnvironmentFile=/etc/c1-test/mock.env`, `ExecStart=/usr/bin/node test-platform/mock-1c/server.js`,
`After=network-online.target mongod.service`.

`c1cserv-test.service` — `WorkingDirectory=/opt/c1cserv`,
`EnvironmentFile=/etc/c1-test/c1cserv.env`, `ExecStart=/usr/bin/node build/server.js`,
`After=network-online.target mongod.service fb-port.service c1-mock.service`.

```bash
systemctl daemon-reload
systemctl enable --now fb-port c1-mock c1cserv-test
```

### Шаг 2.9. Смоук установки

```bash
systemctl is-active mongod fb-port c1-mock c1cserv-test   # все active
curl -s http://127.0.0.1:8125/__health                     # {"status":"ok",...}
curl -s http://127.0.0.1:3738/                             # {"message":"Hello World!!!"}
curl -s http://127.0.0.1:3738/test_db | grep -o erp_base_api_c1.fdb
# ^ ОБЯЗАН вернуть erp_base_api_c1.fdb — иначе сервис смотрит не в тестовую базу
```

---

## 3. Засев данных мока (один раз после установки)

При установке путём А (ansible) этот раздел выполняется автоматически (таск `seed`).
Вручную (путь Б) — распаковать комплектный набор и выполнить три команды.

Все команды на контейнере выполняются так (окружение из platform.env):

```bash
sudo -u c1test bash -c 'set -a; . /etc/c1-test/platform.env; set +a; cd /opt/c1cserv && node <скрипт>'
```

```bash
# 3.0. (путь Б) доставить и распаковать комплектный набор.
#      Файл лежит в infra-репо на ansible-ctl:
#        /opt/infra-ansible/roles/c1_test/files/seed-data.tar.gz
#      Скопировать на контейнер (выполняется с ansible-ctl):
#        sudo scp /opt/infra-ansible/roles/c1_test/files/seed-data.tar.gz root@<IP>:/tmp/
tar xzf /tmp/seed-data.tar.gz -C /srv/c1-test/seed && chown -R c1test:c1test /srv/c1-test/seed

# 3.1. Залить набор в c1_mock (по умолчанию — из /srv/c1-test/seed, прод не нужен)
node test-platform/scripts/seed-mock.js

# 3.2. Исторический сценарий: выбрать связный заказ
node test-platform/scripts/pick-order.js --auto

# 3.3. Синтетический сценарий: 3 заказа с объектами, которых нет в базе
node test-platform/scripts/gen-synthetic.js
```

Пересеять мок заново (например, после обновления набора) — тем же плейбуком:

```bash
cd /opt/infra-ansible && sudo ansible-playbook playbooks/services/c1-test.yml --tags seed
# таск идемпотентный: работает, только если база c1_mock пуста.
# Принудительно: сначала  mongosh --quiet c1_mock --eval "db.dropDatabase()"
```

Обновление комплектного набора (нужен доступ к прод-журналу):
`node test-platform/scripts/seed-mock.js --all`, затем перепаковать архив в infra-репо:
`tar czf seed-data.tar.gz -C /srv/c1-test/seed .` → `roles/c1_test/files/`.

---

## 4. Запуск тестов вручную и проверка результатов

### 4.1. Полный сброс базы (обязателен перед каждым прогоном)

Повторный экспорт в грязный клон без фиксов падает; сброс = переклон + шим +
фикс-кандидаты + очистка журнала + рестарт сервисов:

```bash
# с ansible-ctl:
cd /opt/infra-ansible && sudo ansible-playbook playbooks/services/c1-test-reset.yml
# с Windows-станции:  .\test-platform\scripts\win\reset.ps1
```

### 4.2. Запуск вручную (на контейнере)

```bash
# исторический сценарий:
node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-basic.json
# синтетический сценарий:
node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-synthetic.json
```

`run-all` сам чистит журнал (`--force-reset`), прогоняет сценарий и запускает verify.
Код возврата: `0` — все проверки pass/known-issue; `≠0` — есть fail или ошибки импорта.

С Windows-станции всё то же одной командой (сброс включён):

```powershell
.\test-platform\scripts\win\run-test.ps1                                   # исторический
.\test-platform\scripts\win\gen-synthetic.ps1                              # синтетика (ген+прогон)
```

### 4.3. Проверить результат ПОСЛЕДНЕГО теста

Каждый прогон создаёт каталог `/srv/c1-test/reports/run-<время>/` с тремя файлами:
`run.json` (что отправляли и что ответил C1CServ), `report.json` (все проверки),
`report.md` (человекочитаемая сводка).

```bash
LAST=$(ls -1 /srv/c1-test/reports | grep '^run-' | tail -1)

# 1) человекочитаемая сводка (счётчики + таблица всех не-pass проверок):
cat /srv/c1-test/reports/$LAST/report.md

# 2) только счётчики — главный критерий приёмки fail == 0:
python3 -c "import json;d=json.load(open('/srv/c1-test/reports/$LAST/report.json'));print(d['counts'])"

# 3) были ли ошибки самого импорта (C1CServ прячет их в теле HTTP 201):
python3 -c "import json;d=json.load(open('/srv/c1-test/reports/$LAST/run.json'));print('errors:',len(d['errors']));[print(e) for e in d['errors']]"
```

Статусы: **pass** — совпало; **fail** — расхождение (тест провален); **warn** —
ожидаемое отклонение (например, 404 на исторические «дыры»); **known-issue** —
задокументированный дефект системы.

### 4.4. Проверить результаты ВСЕХ тестов

```bash
# сводная таблица по всем прогонам (имя каталога + счётчики):
for d in /srv/c1-test/reports/run-*/; do
  printf '%s  ' "$(basename $d)"
  python3 -c "import json,sys;print(json.load(open('$d/report.json'))['counts'])" 2>/dev/null || echo "(нет report.json)"
done

# найти прогоны, где есть провалы:
for d in /srv/c1-test/reports/run-*/; do
  python3 -c "
import json;c=json.load(open('$d/report.json'))['counts']
print('$(basename $d)', c) if c.get('fail',0) else None" 2>/dev/null
done
```

С Windows-станции отчёты копируются автоматически в `.\reports\run-<время>\`
после каждого `run-test.ps1` / `gen-synthetic.ps1` — там те же три файла.

### 4.5. Эталонные результаты (после установки должно получаться так)

**Критерий приёмки в обоих сценариях: `fail = 0` и `errors: 0` в `run.json`.**

| Сценарий | Ожидание |
|---|---|
| `order-synthetic` (после сброса) | **93 pass / 0 fail / 0 warn / 0 known-issue** — набор детерминированный, числа обязаны совпасть |
| `order-synthetic` повторно, **без сброса** | те же 93 pass / 0 fail — проверка идемпотентности повторного экспорта |
| `order-basic` (после сброса) | **0 fail**; на эталонной установке было 108 pass / 6 warn. Абсолютные числа зависят от того, какой заказ выбрал `pick-order.js --auto` и сколько у него «дыр» в исторических данных — сверять надо `fail`, а не сумму |

Если есть `fail` — смотреть таблицу не-pass в `report.md`, ответы сервиса в
`run.json` (`err.errCode`) и журналы: `journalctl -u c1cserv-test -u fb-port -u c1-mock`.
