#!/usr/bin/env bash
# Render build command. Set the start command to:
#   gunicorn config.wsgi:application
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate

# Roles are configuration, not data -- safe and necessary on every deploy.
python manage.py seed_roles
