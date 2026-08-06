# Генерация синтетического набора (3 заказа, новые контрагенты/номенклатура)
# на c1-test и прогон синтетического сценария с полным сбросом базы.
param(
    [string]$TestHost = "192.168.7.143",
    [switch]$GenOnly
)
$gen = "set -a; . /etc/c1-test/platform.env; set +a; cd /opt/c1cserv && node test-platform/scripts/gen-synthetic.js"
ssh raa@$TestHost "sudo -n -u c1test bash -c '$gen'"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($GenOnly) { exit 0 }
& "$PSScriptRoot\run-test.ps1" -TestHost $TestHost -Scenario "test-platform/scenarios/order-synthetic.json"
exit $LASTEXITCODE
