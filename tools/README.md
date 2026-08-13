# tools/

## `discover-stack.sh` — обследование хоста

Отвечает на вопрос «что из стека HiTek/1С стоит на этой машине и как настроено».
Ищет и описывает: **Firebird и базы HiTek**, **fb-port**, **C1CServ**, **MongoDB**.

Только чтение: ничего не ставит, не меняет и не перезапускает.

```bash
# на самом хосте
bash discover-stack.sh

# удалённо (рекомендуется под root — иначе часть данных не видна)
ssh <host> 'sudo bash -s' < tools/discover-stack.sh

# JSON вместо отчёта
ssh <host> 'sudo bash -s' < tools/discover-stack.sh -- --json

# сохранить оба файла на обследуемом хосте
ssh <host> 'sudo bash -s' < tools/discover-stack.sh -- --out /tmp/audit
```

### Что делает

| Шаг | Что выясняет |
|---|---|
| 1 | Паспорт хоста: ОС, ядро, LXC/ВМ, ресурсы, под кем запущен скрипт |
| 2 | Слушающие порты и профильные процессы; рабочие каталоги node-процессов |
| 3 | Firebird: **сервер или только клиент**, версия, пакеты, службы, `firebird.conf` (только параметры, отличные от умолчаний), алиасы из `databases.conf` |
| 4 | Все файлы баз, **опознание HiTek по схеме** (7 маркерных таблиц), для каждой базы: движок, число `EXP_*`/`EXP2_*`, счётчики заказов/номенклатуры/движений, кто подключён |
| 5 | fb-port: каталог, git-коммит, сборка, нативный модуль, `libfbclient`, конфиг, **на какую базу смотрит**, systemd/PM2, живость |
| 6 | C1CServ: то же + Mongo, адрес 1С и **фактическая база** через `GET /test_db` |
| 7 | MongoDB: версия, `bindIp`, авторизация, базы и коллекции со счётчиками |
| 8 | Сводка «кто на кого смотрит» |

Опознание сервисов идёт **по содержимому**, а не по имени каталога: fb-port — по
зависимости `node-firebird-driver-native`, C1CServ — по модулю `1cdata` и схемам
экспорта. У обоих проектов `package.json name` = `typescript_start`, поэтому по имени
их не различить.

Базу HiTek скрипт узнаёт по маркерным таблицам (`NOM_LIST`, `DOC_HEADER`, `BOM_LIST`,
`C1_LINKS`, `NOM_PACK`, `DOC_ITEMS`, `NOM_TRANS`), а не по имени файла — это отличает
боевую базу от копии, тестовой и чужой.

---

## То же самое вручную

Скрипт — это автоматизация команд ниже. Полезно, когда его нельзя скопировать на хост
(нет доступа, чужая машина, аудит «руками»). Порядок шагов тот же.

### Шаг 1–2. Что работает и где лежит

Начинать надо с процессов, а не с каталогов: так сразу видно и порты, и рабочие каталоги.

```bash
ss -tlnp | grep -E ':(3737|3738|3333|27017|3050)'      # кто слушает нужные порты
ps -eo pid,user,args | grep -E 'node|firebird|mongod' | grep -v grep

# по PID — каталог сервиса и переменные, с которыми он ЗАПУЩЕН (нужен root)
ls -l /proc/<PID>/cwd
tr '\0' '\n' < /proc/<PID>/environ | grep -E '^(PORT|SERVER|DB_|MONGODB_|C1_)'
```

`/proc/<PID>/environ` достовернее файла `.env`: **`dotenv` не перекрывает уже заданные
переменные**, поэтому при запуске через systemd (`EnvironmentFile=`) лежащий рядом `.env`
может не действовать вовсе.

### Шаг 3. Firebird: сервер или только клиент

```bash
dpkg -l | grep -i firebird                    # пакеты
ls -d /opt/firebird /usr/lib/firebird/* 2>/dev/null
isql -z </dev/null || /opt/firebird/bin/isql -z </dev/null   # версия
systemctl status firebird 2>/dev/null | head -3
pgrep -a -f 'firebird|fbguard'
```

**Сервер** — если есть процесс `firebird`/`fbguard` или слушается `:3050`.
Если их нет, а `isql`/`libfbclient` есть — это **только клиент**, база здесь не живёт.

Конфигурация (в tarball-установке лежит в `/opt/firebird`, в пакетной — в `/etc/firebird/<версия>`):

```bash
grep -vE '^\s*#|^\s*$' /opt/firebird/firebird.conf     # только заданные параметры
grep -vE '^\s*#|^\s*$' /opt/firebird/databases.conf    # алиасы: имя = путь
```

