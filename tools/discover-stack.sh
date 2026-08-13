#!/usr/bin/env bash
# Обследование хоста: Firebird + база HiTek, fb-port, C1CServ, MongoDB.
#
# ТОЛЬКО ЧТЕНИЕ: ничего не устанавливает, не меняет и не перезапускает.
#
# Запуск:
#   локально           bash discover-stack.sh
#   удалённо           ssh <host> 'bash -s' < discover-stack.sh
#   удалённо под root  ssh <host> 'sudo bash -s' < discover-stack.sh      # видно больше
#   в JSON             ssh <host> 'bash -s' < discover-stack.sh -- --json
#   с сохранением      ssh <host> 'bash -s' < discover-stack.sh -- --out /tmp/audit
#
# ВНИМАНИЕ: отчёт содержит пароли в открытом виде (так заказано) — не коммитить,
# не пересылать через открытые каналы, удалять после использования.
#
# Под обычным пользователем часть данных недоступна (чужие /proc, .env сервисов) —
# такие места помечаются в отчёте как «нет доступа», а не молча пропускаются.

set -uo pipefail

MODE=md
OUTDIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --json) MODE=json ;;
    --out)  OUTDIR="${2:-}"; shift ;;
    --help|-h) sed -n '2,20p' "$0"; exit 0 ;;
  esac
  shift
done

TS="$(date -Iseconds 2>/dev/null || date)"
HOST="$(hostname 2>/dev/null || echo unknown)"
AM_ROOT=no; [ "$(id -u)" = "0" ] && AM_ROOT=yes

# ---------------------------------------------------------------- утилиты ---
have() { command -v "$1" >/dev/null 2>&1; }
# Значения собираем в плоский список "ключ<TAB>значение" — из него делаем и MD, и JSON.
FACTS_FILE="$(mktemp)"; trap 'rm -f "$FACTS_FILE"' EXIT
fact() { printf '%s\t%s\n' "$1" "${2-}" >> "$FACTS_FILE"; }

MD_FILE="$(mktemp)"; trap 'rm -f "$FACTS_FILE" "$MD_FILE"' EXIT
say()  { printf '%s\n' "$*" >> "$MD_FILE"; }
head2(){ say ""; say "## $*"; say ""; }
head3(){ say ""; say "### $*"; say ""; }
kv()   { say "- **$1:** ${2:-—}"; }
pre()  { say '```'; cat >> "$MD_FILE"; say '```'; }
note() { say ""; say "> $*"; say ""; }

