#!/usr/bin/env bash
# One-time local setup: create the wyr_website database and the wyr_app user, which only
# has privileges on that database. Touches nothing else on the server.
#
# The password is read from DATABASE_URL in server/.env. Run as a MySQL/MariaDB admin:
#   server/scripts/create-db.sh                 # connects as root with password rootroot
#   server/scripts/create-db.sh -u admin -p     # any extra args go to the mysql client
set -euo pipefail

env_file="$(dirname "$0")/../.env"
url=$(grep -E '^DATABASE_URL=' "$env_file" | sed -E 's/^DATABASE_URL="?([^"]*)"?$/\1/')
if [[ ! "$url" =~ ^mysql://([^:]+):([^@]+)@[^/]+/([A-Za-z0-9_]+) ]]; then
  echo "Could not parse DATABASE_URL in $env_file" >&2
  exit 1
fi
user=${BASH_REMATCH[1]} password=${BASH_REMATCH[2]} db=${BASH_REMATCH[3]}

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
