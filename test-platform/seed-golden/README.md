# Данные для засева мока

Готовый набор (снимок прод-журнала `c1_data`) **распространяется с ansible-ролью**:
`roles/c1_test/files/seed-data.tar.gz` в infra-репо (приватный контур — в публичный
git данные контрагентов не попадают). При установке набор распаковывается в
`/srv/c1-test/seed` и автоматически заливается в `c1_mock`; доступ к прод-журналу
не требуется.

Команды:

```bash
node test-platform/scripts/seed-mock.js            # залить набор из SEED_DIR (по умолчанию)
node test-platform/scripts/seed-mock.js --all      # обновить набор из прод-журнала (нужен доступ)
node test-platform/scripts/seed-mock.js --order <GUID заказа>   # компактное замыкание одного заказа
```

После `--all` перепакуйте архив в infra-репо:
`tar czf seed-data.tar.gz -C /srv/c1-test/seed .` → `roles/c1_test/files/`.
