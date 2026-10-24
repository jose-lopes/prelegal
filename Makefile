.PHONY: start stop logs test

start:
	docker compose up --build --detach --wait app

stop:
	docker compose --profile dev down

logs:
	docker compose logs --follow app

test:
	docker compose --profile test run --build --rm backend-checks
	docker compose --profile test run --build --rm checks
	docker compose --profile test run --build --rm e2e
