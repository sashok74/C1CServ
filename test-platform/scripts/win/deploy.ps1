# Деплой изменений в тестовый LXC: push из рабочей копии → pull + build + restart на c1-test.
param([string]$TestHost = "192.168.7.143")
git push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
ssh raa@$TestHost "cd /opt/c1cserv && sudo -n git pull && sudo -n yarn install --non-interactive && sudo -n yarn build && sudo -n systemctl restart c1cserv-test c1-mock && systemctl is-active c1cserv-test c1-mock fb-port"
exit $LASTEXITCODE