json_esc() { sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' -e "s/\r//g" | tr '\n' ' '; }

# первый существующий файл из списка
firstfile() { for f in "$@"; do [ -r "$f" ] && { printf '%s' "$f"; return 0; }; done; return 1; }

# ------------------------------------------------------------ 1. Паспорт ----
head2 "1. Хост"
OS="$( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || uname -s )"
KERNEL="$(uname -r 2>/dev/null)"
VIRT="физический/неизвестно"
if [ -f /proc/1/environ ] && grep -qa container=lxc /proc/1/environ 2>/dev/null; then VIRT="LXC-контейнер"
elif have systemd-detect-virt; then VIRT="$(systemd-detect-virt 2>/dev/null || echo нет)"; fi
MEM="$(awk '/MemTotal/{printf "%.1f ГБ", $2/1048576}' /proc/meminfo 2>/dev/null)"
CPUS="$(nproc 2>/dev/null)"
DISK="$(df -h / 2>/dev/null | awk 'NR==2{print $3" из "$2" занято"}')"

kv "Имя" "$HOST"
kv "ОС" "$OS"
kv "Ядро" "$KERNEL"
kv "Виртуализация" "$VIRT"
kv "CPU / RAM" "${CPUS:-?} / ${MEM:-?}"
kv "Диск /" "${DISK:-?}"
kv "Отчёт снят" "$TS"
kv "Права" "$([ "$AM_ROOT" = yes ] && echo 'root — данные полные' || echo "обычный пользователь ($(id -un)) — часть данных недоступна")"
fact host.name "$HOST"; fact host.os "$OS"; fact host.root "$AM_ROOT"; fact host.ts "$TS"

[ "$AM_ROOT" != yes ] && note "Запущено без root: конфиги сервисов, чужие процессы и \`.env\` могут быть не видны. Для полного отчёта: \`ssh <host> 'sudo bash -s' < discover-stack.sh\`"

# --------------------------------------------- 2. Порты и процессы (вход) ---
head2 "2. Слушающие порты и процессы"
PORTS=""
if have ss; then PORTS="$(ss -tlnp 2>/dev/null)"
elif have netstat; then PORTS="$(netstat -tlnp 2>/dev/null)"; fi

if [ -n "$PORTS" ]; then
  say "Интересующие сервисы (3050 Firebird, 3333 fb-port, 3737/3738 C1CServ, 27017 MongoDB):"
  say ""
  printf '%s\n' "$PORTS" | awk 'NR==1 || /:(3050|3333|3737|3738|27017|8125|18770)[^0-9]/' | pre
  say "Все слушающие сокеты:"
  printf '%s\n' "$PORTS" | pre
else
  say "_Не удалось получить список портов (нет ss/netstat)._"
fi

head3 "Процессы node / firebird / mongod"
PS_OUT="$(ps -eo pid,user,etime,args 2>/dev/null | grep -Ei '(^|/)(node|firebird|fbguard|mongod|isql)' | grep -v ' grep ' || true)"
if [ -n "$PS_OUT" ]; then printf '%s\n' "$PS_OUT" | pre; else say "_Профильные процессы не найдены._"; fi

# рабочие каталоги node-процессов — по ним ищем сервисы
NODE_CWDS=""
for pid in $(pgrep -x node 2>/dev/null; pgrep -f 'node ' 2>/dev/null); do
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" || continue
  [ -n "$cwd" ] && NODE_CWDS="$NODE_CWDS$cwd"$'\n'
done
NODE_CWDS="$(printf '%s' "$NODE_CWDS" | sort -u | sed '/^$/d')"
[ -n "$NODE_CWDS" ] && { say "Рабочие каталоги node-процессов:"; printf '%s\n' "$NODE_CWDS" | pre; }

# ------------------------------------------------------------ 3. Firebird ---
head2 "3. Firebird: установка"

FB_HOME=""
for d in /opt/firebird /usr/lib/firebird/3.0 /usr/lib/firebird/4.0 /usr/lib/firebird/5.0 /usr/local/firebird; do
  [ -d "$d" ] && { FB_HOME="$d"; break; }
done
ISQL="$(command -v isql-fb || command -v isql || true)"
[ -z "$ISQL" ] && [ -n "$FB_HOME" ] && [ -x "$FB_HOME/bin/isql" ] && ISQL="$FB_HOME/bin/isql"
GBAK="$(command -v gbak || true)"
[ -z "$GBAK" ] && [ -n "$FB_HOME" ] && [ -x "$FB_HOME/bin/gbak" ] && GBAK="$FB_HOME/bin/gbak"

FB_PKG="$(dpkg -l 2>/dev/null | awk '/firebird/{print $2" "$3}' | head -5)"
FB_SVC="$(systemctl list-units --type=service --all --no-pager 2>/dev/null | awk '/firebird|fbguard/{print $1" "$3"/"$4}' | head -5)"
FB_PROC="$(pgrep -a -f 'firebird|fbguard' 2>/dev/null | head -3)"
FB_VER=""
[ -n "$ISQL" ] && FB_VER="$("$ISQL" -z -q </dev/null 2>&1 | head -1)"

# Роль хоста: сервер БД или только клиентские утилиты (важно не спутать)
FB_ROLE=none
if [ -n "$FB_PROC" ] || printf '%s' "${PORTS:-}" | grep -qE ':3050\s' || \
   printf '%s' "$FB_SVC" | grep -qi firebird; then
  FB_ROLE=server
elif [ -n "$ISQL$FB_PKG$FB_HOME" ]; then
  FB_ROLE=client
fi
fact firebird.role "$FB_ROLE"

if [ "$FB_ROLE" = none ]; then
  say "**Firebird на хосте не обнаружен.**"
  fact firebird.installed no
else
  fact firebird.installed yes
  if [ "$FB_ROLE" = client ]; then
    kv "Роль" "**только клиент** — сервер БД здесь не работает (нет процесса firebird и слушателя :3050)"
  else
    kv "Роль" "сервер БД"
  fi
  kv "Каталог установки" "${FB_HOME:-не найден (клиентская установка из пакетов)}"
  kv "Версия (isql -z)" "${FB_VER:-неизвестна}"
  kv "isql / gbak" "${ISQL:-нет} / ${GBAK:-нет}"
  [ -n "$FB_PKG" ] && { say "- **Пакеты:**"; printf '%s\n' "$FB_PKG" | pre; }
  [ -n "$FB_SVC" ] && { say "- **Службы:**"; printf '%s\n' "$FB_SVC" | pre; }
  [ -n "$FB_PROC" ] && { say "- **Процессы:**"; printf '%s\n' "$FB_PROC" | pre; }
  fact firebird.home "$FB_HOME"; fact firebird.version "$FB_VER"

  # --- конфиги
  FB_CONF="$(firstfile "$FB_HOME/firebird.conf" /etc/firebird/*/firebird.conf 2>/dev/null || true)"
  DB_CONF="$(firstfile "$FB_HOME/databases.conf" /etc/firebird/*/databases.conf /etc/firebird/*/aliases.conf 2>/dev/null || true)"
  kv "firebird.conf" "${FB_CONF:-не найден}"
  kv "databases.conf" "${DB_CONF:-не найден}"
  fact firebird.databases_conf "$DB_CONF"

  if [ -n "$FB_CONF" ] && [ -r "$FB_CONF" ]; then
    head3 "Параметры firebird.conf, отличные от умолчаний"
    CONF_ACTIVE="$(grep -vE '^\s*#|^\s*$' "$FB_CONF" 2>/dev/null)"
    if [ -n "$CONF_ACTIVE" ]; then printf '%s\n' "$CONF_ACTIVE" | pre; else say "_Все параметры закомментированы (конфигурация по умолчанию)._"; fi
  fi

  if [ -n "$DB_CONF" ] && [ -r "$DB_CONF" ]; then
    head3 "Алиасы баз (databases.conf)"
    ALIASES="$(grep -E '^\s*[A-Za-z0-9_.-]+\s*=' "$DB_CONF" 2>/dev/null | sed 's/^\s*//')"
    if [ -n "$ALIASES" ]; then printf '%s\n' "$ALIASES" | pre; else say "_Алиасов нет._"; fi
  fi
fi

# ---------------------------------------------------- 4. Базы и опознание ---
head2 "4. Базы данных и опознание HiTek"

# файлы баз: из алиасов + типовые каталоги
DB_PATHS="$(mktemp)"
[ -n "${DB_CONF:-}" ] && [ -r "${DB_CONF:-}" ] && \
      grep -E '^\s*[A-Za-z0-9_.-]+\s*=' "$DB_CONF" 2>/dev/null | sed 's/.*=\s*//; s/\s*$//' \
      | grep -E '(^/|\$\(|\.fdb$)' >> "$DB_PATHS"   # только пути; параметры из блоков {} отбрасываем
for d in /var/lib/firebird /opt/firebird /srv /mnt/db /var/db /home; do
  [ -d "$d" ] && find "$d" -maxdepth 3 -name '*.fdb' -o -maxdepth 3 -name '*.FDB' 2>/dev/null >> "$DB_PATHS"
done
sed -i '/^$/d' "$DB_PATHS" 2>/dev/null
sort -u "$DB_PATHS" -o "$DB_PATHS"
DB_COUNT="$(wc -l < "$DB_PATHS" | tr -d '[:space:]')"

if [ "$DB_COUNT" = "0" ]; then
  say "_Файлы баз (.fdb) не найдены._"
else
  say "Найдено файлов баз: **$DB_COUNT**"
  say ""
  say "| Файл | Размер | Владелец | Изменён |"
  say "|---|---:|---|---|"
  while read -r f; do
    [ -z "$f" ] && continue
    if [ -e "$f" ]; then
      say "| \`$f\` | $(du -h "$f" 2>/dev/null | cut -f1) | $(stat -c '%U:%G' "$f" 2>/dev/null) | $(stat -c '%y' "$f" 2>/dev/null | cut -d. -f1) |"
    else
      say "| \`$f\` | _нет файла_ | | |"
    fi
  done < "$DB_PATHS"
fi

# --- учётные данные для опроса: из окружения и из .env найденных сервисов
CRED_USER="${ISC_USER:-SYSDBA}"
CRED_PWD="${ISC_PASSWORD:-}"
CRED_SRC="переменные окружения"
if [ -z "$CRED_PWD" ]; then
  for envf in /root/node/fb-port/.env /opt/fb-port/.env /etc/c1-test/fb-port.env; do
    [ -r "$envf" ] || continue
    p="$(grep -E '^DB_PASSWORD=' "$envf" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '[:space:]')"
    u="$(grep -E '^DB_USER=' "$envf" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '[:space:]')"
    [ -n "$p" ] && { CRED_PWD="$p"; [ -n "$u" ] && CRED_USER="$u"; CRED_SRC="$envf"; break; }
  done
fi
[ -z "$CRED_PWD" ] && [ -r /etc/firebird/3.0/SYSDBA.password ] && {
  CRED_PWD="$(grep -E '^ISC_PASSWD=' /etc/firebird/3.0/SYSDBA.password 2>/dev/null | cut -d= -f2- | tr -d '"')"
  CRED_SRC=/etc/firebird/3.0/SYSDBA.password; }

head3 "Опознание баз"
if [ -z "$ISQL" ]; then
  say "_isql недоступен — содержимое баз не опрошено (нужен пакет firebird3.0-utils или каталог установки сервера)._"
elif [ -z "$CRED_PWD" ]; then
  say "_Пароль SYSDBA не найден — базы не опрошены. Подсказка: запустите с \`ISC_PASSWORD=... bash discover-stack.sh\`._"
else
  say "Учётные данные: пользователь \`$CRED_USER\`, пароль \`$CRED_PWD\` (источник: \`$CRED_SRC\`)."
  say ""
  say "| База | Движок | HiTek-маркеры | EXP_* | EXP2_* | Заказы | Номенкл. | Движения |"
  say "|---|---|---|---:|---:|---:|---:|---:|"
  SQLF="$(mktemp)"
  cat > "$SQLF" <<'EOSQL'
set list on;
select
  (select rdb$get_context('SYSTEM','ENGINE_VERSION') from rdb$database) as ENGINE,
  (select count(*) from rdb$relations r where r.rdb$relation_name in
     ('NOM_LIST','DOC_HEADER','BOM_LIST','C1_LINKS','NOM_PACK','DOC_ITEMS','NOM_TRANS')) as MARKERS,
  (select count(*) from rdb$procedures p where p.rdb$procedure_name starting with 'EXP_') as EXPPROC,
  (select count(*) from rdb$procedures p where p.rdb$procedure_name starting with 'EXP2_') as EXP2PROC,
  (select count(*) from rdb$procedures p where p.rdb$procedure_name = 'MET$PROC_IN_PARAM_INFO_S') as METSHIM
from rdb$database;
EOSQL
  while read -r f; do
    [ -z "$f" ] && continue
    [ -e "$f" ] || continue
    OUT="$(ISC_USER="$CRED_USER" ISC_PASSWORD="$CRED_PWD" "$ISQL" -q -i "$SQLF" "localhost:$f" 2>&1)"
    ENG="$(printf '%s' "$OUT" | awk '/ENGINE/{print $2}')"
    MRK="$(printf '%s' "$OUT" | awk '/MARKERS/{print $2}')"
    EXPP="$(printf '%s' "$OUT" | awk '/EXPPROC/{print $2}')"
    EXP2="$(printf '%s' "$OUT" | awk '/EXP2PROC/{print $2}')"
    SHIM="$(printf '%s' "$OUT" | awk '/METSHIM/{print $2}')"
    if [ -z "$ENG" ]; then
      say "| \`$(basename "$f")\` | _ошибка подключения_ | | | | | | |"
      fact "db.$(basename "$f").error" "$(printf '%s' "$OUT" | head -2 | tr '\n' ' ')"
      continue
    fi
    # счётчики только если это похоже на HiTek
    ZAK=""; NOM=""; TRN=""
    if [ "${MRK:-0}" -ge 5 ] 2>/dev/null; then
      CNT="$(ISC_USER="$CRED_USER" ISC_PASSWORD="$CRED_PWD" "$ISQL" -q "localhost:$f" 2>/dev/null <<'EOC'
set list on;
select (select count(*) from c1_zakaz_h) as ZAK,
       (select count(*) from nom_list) as NOM,
       (select count(*) from nom_trans) as TRN
from rdb$database;
EOC
)"
      ZAK="$(printf '%s' "$CNT" | awk '/ZAK/{print $2}')"
      NOM="$(printf '%s' "$CNT" | awk '/NOM/{print $2}')"
      TRN="$(printf '%s' "$CNT" | awk '/TRN/{print $2}')"
    fi
    VERDICT="$([ "${MRK:-0}" -ge 5 ] 2>/dev/null && echo "**HiTek** ($MRK/7)" || echo "не HiTek ($MRK/7)")"
    say "| \`$(basename "$f")\` | $ENG | $VERDICT | ${EXPP:-0} | ${EXP2:-0} | ${ZAK:-—} | ${NOM:-—} | ${TRN:-—} |"
    fact "db.$(basename "$f").engine" "$ENG"
    fact "db.$(basename "$f").hitek" "$([ "${MRK:-0}" -ge 5 ] 2>/dev/null && echo yes || echo no)"
    fact "db.$(basename "$f").path" "$f"
    [ "${SHIM:-0}" = "0" ] && [ "${EXP2:-0}" != "0" ] && \
      note "\`$(basename "$f")\`: есть процедуры EXP2_*, но нет \`MET$PROC_IN_PARAM_INFO_S\` — fb-port не сможет вызвать процедуры (нужен шим, см. test-platform/sql/00-gateway-shim.sql)."
  done < "$DB_PATHS"
  rm -f "$SQLF"
  say ""
  say "Маркеры HiTek — наличие таблиц NOM_LIST, DOC_HEADER, BOM_LIST, C1_LINKS, NOM_PACK, DOC_ITEMS, NOM_TRANS (из 7)."

  # активные подключения к серверу
  MAINDB="$(awk -F'\t' '$1 ~ /\.hitek$/ && $2=="yes"{print $1}' "$FACTS_FILE" | head -1 | sed 's/^db\.//; s/\.hitek$//')"
  if [ -n "$MAINDB" ]; then
    DBPATH="$(awk -F'\t' -v k="db.$MAINDB.path" '$1==k{print $2}' "$FACTS_FILE" | head -1)"
    head3 "Кто сейчас подключён к $MAINDB"
    ATT="$(ISC_USER="$CRED_USER" ISC_PASSWORD="$CRED_PWD" "$ISQL" -q "localhost:$DBPATH" 2>/dev/null <<'EOA'
