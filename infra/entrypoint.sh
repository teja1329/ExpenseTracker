#!/bin/sh
set -e

# initialize sqlite DB once
if [ ! -f /app/data/expense_app.db ]; then
  echo "Initializing SQLite DB..."
  sqlite3 /app/data/expense_app.db < /app/schema.sql
  echo "SQLite DB initialized."
fi

# start the server
exec node src/server.js

