# Golden-набор

Маленький связный набор JSONL для оффлайн-проверки мока (без похода в прод-журнал):

```bash
SEED_DIR=test-platform/seed-golden node test-platform/scripts/seed-mock.js --order <GUID заказа>
```

Файлы `<Коллекция>.jsonl` из этого каталога заливаются в `c1_mock` командой
`SEED_DIR=test-platform/seed-golden node test-platform/scripts/seed-mock.js --load-only`.
Набор генерируется при первом развёртывании платформы и коммитится в репо.
