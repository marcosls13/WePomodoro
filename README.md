_This project has been created as part of the 42 curriculum by marcolop, igngonza, fdurban-, mamaratr._

# WePomodoro

## Description

WePomodoro is a web application built for the ft_transcendence project.

<!-- TODO: goal of the project, brief overview and key features (e.g. shared pomodoro timers, rooms, ...). -->

## Instructions

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin
- `make`

Environment files (the real ones are git-ignored; the `.env.example` next to each
is committed):

- `.env` (root): the local database credentials. `make` creates it from
  `.env.example` on the first run, so you don't have to.
- `backend/.env`: copy `backend/.env.example` and fill in the email and OAuth
  values you need. `DATABASE_URL` is not set there: Docker Compose points the
  backend at the local `db` container.
- `frontend/.env`: copy `frontend/.env.example`.

### Run the project

From the root of the repository:

```bash
make
```

This builds the images and starts all the services. Then open:

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

Other useful commands:

| Command      | What it does                                   |
| ------------ | ---------------------------------------------- |
| `make build` | Build the images                               |
| `make up`    | Start the services in the background           |
| `make down`  | Stop the services                              |
| `make clean` | Stop the services and remove the images        |
| `make fclean`| Same as `clean`, and also remove the volumes   |
| `make re`    | Rebuild everything from scratch                |
| `make db-dump` | Save the database (schema and data) to `db/dump.sql` |
| `make db-load` | Replace the database with `db/dump.sql`      |
| `make psql`  | Open a `psql` shell in the database            |
| `make studio`| Browse the data in Prisma Studio, http://localhost:5555 |

### Database

PostgreSQL runs in the `db` container, with its data in the `pgdata` volume, so it
survives `make down`; `make fclean` deletes it. On every start the backend applies
the migrations in `backend/prisma/migrations`, so a fresh database always gets the
full schema.

To give a teammate your data, run `make db-dump` and send them `db/dump.sql`.
They put it in `db/` and run `make db-load`. It contains everything in your
database (including accounts and password hashes), so only share it with the team.

## Team Information

<!-- TODO: for each member, their role(s) (PO, PM, Tech Lead, Developer) and a brief description of their responsibilities. -->

| Login     | Role(s) | Responsibilities |
| --------- | ------- | ---------------- |
| marcolop  | TODO    | TODO             |
| igngonza  | TODO    | TODO             |
| fdurban-  | TODO    | TODO             |
| mamaratr  | TODO    | TODO             |

## Project Management

<!-- TODO: how the work is organized (task distribution, meetings), tools used (GitHub Issues, Trello, ...) and communication channels (Discord, Slack, ...). -->

## Technical Stack

- **Frontend:** React, TypeScript, Vite, React Router, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Containerization:** Docker, Docker Compose
- **Tooling:** ESLint, Prettier

<!-- TODO: database system and why it was chosen, and justification for the major technical choices. -->

## Database Schema

<!-- TODO: diagram or description of the tables/collections, their relationships, and key fields and types. -->

## Features List

<!-- TODO: implemented features, a short description of each, and who worked on them. -->

## Modules

<!-- TODO: chosen modules (Major = 2 pts, Minor = 1 pt), point total (14 minimum), justification, how each was implemented and who worked on it. -->

## Individual Contributions

<!-- TODO: what each member contributed, and the challenges faced and how they were overcome. -->

## Resources

<!-- TODO: add the references actually used. -->

- [React documentation](https://react.dev)
- [Vite documentation](https://vite.dev)
- [React Router documentation](https://reactrouter.com)
- [Tailwind CSS documentation](https://tailwindcss.com/docs)
- [Express documentation](https://expressjs.com)
- [Docker Compose documentation](https://docs.docker.com/compose/)

### Use of AI

<!-- TODO: describe for which tasks and which parts of the project AI was used. Be honest and specific. -->