select cast(a.mon$remote_address as varchar(30)) as ADDR,
       cast(a.mon$remote_process as varchar(45)) as PROC,
       count(*) as CNT
  from mon$attachments a
 where a.mon$attachment_id <> current_connection
 group by 1,2;
EOA
)"
    if [ -n "$ATT" ]; then printf '%s\n' "$ATT" | pre; else say "_Нет активных подключений либо нет прав._"; fi
  fi
fi
rm -f "$DB_PATHS"

# ------------------------------------------------- 5/6. Node-сервисы -------
# Кандидаты: рабочие каталоги живых node-процессов + типовые пути с package.json.
# Опознаём НЕ по имени каталога (у C1CServ и fb-port оно произвольное, а
# package.json name у обоих "typescript_start"), а по содержимому.
node_app_dirs() {
  { printf '%s\n' "$NODE_CWDS"
    for base in /opt /srv /root /root/node /home /var/www /usr/local/lib; do
      [ -d "$base" ] && find "$base" -maxdepth 3 -name package.json -not -path '*/node_modules/*' 2>/dev/null | xargs -r -n1 dirname
    done
  } | sort -u | sed '/^$/d'
}

is_c1cserv() {
  [ -f "$1/src/modules/1cdata.ts" ] || [ -f "$1/build/modules/1cdata.js" ] || \
  { [ -f "$1/package.json" ] && grep -q '"mongodb"' "$1/package.json" 2>/dev/null && [ -f "$1/src/types/ExportSchemes.ts" ]; }
}
is_fbport() {
  [ -f "$1/package.json" ] && grep -q 'node-firebird-driver-native' "$1/package.json" 2>/dev/null
}

