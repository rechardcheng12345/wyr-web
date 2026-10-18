#!/usr/bin/env bash
# One-time local setup: create the wyr_website database and the wyr_app user, which only
# has privileges on that database. Touches nothing else on the server.
#
# The app user, its password and the database name are read from DB_USER, DB_PASSWORD and
# DB_NAME in server/.env. Run as a MySQL/MariaDB admin:
#   server/scripts/create-db.sh                 # connects as root with password rootroot
#   server/scripts/create-db.sh -u admin -p     # any extra args go to the mysql client
set -euo pipefail

env_file="$(dirname "$0")/../.env"
env_value() { grep -E "^$1=" "$env_file" | tail -1 | sed -E "s/^$1=\"?([^\"]*)\"?$/\1/" || true; }
user=$(env_value DB_USER) password=$(env_value DB_PASSWORD) db=$(env_value DB_NAME)
if [[ -z "$user" || -z "$password" || ! "$db" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Set DB_USER, DB_PASSWORD and DB_NAME in $env_file" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  set -- -u root
  export MYSQL_PWD=rootroot
fi

mysql "$@" <<SQL
CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$user'@'localhost' IDENTIFIED BY '$password';
GRANT ALL PRIVILEGES ON \`$db\`.* TO '$user'@'localhost';
SQL
echo "Created database $db and user $user@localhost."
