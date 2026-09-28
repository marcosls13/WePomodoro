COMPOSE_FILE = ./docker-compose.yml

all: build up

build:
	docker compose -f $(COMPOSE_FILE) build

up:
	docker compose -f $(COMPOSE_FILE) up -d

down:
	docker compose -f $(COMPOSE_FILE) down

clean: down
	docker system prune -af

fclean: clean
	docker volume prune -f

re: fclean all

.PHONY: all build up down clean fclean re