# git в чужом каталоге: под root нужен safe.directory, иначе "dubious ownership"
git_q() { git -c safe.directory='*' -C "$1" "${@:2}" 2>/dev/null; }

# Печать одного node-сервиса: код, сборка, конфиг, запуск, живость
report_node_service() {
  local title="$1" dir="$2" envfile="$3" probe_url="$4"
  head3 "$title — \`$dir\`"

  if [ ! -d "$dir" ]; then say "_Каталог отсутствует._"; return; fi

  # код
  local commit branch dirty
  if [ -d "$dir/.git" ]; then
    commit="$(git_q "$dir" log --oneline -1)"
    branch="$(git_q "$dir" rev-parse --abbrev-ref HEAD)"
    dirty="$(git_q "$dir" status --porcelain | wc -l)"
    kv "Git" "${branch:-?} @ ${commit:-?}$([ "${dirty:-0}" != "0" ] && echo " (изменённых файлов: $dirty)")"
    kv "Origin" "$(git_q "$dir" remote get-url origin)"
  else
    kv "Git" "не репозиторий (выложено копированием?)"
  fi
  kv "Сборка build/server.js" "$([ -f "$dir/build/server.js" ] && echo "есть, $(stat -c '%y' "$dir/build/server.js" 2>/dev/null | cut -d. -f1)" || echo 'НЕТ — сервис не запустится')"
  kv "node_modules" "$([ -d "$dir/node_modules" ] && echo есть || echo НЕТ)"
  [ -f "$dir/package.json" ] && kv "package.json name" "$(grep -m1 '"name"' "$dir/package.json" | cut -d'"' -f4)"

  # конфиг: явный env-файл или .env в каталоге
  local ef=""
  [ -n "$envfile" ] && [ -r "$envfile" ] && ef="$envfile"
  [ -z "$ef" ] && [ -r "$dir/.env" ] && ef="$dir/.env"
  if [ -n "$ef" ]; then
    say "- **Конфиг:** \`$ef\`"
    say ""
    grep -vE '^\s*#|^\s*$' "$ef" 2>/dev/null | pre
  else
    say "- **Конфиг:** не найден (искали \`$dir/.env\`${envfile:+, \`$envfile\`}) — возможно, переменные заданы в юните systemd"
  fi

  # запуск
  local unit
  unit="$(grep -rl "$dir" /etc/systemd/system/*.service 2>/dev/null | head -3)"
  if [ -n "$unit" ]; then
    for u in $unit; do
      local un; un="$(basename "$u")"
      kv "systemd" "$un — $(systemctl is-active "$un" 2>/dev/null)/$(systemctl is-enabled "$un" 2>/dev/null)"
      grep -E '^(ExecStart|EnvironmentFile|WorkingDirectory|User)=' "$u" 2>/dev/null | sed 's/^/    /' >> "$MD_FILE"
    done
  else
    kv "systemd" "юнит не найден"
  fi
  # PM2 часто ставится под root и отсутствует в PATH неинтерактивной сессии
  local PM2BIN; PM2BIN="$(command -v pm2 || echo /usr/local/bin/pm2)"
  [ -x "$PM2BIN" ] || PM2BIN="$(ls /root/.nvm/versions/node/*/bin/pm2 2>/dev/null | head -1)"
  if [ -n "$PM2BIN" ] && [ -x "$PM2BIN" ]; then
    local pm; pm="$("$PM2BIN" list --no-color 2>/dev/null | grep -iE "$(basename "$dir")|online|stopped" | head -6)"
    [ -n "$pm" ] && { say "- **PM2:**"; printf '%s\n' "$pm" | pre; }
  elif [ -d /root/.pm2 ]; then
    kv "PM2" "каталог /root/.pm2 есть, но бинарь pm2 не найден в PATH — процесс, скорее всего, под PM2"
  fi

  # живость
  if [ -n "$probe_url" ] && have curl; then
    local resp; resp="$(curl -s -m 8 "$probe_url" 2>&1 | head -c 300)"
    kv "Проверка $probe_url" "${resp:-нет ответа}"
  fi
}

