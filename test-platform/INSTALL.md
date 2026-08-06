# Установка тестовой платформы на пустой контейнер

Разворачивает весь стек — **C1CServ + мок-1С + fb-port + MongoDB** — в одном пустом LXC.
Запись идёт в тестовый клон базы HiTek (`erp_base_api_c1` на firebird5.home.lan), 1С эмулируется моком.

Проверено на Debian 12 (bookworm): Node.js 20.20, MongoDB 7.0, Firebird-клиент 3.0,
сервер Firebird 6. Ручная установка занимает ~40 минут, из них ~30 — apt.

---

## 0. Что нужно до начала

Всё лежит в infra-репозитории на ansible-ctl (`/opt/infra-ansible`), команды ниже — оттуда.

| Что | Как получить / проверить |
|---|---|
| Доступ к управляющему хосту | `ssh raa@ansible-ctl`, беспарольный sudo |
| Тестовый клон `erp_base_api_c1.fdb` на firebird5.home.lan (алиасы `erp_base_api_c1`, `db_hitek_api_c1`) | создать/пересоздать: `sudo ansible-playbook playbooks/services/firebird5-erp-api-c1.yml -e c1_clone_confirm=RECLONE-ERP-BASE-API-C1` |
| `<MONGO_PWD>` — пароль mongo-пользователя `ind` | `sudo ansible-vault view inventory/group_vars/all/vault_c1_test.yml` → `vault_c1_test_mongo_password` |
| `<SYSDBA_PWD>` — пароль SYSDBA на firebird5 | `sudo ansible-vault view group_vars/all/vault.yml \| grep firebird5_sysdba` |
| Набор данных мока `seed-data.tar.gz` (снимок прод-журнала) | уже в репо: `roles/c1_test/files/seed-data.tar.gz` |

Доступ к прод-журналу Mongo (192.168.7.104) для установки **не нужен** — он требуется
только чтобы обновить набор (`seed-mock.js --all`, см. конец раздела 3).

---

## 1. Путь А — штатная установка ansible (рекомендуется)

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

Плейбук делает всё из разделов 2 и 3 (LXC, пакеты, MongoDB, пользователи, репозитории,
сборка, env, systemd, распаковка набора, засев `c1_mock`, генерация обоих сценариев).
Дальше — сразу раздел 4.

---

## 2. Путь Б — ручная установка (пустой Debian 12 LXC)

Шаги в точности повторяют роль `roles/c1_test`. Везде подставить `<MONGO_PWD>` и
`<SYSDBA_PWD>` из раздела 0.

### Шаг 2.0. Войти в контейнер

```bash
ssh raa@ansible-ctl
sudo ssh raa@<IP-контейнера>   # ключ root'а ansible-ctl авторизован для raa
sudo -i                        # дальше всё от root
```

В **свежесозданном** контейнере авторизован только `raa` — `ssh root@<IP>` не пустит
(в давно развёрнутом `c1-test` работает и `root@`).
Проверка: `cat /etc/debian_version` → `12.x`.

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
DB_HOST=firebird5.home.lan
DB_NAME=/var/lib/firebird/erp_base_api_c1.fdb
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
EXPECTED_DB_SUFFIX=erp_base_api_c1.fdb
EOF

