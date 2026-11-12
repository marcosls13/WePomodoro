COMPOSE_FILE = ./docker-compose.yml
COMPOSE      = docker compose -p $(PROJECT) -f $(COMPOSE_FILE)
PROJECT      = wepomodoro

all: build up

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down --rmi all --remove-orphans

fclean:
	$(COMPOSE) down --rmi all --volumes --remove-orphans

re: fclean all

ci: ci-backend ci-frontend

ci-backend:
	cd backend && npm ci && npm run lint && npm run format:check && npm run build

ci-frontend:
	cd frontend && npm ci && npm run lint && npm run format:check && npm run build

.PHONY: all build up down clean fclean re ci ci-backend ci-frontend
