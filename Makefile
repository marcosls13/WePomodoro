COMPOSE_FILE = ./docker-compose.yml
COMPOSE      = docker compose -p $(PROJECT) -f $(COMPOSE_FILE)
PROJECT      = WePomodoro

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

.PHONY: all build up down clean fclean re