chown root:c1test /etc/c1-test /etc/c1-test/*.env
chmod 0750 /etc/c1-test && chmod 0640 /etc/c1-test/*.env
```

Для обновления набора данных из прод-журнала (только `seed-mock.js --all`, при установке
не нужно) в `platform.env` добавляется строка
`SEED_SRC_URI=mongodb://ind:<PROD_PWD>@192.168.7.104:27017/c1_data?authSource=c1_data`,
где `<PROD_PWD>` — `vault_c1_test_prod_mongo_password` из того же vault-файла.

### Шаг 2.8. systemd-юниты

```bash
cat > /etc/systemd/system/fb-port.service <<'EOF'
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
curl -s http://127.0.0.1:3738/test_db | grep -o erp_base_api_c1.fdb
# ^ ОБЯЗАН вернуть erp_base_api_c1.fdb — иначе сервис смотрит не в тестовую базу
```

Пустой ответ curl сразу после `enable --now` — сервисы ещё поднимаются, повторить через 10 c.
Если юнит не `active`: `journalctl -u <юнит> -n 30`.

---

## 3. Засев данных мока (один раз после установки)

При пути А выполняется автоматически (таск `seed`) — этот раздел только для пути Б.

Доставить набор на контейнер (**с ansible-ctl**; в свежем контейнере копировать под `raa`):

```bash
sudo scp /opt/infra-ansible/roles/c1_test/files/seed-data.tar.gz raa@<IP>:/tmp/
# либо, если хост есть в inventory:
cd /opt/infra-ansible && sudo ansible <host> -m copy \
  -a "src=roles/c1_test/files/seed-data.tar.gz dest=/tmp/"
```

Дальше **в контейнере от root**:

```bash
tar xzf /tmp/seed-data.tar.gz -C /srv/c1-test/seed && chown -R c1test:c1test /srv/c1-test/seed

# все скрипты платформы запускаются от c1test с окружением из platform.env:
c1run() { sudo -u c1test bash -c "set -a; . /etc/c1-test/platform.env; set +a; cd /opt/c1cserv && $*"; }

c1run 'node test-platform/scripts/seed-mock.js'           # залить набор в c1_mock
c1run 'node test-platform/scripts/pick-order.js --auto'   # исторический сценарий
c1run 'node test-platform/scripts/gen-synthetic.js'       # синтетический сценарий
```

`pick-order.js` печатает «дыры замыкания» (ссылки на объекты, которых нет в историческом
журнале) — это нормально, verify пометит их `warn`.

Проверка: `ls /opt/c1cserv/test-platform/scenarios/` → есть `order-basic.json` и
`order-synthetic.json`.

Пересеять мок заново (плейбук идемпотентен — работает, только если `c1_mock` пуста):

```bash
cd /opt/infra-ansible && sudo ansible-playbook playbooks/services/c1-test.yml --tags seed
# принудительно: сначала  mongosh --quiet c1_mock --eval "db.dropDatabase()"
```

Обновить сам комплектный набор (нужен доступ к прод-журналу и `SEED_SRC_URI` в `platform.env`):
`c1run 'node test-platform/scripts/seed-mock.js --all'`, затем
`tar czf seed-data.tar.gz -C /srv/c1-test/seed .` → `roles/c1_test/files/` в infra-репо.

---

## 4. Запуск тестов и проверка результатов

### 4.1. Нужен ли полный сброс базы

Сброс (`c1-test-reset.yml`) = переклон `erp_base_api_c1` + шим + фикс-кандидаты + очистка
журнала + рестарт сервисов.

- **После свежей установки сброс не нужен** — клон уже пригоден.
- `order-synthetic` идемпотентен (фикс Ф2): повторные прогоны зелёные без сброса.
- `order-basic` в грязном клоне может упасть на повторном экспорте того же заказа — перед
  ним сброс делать стоит.

```bash
# с ansible-ctl:
cd /opt/infra-ansible && sudo ansible-playbook playbooks/services/c1-test-reset.yml
# с Windows-станции:  .\test-platform\scripts\win\reset.ps1
```

> **Клон базы один на все контейнеры.** Сброс оборвёт прогон, идущий на соседнем
> контейнере — согласовать перед запуском.

### 4.2. Запуск на контейнере

```bash
# (c1run — функция из раздела 3)
c1run 'node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-synthetic.json'
c1run 'node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-basic.json'
```

`run-all` чистит журнал (`--force-reset`), прогоняет сценарий и запускает verify.
Код возврата: `0` — все проверки pass/known-issue; `≠0` — есть fail или ошибки импорта.

С Windows-станции (нужен ssh-ключ на контейнер; по умолчанию `-TestHost 192.168.7.143`):

```powershell
.\test-platform\scripts\win\run-test.ps1        # исторический, со сбросом
.\test-platform\scripts\win\gen-synthetic.ps1   # синтетика: генерация + сброс + прогон
```

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
| `order-synthetic` | **93 pass / 0 fail / 0 warn / 0 known-issue** — набор детерминированный, числа обязаны совпасть |
| `order-synthetic` повторно, без сброса | те же 93 pass / 0 fail — проверка идемпотентности повторного экспорта |
| `order-basic` (после сброса) | **0 fail**; на эталонной установке было 108 pass / 6 warn. Абсолютные числа зависят от заказа, который выбрал `pick-order.js --auto`, и числа «дыр» в исторических данных — сверять надо `fail`, а не сумму |

Если есть `fail` — смотреть таблицу не-pass в `report.md`, ответы сервиса в `run.json`
(`err.errCode`) и журналы: `journalctl -u c1cserv-test -u fb-port -u c1-mock`.