ALL_APPS="$(node_app_dirs)"
FBP_DIRS=""; C1_DIRS=""
for d in $ALL_APPS; do
  is_fbport  "$d" && FBP_DIRS="$FBP_DIRS$d"$'\n'
  is_c1cserv "$d" && C1_DIRS="$C1_DIRS$d"$'\n'
done
FBP_DIRS="$(printf '%s' "$FBP_DIRS" | sort -u | sed '/^$/d')"
C1_DIRS="$(printf '%s' "$C1_DIRS" | sort -u | sed '/^$/d')"

head2 "5. fb-port (шлюз к Firebird)"
if [ -z "$FBP_DIRS" ]; then
  say "_fb-port не найден (искали приложение с зависимостью node-firebird-driver-native)._"
  fact fbport.found no
else
  fact fbport.found yes
  for d in $FBP_DIRS; do
    report_node_service "fb-port" "$d" "/etc/c1-test/fb-port.env" "http://127.0.0.1:3333/ProcList"
    # на какую базу смотрит
    ef="$( [ -r /etc/c1-test/fb-port.env ] && echo /etc/c1-test/fb-port.env || echo "$d/.env" )"
    if [ -r "$ef" ]; then
      fbh="$(grep -E '^DB_HOST=' "$ef" | cut -d= -f2- | tr -d '\r')"
      fbn="$(grep -E '^DB_NAME=' "$ef" | cut -d= -f2- | tr -d '\r')"
      note "fb-port сконфигурирован на базу **$fbh:$fbn** — сверьте с таблицей баз выше."
      fact fbport.db "$fbh:$fbn"
    fi
    # нативный модуль и клиент Firebird — без них шлюз не поднимется
    kv "Нативный модуль" "$([ -f "$d/node_modules/node-firebird-native-api/build/Release/addon.node" ] && echo собран || echo 'НЕ собран')"
    kv "libfbclient" "$(ls /usr/lib/x86_64-linux-gnu/libfbclient.so* 2>/dev/null | head -2 | tr '\n' ' ')${FB_HOME:+ (+ $FB_HOME/lib)}"
  done
