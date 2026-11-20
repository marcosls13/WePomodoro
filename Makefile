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
	@test -s db/dump.sql || { echo "db/dump.sql is missing or empty"; exit 1; }
	$(COMPOSE) up -d --wait db
	$(COMPOSE) stop backend
	@mkdir -p db/backups
	@set -eu; \
		backup=$$(mktemp db/backups/before-load.XXXXXX.sql); \
		$(COMPOSE) exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' > "$$backup"; \
		echo "Saved current database to $$backup"
	$(COMPOSE) exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 --single-transaction -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --command "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" --file -' < db/dump.sql
	$(COMPOSE) up -d backend

# Prisma Studio, a browser UI for the data: http://localhost:5555 (Ctrl+C stops it).
studio: .env
	$(COMPOSE) up -d db
	@echo "Prisma Studio: http://localhost:5555 (Ctrl+C to stop)"
	$(COMPOSE) run --rm --name studio -p 127.0.0.1:5555:5556 backend sh -c "npx prisma studio --port 5555 --browser none --config prisma7.config.ts > /dev/null 2>&1 & exec node studio-proxy.cjs"

psql: .env
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

ci: ci-backend ci-frontend

ci-backend:
	cd backend && npm ci --no-audit --no-fund && npm run lint && npm run format:check && npm run build

ci-frontend:
	cd frontend && npm ci --no-audit --no-fund && npm run lint && npm run format:check && npm run build

.PHONY: all build up down clean fclean re db-dump db-load psql studio ci ci-backend ci-frontend
