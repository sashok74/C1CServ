# Полный сброс тестового контура: переклон erp_base_api_c1 + очистка журнала c1_data_test.
ssh raa@ansible-ctl "cd /opt/infra-ansible && sudo -n /root/.local/bin/ansible-playbook playbooks/services/c1-test-reset.yml"
exit $LASTEXITCODE