fi

head2 "6. C1CServ (обмен с 1С)"
if [ -z "$C1_DIRS" ]; then
  say "_C1CServ не найден (искали приложение с модулем 1cdata / схемами экспорта)._"
  fact c1cserv.found no
else
  fact c1cserv.found yes
  for d in $C1_DIRS; do
    report_node_service "C1CServ" "$d" "/etc/c1-test/c1cserv.env" "http://127.0.0.1:3738/"
    ef="$( [ -r /etc/c1-test/c1cserv.env ] && echo /etc/c1-test/c1cserv.env || echo "$d/.env" )"
    if [ -r "$ef" ]; then
      g() { grep -E "^$1=" "$ef" 2>/dev/null | cut -d= -f2- | tr -d '\r'; }
      note "C1CServ: слушает **$(g SERVER):$(g PORT)**; шлюз БД — **$(g DB_HOST):$(g DB_PORT)**; Mongo — **$(g MONGODB_SERVER)/$(g MONGODB_BASE)** (пользователь $(g MONGODB_USER), пароль $(g MONGODB_PASSWORD)); 1С — **$(g C1_WEBSERVER)**."
      fact c1cserv.mongo "$(g MONGODB_SERVER)/$(g MONGODB_BASE)"
      fact c1cserv.fbport "$(g DB_HOST):$(g DB_PORT)"
      fact c1cserv.c1 "$(g C1_WEBSERVER)"
      # /test_db показывает, в какую базу сервис пишет ФАКТИЧЕСКИ
      if have curl; then
        TDB="$(curl -s -m 20 "http://127.0.0.1:$(g PORT)/test_db" 2>/dev/null | grep -oE '"DB_NAME":"[^"]+"' | head -1 | cut -d'"' -f4)"
        kv "Фактическая база (GET /test_db)" "${TDB:-не ответил}"
        fact c1cserv.actual_db "$TDB"
      fi
    fi
  done
