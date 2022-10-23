#!/bin/bash

# リポジトリのルート位置から実行されることを想定

# パッケージの更新等
cat <<'EOF' > ./userdata.sh
#!/bin/bash

# パッケージ更新
yum -y update

# Timezone
timedatectl set-timezone Asia/Tokyo

# ロケール
localectl set-locale LANG=ja_JP.UTF-8
localectl set-keymap jp106

# SSM
yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm
systemctl start amazon-ssm-agent

# CloudWatch Agent
yum install -y expect https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
amazon-linux-extras install -y collectd

# EFS
yum install -y amazon-efs-utils

# Webパッケージのインストール
yum install -y httpd

# ヘルスチェックパスの追加
mkdir -p /var/www/html/health/
touch /var/www/html/health/index.html

# Web用追加パッケージのインストール
## 開発系
yum install -y gcc gcc-c++ libcurl-devel zlib-devel git perl-IPC-Cmd
yum install -y httpd-devel apr-devel apr-util-devel pcre-devel openssl-devel

## php
amazon-linux-extras install -y php7.3=7.3.13
yum install -y php php-devel php-mbstring php-gd php-xml php-xmlrpc php-opcache php-pecl-zip php-pear php-pecl-mcrypt

## passenger
amazon-linux-extras install -y ruby3.0
yum install -y ruby-devel
gem install passenger -v "6.0.12"
yes | passenger-install-apache2-module

## モジュール
### LDAP
yum install -y mod_ldap

### Forwarded
git clone https://github.com/matsumotory/mod_extract_forwarded_for_2.4.git
cd mod_extract_forwarded_for_2.4 && apxs -c -i -a mod_extract_forwarded.c && cd ..

# 各種設定ファイルを作成
EOF

# 各種設定ファイルを作成
cloudwatchConf="$(cat ./cloudwatch/setup-cloudwatch-agent.txt)"
echo -e "expect <<'EOF'\n${cloudwatchConf}\nEOF" >> ./userdata.sh

mackerelConf="$(cat ./mackerel/mackerel-agent.conf)"
echo -e "cat <<'EOF' > /etc/mackerel-agent/mackerel-agent.conf\n${mackerelConf}\nEOF" >> ./userdata.sh

fstab="$(cat ./fstab/fstab)"
echo -e "cat <<'EOF' > /etc/fstab\n${fstab}\nEOF" >> ./userdata.sh

for httpdConfName in $(ls -A1 ./httpd/conf/); do
	httpdConf="$(cat "./httpd/conf/${httpdConfName}")"
	echo -e "cat <<'EOF' > /etc/httpd/conf/${httpdConfName}\n${httpdConf}\nEOF" >> ./userdata.sh
done

for httpdIncludeConfName in $(ls -A1 ./httpd/conf.d/); do
        httpdIncludeConf="$(cat "./httpd/conf.d/${httpdIncludeConfName}")"
        echo -e "cat <<'EOF' > /etc/httpd/conf.d/${httpdIncludeConfName}\n${httpdIncludeConf}\nEOF" >> ./userdata.sh
done

# 設定の適用等
cat <<'EOF' >> ./userdata.sh
## httpd用ディレクトリ作成
cat /etc/httpd/conf.d/vhost* | grep "DocumentRoot" | sed "s/DocumentRoot //g" | while read line; do mkdir -p "${line}";done
CUSTOMLOG=$(cat /etc/httpd/conf.d/vhost* | grep -o "CustomLog.*" | cut -f 2 -d ' ') && dirname ${CUSTOMLOG} | while read line; do mkdir -p "/etc/httpd/${line}";done
ERRORLOG=$(cat /etc/httpd/conf.d/vhost* | grep -o "ErrorLog.*" | sed 's/ErrorLog *//g') && dirname ${ERRORLOG} | while read line; do mkdir -p "/etc/httpd/${line}";done

# fstab
dd if=/dev/zero of=/var/swapfile bs=1M count=2048
mkswap /var/swapfile
chmod 600 /var/swapfile
swapon /var/swapfile
mount -a

# Apache再起動
systemctl start httpd

# sshポートを変更
echo "Port 10022" >> /etc/ssh/sshd_config
systemctl reload sshd

# MySQLコマンドインストール
yum install -y mariadb

# CloudWatch Logs
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json -s
EOF
