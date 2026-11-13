COMPOSE_FILE = ./docker-compose.yml
COMPOSE      = docker compose -p $(PROJECT) -f $(COMPOSE_FILE)
PROJECT      = wepomodoro

all: build up

# Local database credentials; created once from the example, never committed.
.env:
	cp .env.example .env

build: .env
	$(COMPOSE) build

up: .env
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down --rmi all --remove-orphans

fclean:
	$(COMPOSE) down --rmi all --volumes --remove-orphans

re: fclean all

# Share the database: `make db-dump` writes db/dump.sql (schema and data),
# `make db-load` replaces the database with it. Send the file to a teammate.
db-dump: .env
	@mkdir -p db
	$(COMPOSE) exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' > db/dump.sql
	@echo "Wrote db/dump.sql"

db-load: .env
	@test -f db/dump.sql || { echo "db/dump.sql not found"; exit 1; }
	$(COMPOSE) up -d db
	$(COMPOSE) stop backend
	$(COMPOSE) exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' < db/dump.sql
	$(COMPOSE) up -d backend

psql: .env
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: all build up down clean fclean re db-dump db-load psql