fi

# ----------------------------------------------------------- 7. MongoDB ----
head2 "7. MongoDB"
if pgrep -x mongod >/dev/null 2>&1 || have mongod; then
  kv "Версия" "$(mongod --version 2>/dev/null | head -1)"
  kv "Процесс" "$(pgrep -a -x mongod 2>/dev/null | head -1 || echo 'не запущен')"
  MCONF="$(firstfile /etc/mongod.conf /etc/mongodb.conf || true)"
  if [ -n "$MCONF" ]; then
    kv "Конфиг" "$MCONF"
    grep -E '^\s*(bindIp|port|authorization|dbPath)' "$MCONF" 2>/dev/null | pre
  fi
  MSH="$(command -v mongosh || command -v mongo || true)"
  if [ -n "$MSH" ]; then
    head3 "Базы и коллекции"
    "$MSH" --quiet --eval 'db.adminCommand({listDatabases:1}).databases.forEach(d=>print(d.name, (d.sizeOnDisk/1048576).toFixed(1)+" МБ"))' 2>/dev/null | pre
    for b in c1_data c1_data_test c1_mock; do
      OUT="$("$MSH" --quiet "$b" --eval 'db.getCollectionNames().forEach(function(c){print(c, db.getCollection(c).countDocuments())})' 2>/dev/null)"
      [ -n "$OUT" ] && { say "**$b:**"; printf '%s\n' "$OUT" | pre; }
    done
  else
    say "_Клиент mongosh/mongo не найден — содержимое не опрошено._"
  fi
  fact mongo.installed yes
