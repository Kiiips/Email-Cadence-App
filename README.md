# Email Cadence App

A TypeScript monorepo application that manages email cadences using **Next.js**, **NestJS**, and **Temporal.io**.

## Monorepo Structure

```
apps/
  web/       # Next.js frontend (port 3000)
  api/       # NestJS API server (port 3001)
  worker/    # Temporal.io workflow worker
```

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9 (workspaces support)
- **Temporal.io server** running locally (default: `localhost:7233`)

### Installing Temporal CLI (local dev server)

```bash
# macOS
brew install temporal

# Or download from https://docs.temporal.io/cli#install
```

Start the Temporal dev server:

```bash
temporal server start-dev
```

This starts a Temporal server at `localhost:7233`.

## Installation

From the repository root:

```bash
npm install
```

This installs dependencies for all workspaces (`apps/web`, `apps/api`, `apps/worker`).

## Configuration

Environment variables (all optional, defaults shown):

| Variable | Default | Description |
|---|---|---|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server gRPC address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `cadence-task-queue` | Temporal task queue name |
| `API_PORT` | `3001` | NestJS API port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | API URL used by the frontend |

## Running

1. Start the Temporal dev server:

```bash
temporal server start-dev
```

2. Start the app:

```bash
npm run dev
```

This starts the web UI (port 3000), API (port 3001), and Temporal worker concurrently.

### Individual apps (optional)

```bash
npm run dev:web      # Next.js on http://localhost:3000
npm run dev:api      # NestJS on http://localhost:3001
npm run dev:worker   # Temporal worker
```

## API Endpoints

### Cadences

**Create a cadence**

```bash
curl -X POST http://localhost:3001/cadences \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Welcome Flow",
    "steps": [
      {"id": "1", "type": "SEND_EMAIL", "subject": "Welcome", "body": "Hello there"},
      {"id": "2", "type": "WAIT", "seconds": 10},
      {"id": "3", "type": "SEND_EMAIL", "subject": "Follow up", "body": "Checking in"}
    ]
  }'
```

**Get a cadence**

```bash
curl http://localhost:3001/cadences/<cadence_id>
```

**Update a cadence**

```bash
curl -X PUT http://localhost:3001/cadences/<cadence_id> \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Flow",
    "steps": [
      {"id": "1", "type": "SEND_EMAIL", "subject": "New Welcome", "body": "Updated content"}
    ]
  }'
```

### Enrollments

**Create an enrollment (start workflow)**

```bash
curl -X POST http://localhost:3001/enrollments \
  -H "Content-Type: application/json" \
  -d '{
    "cadenceId": "<cadence_id>",
    "contactEmail": "user@example.com"
  }'
```

**Get enrollment status**

```bash
curl http://localhost:3001/enrollments/<enrollment_id>
```

Response includes `currentStepIndex`, `status`, and `stepsVersion` from the Temporal workflow.

**Update a running workflow's cadence**

```bash
curl -X POST http://localhost:3001/enrollments/<enrollment_id>/update-cadence \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      {"id": "1", "type": "SEND_EMAIL", "subject": "Welcome", "body": "Hello there"},
      {"id": "2", "type": "SEND_EMAIL", "subject": "Quick follow up", "body": "Directly follows"}
    ]
  }'
```

This sends a Temporal signal to the running workflow. The update rules are:

1. Already completed steps remain completed
2. `currentStepIndex` is preserved
3. If new steps length <= `currentStepIndex`, workflow marks as COMPLETED
4. Otherwise, workflow continues from `currentStepIndex` with the new steps
5. `stepsVersion` is incremented

## Temporal Workflow Details

- **Workflow**: `executeCadence` — executes cadence steps sequentially
- **Activity**: `sendEmail` — mock email sender (logs to console, always succeeds)
- **Signal**: `updateCadence` — replaces steps at runtime
- **Query**: `getState` — returns `{ currentStepIndex, stepsVersion, status, steps, contactEmail, cadenceId }`
- **Task Queue**: `cadence-task-queue`

## Mock Email

The `sendEmail` activity does not call any real email provider. It logs the action to the console and returns:

```json
{
  "success": true,
  "messageId": "msg_<timestamp>_<random>",
  "timestamp": 1234567890
}
```
