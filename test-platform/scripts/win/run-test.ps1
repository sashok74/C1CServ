# Запуск сквозного теста на c1-test с рабочей станции + забор отчёта.
param(
    [string]$TestHost = "192.168.7.143",
    [string]$Scenario = "test-platform/scenarios/order-basic.json"
)
$remote = "set -a; . /etc/c1-test/platform.env; set +a; cd /opt/c1cserv && node test-platform/scripts/run-all.js --scenario $Scenario"
ssh raa@$TestHost "sudo -n -u c1test bash -c '$remote'"
$exit = $LASTEXITCODE

$last = ssh raa@$TestHost "ls -1 /srv/c1-test/reports | grep '^run-' | tail -1"
if ($last) {
    New-Item -ItemType Directory -Force -Path .\reports | Out-Null
    scp -r "raa@${TestHost}:/srv/c1-test/reports/$last" .\reports\ | Out-Null
    Write-Host "Отчёт: .\reports\$last\report.md"
}
exit $exit