### Шаг 4. Найти базы и опознать HiTek

```bash
find /var/lib/firebird /mnt /srv -maxdepth 3 -name '*.fdb' -ls 2>/dev/null
```

Опознание — по схеме, а не по имени файла:

```bash
export ISC_USER=SYSDBA ISC_PASSWORD='<пароль>'
isql -q localhost:/var/lib/firebird/<база>.fdb <<'EOF'
set list on;
select
  (select rdb$get_context('SYSTEM','ENGINE_VERSION') from rdb$database) as ENGINE,
  (select count(*) from rdb$relations where rdb$relation_name in
     ('NOM_LIST','DOC_HEADER','BOM_LIST','C1_LINKS','NOM_PACK','DOC_ITEMS','NOM_TRANS')) as MARKERS,
  (select count(*) from rdb$procedures where rdb$procedure_name starting with 'EXP_')  as EXP_PROC,
  (select count(*) from rdb$procedures where rdb$procedure_name starting with 'EXP2_') as EXP2_PROC
from rdb$database;
EOF
```

`MARKERS = 7` — это база HiTek. Дальше масштаб и «кто подключён»:

```sql
select (select count(*) from c1_zakaz_h) as ZAKAZY,
       (select count(*) from nom_list)   as NOMENKLATURA,
       (select count(*) from nom_trans)  as DVIZHENIYA from rdb$database;

select mon$remote_address, mon$remote_process, mon$user
  from mon$attachments where mon$attachment_id <> current_connection;
```

Пароль SYSDBA обычно можно взять из `.env` найденного fb-port или из
`/etc/firebird/*/SYSDBA.password`.

### Шаг 5–6. Найти fb-port и C1CServ

Если процессы не запущены, каталоги ищутся по содержимому:

```bash
# fb-port — по зависимости от нативного драйвера Firebird
grep -rl 'node-firebird-driver-native' /opt/*/package.json /root/node/*/package.json 2>/dev/null

# C1CServ — по модулю обмена
ls -d /opt/*/src/modules/1cdata.ts /opt/*/build/modules/1cdata.js 2>/dev/null
```

Для каждого найденного каталога:

```bash
cd <каталог>
git -c safe.directory='*' log --oneline -1     # какая версия кода развёрнута
ls -l build/server.js                          # собран ли (иначе не запустится)
cat .env                                       # конфиг: порты и адреса
grep -rl "$PWD" /etc/systemd/system/*.service  # каким юнитом запускается
pm2 list                                       # в проде fb-port живёт под PM2
```

### Шаг 7. MongoDB

```bash
mongod --version | head -1
grep -E '^\s*(bindIp|port|authorization|dbPath)' /etc/mongod.conf
mongosh --quiet --eval 'db.adminCommand({listDatabases:1}).databases.forEach(d=>print(d.name))'
mongosh --quiet c1_data --eval 'db.getCollectionNames().forEach(c=>print(c, db.getCollection(c).countDocuments()))'
```

### Шаг 8. Проверить связи прикладным запросом

Конфиг показывает намерение, а эти три команды — что происходит на самом деле:

```bash
curl -s http://127.0.0.1:3738/test_db | grep -o '"DB_NAME":"[^"]*"'  # база, куда C1CServ реально пишет
curl -s http://127.0.0.1:3333/ProcList | head -c 200                  # живость fb-port
curl -s "http://<адрес-1С>/unf/hs/ht/get_measure/<GUID>"              # живость 1С
```

⚠️ **`ping` и «открытый порт» могут врать.** В сети с прозрачным прокси или
policy-routing TCP-соединение «устанавливается» с любым адресом и портом. Контроль:
пробейте заведомо несуществующий адрес той же подсети — если он тоже «отвечает»,
результаты бессмысленны, отвечает посредник. Достоверен только осмысленный
прикладной ответ.

### Пароль для опроса баз

Ищется автоматически в `.env` найденного fb-port и в `/etc/firebird/*/SYSDBA.password`.
Можно задать явно:

```bash
ssh <host> 'sudo ISC_PASSWORD=... bash -s' < tools/discover-stack.sh
```

Без пароля скрипт отработает, но раздел с опознанием баз будет пустым.

### ⚠️ Отчёт — секрет

По требованию заказчика пароли выводятся **в открытом виде** (чтобы по отчёту можно было
воспроизвести установку). Отчёты добавлены в `.gitignore` (`report-*.md`,
`inventory-*.json`, `tools/audit/`), файлы сохраняются с правами `600`.
Не коммитить, не пересылать открытыми каналами, удалять после использования.