else
  say "_MongoDB на хосте не обнаружена._"
  fact mongo.installed no
fi

# --------------------------------------------------------- 8. Итог/связи ---
head2 "8. Итог: что на этом хосте и куда смотрит"

FB_OK="$(awk -F'\t' '$1=="firebird.installed"{print $2}' "$FACTS_FILE" | head -1)"
HITEK_DBS="$(awk -F'\t' '$1 ~ /\.hitek$/ && $2=="yes"{print $1}' "$FACTS_FILE" | sed 's/^db\.//; s/\.hitek$//' | tr '\n' ' ')"
f1() { awk -F'\t' -v k="$1" '$1==k{print $2; exit}' "$FACTS_FILE"; }
ru() { [ "$1" = yes ] && echo "да" || echo "**нет**"; }

C1_FOUND="$(f1 c1cserv.found)"
if [ "$C1_FOUND" = yes ]; then
  C1_NOTE="шлюз $(f1 c1cserv.fbport); Mongo $(f1 c1cserv.mongo); 1С $(f1 c1cserv.c1)"
  ADB="$(f1 c1cserv.actual_db)"; [ -n "$ADB" ] && C1_NOTE="$C1_NOTE; фактическая база $ADB"
else
  C1_NOTE="—"
fi

case "$(f1 firebird.role)" in
  server) FBROLE_TXT="да, сервер"; FBROLE_NOTE="базы HiTek: ${HITEK_DBS:-не найдены}" ;;
  client) FBROLE_TXT="только клиент"; FBROLE_NOTE="сервер БД на этом хосте не работает" ;;
  *)      FBROLE_TXT="**нет**"; FBROLE_NOTE="—" ;;
esac

say "| Компонент | Есть | Куда смотрит / примечание |"
say "|---|---|---|"
say "| Firebird | $FBROLE_TXT | $FBROLE_NOTE |"
say "| fb-port | $(ru "$(f1 fbport.found)") | $(f1 fbport.db || echo '—') |"
say "| C1CServ | $(ru "$C1_FOUND") | $C1_NOTE |"
say "| MongoDB | $(ru "$(f1 mongo.installed)") | — |"

note "**Отчёт содержит пароли в открытом виде.** Не коммитить, не пересылать открытыми каналами, удалить после использования."

# ------------------------------------------------------------- вывод ------
build_json() {
  printf '{\n  "host": "%s",\n  "taken_at": "%s",\n  "facts": {\n' \
    "$(printf '%s' "$HOST" | json_esc)" "$(printf '%s' "$TS" | json_esc)"
  local first=1
  while IFS=$'\t' read -r k v; do
    [ -z "$k" ] && continue
    [ $first -eq 0 ] && printf ',\n'
    printf '    "%s": "%s"' "$(printf '%s' "$k" | json_esc)" "$(printf '%s' "$v" | json_esc)"
    first=0
  done < "$FACTS_FILE"
  printf '\n  }\n}\n'
}

if [ -n "$OUTDIR" ]; then
  mkdir -p "$OUTDIR"
  cp "$MD_FILE" "$OUTDIR/report-$HOST.md"
  build_json > "$OUTDIR/inventory-$HOST.json"
  chmod 600 "$OUTDIR/report-$HOST.md" "$OUTDIR/inventory-$HOST.json" 2>/dev/null
  echo "Отчёт: $OUTDIR/report-$HOST.md" >&2
  echo "JSON:  $OUTDIR/inventory-$HOST.json" >&2
fi

if [ "$MODE" = json ]; then build_json; else
  printf '# Обследование хоста %s\n' "$HOST"
  cat "$MD_FILE"
fi
