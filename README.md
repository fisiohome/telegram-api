# Telegram API

A well-structured Hono-based API with feature-based architecture, built with TypeScript and Bun.

## 📁 Project Structure

```
src/
├── features/          # Feature modules
│   └── telegram/      # Example feature module
│       ├── telegram.repo.ts      # Validation layer (Zod schemas)
│       ├── telegram.service.ts   # Business logic
│       ├── telegram.route.ts     # Route handlers
│       └── index.ts              # Public exports
├── lib/               # Shared utilities
│   ├── env.ts         # Environment configuration
│   ├── logger.ts      # Logger instance
│   ├── constants.ts   # App constants
│   └── index.ts       # Public exports
├── middleware/        # HTTP middleware
│   ├── request-logger.ts      # Request/response logging
│   ├── error-handler.ts       # Global error handling
│   └── index.ts               # Public exports
├── response/          # Response structures
│   ├── success.response.ts    # Success response helpers
│   ├── error.response.ts      # Error response helpers
│   └── index.ts               # Public exports
├── routes/            # Route registration
│   └── index.ts       # Collect and register all routes
├── app.ts             # Hono app initialization
└── main.ts            # Server entry point
```

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0 or higher)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd telegram-api
```

2. Install dependencies:

```bash
bun install
```

3. Create environment file:

```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:

```env
NODE_ENV=development
API_BASE_PORT=5000
API_BASE_URL=http://localhost:5000

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=your_db_user
DATABASE_PASSWORD=your_db_password
DATABASE_NAME=your_db_name

# Service Authentication (optional, for development)
SERVICE_AUTH_TOKEN=your_dev_service_token
```

### Running the Application

Development mode with hot reload:

```bash
bun run dev
```

Production mode:

```bash
bun run start
```

Build the application:

```bash
bun run build
```

## 📖 API Documentation

Once the server is running, you can access:

- **API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health
- **API Documentation**: http://localhost:5000/docs (Powered by Scalar)

## 🏗️ Architecture

### Feature Module Pattern

Each feature module follows a consistent pattern:

1. **Repository Layer** (`*.repo.ts`): Validation schemas using Zod
2. **Service Layer** (`*.service.ts`): Business logic and external API calls
3. **Route Layer** (`*.route.ts`): HTTP request handlers
4. **Index** (`index.ts`): Public exports

Example feature module structure:

```typescript
features/telegram/
├── telegram.repo.ts      # Zod validation schemas
├── telegram.service.ts   # Business logic
├── telegram.route.ts     # Route handlers
└── index.ts              # Export module
```

### Response Format

All API responses follow a consistent format with Zod validation:

**Success Response:**

```json
{
  "status": 200,
  "message": "Success message",
  "data": { ... },
  "error": null,
  "request_id": "uuid",
  "timestamp": 1234567890
}
```

**Error Response:**

```json
{
  "status": 400,
  "message": "Error message",
  "data": null,
  "error": { ... },
  "request_id": "uuid",
  "timestamp": 1234567890
}
```

## � Service Authentication

All Telegram API endpoints require service-to-service authentication using two custom headers:

- `X-Service-Name`: Your service identifier (e.g., "telegram-service")
- `X-Service-Token`: Your service authentication token

**Authentication Flow:**

1. Service credentials are stored in the database (`service_credentials` table)
2. For production: Credentials are validated against the database
3. For development: Can use `SERVICE_AUTH_TOKEN` environment variable as fallback

**Example Request with Authentication:**

```bash
curl -X POST http://localhost:5000/api/v1/telegram/send-message \
  -H "Content-Type: application/json" \
  -H "X-Service-Name: telegram-service" \
  -H "X-Service-Token: TELEGRAM-SERVICE-STRONG-TOKEN-CHANGE-THIS" \
  -d '{"chat_id": "123456789", "message": "Hello!"}'
```

**Setting up Service Credentials (Production):**

```sql
INSERT INTO service_credentials (
    service_name,
    service_token,
    service_type,
    description,
    is_active,
    max_requests_per_minute,
    allowed_endpoints
) VALUES (
    'telegram-service',
    'TELEGRAM-SERVICE-STRONG-TOKEN-CHANGE-THIS',
    'internal',
    'Internal service for Telegram integration',
    true,
    2000,
    '["]/api/v1/telegram/*"]'::jsonb
)
ON CONFLICT (service_name) DO NOTHING;
```

## �🔌 API Endpoints

### Health Check

```http
GET /health
```

Returns server health status and uptime.

### Telegram API

> ⚠️ **All endpoints require service authentication headers**: `X-Service-Name` and `X-Service-Token`

**Send Message (Generic)**

```http
POST /api/v1/telegram/send-message
Content-Type: application/json
X-Service-Name: telegram-service
X-Service-Token: your-service-token

{
  "chat_id": "123456789",
  "message": "Hello from API!",
  "parse_mode": "HTML"
}
```

**Send Patient Notification (Fisiohome)**

```http
POST /api/v1/telegram/send-telegram
Content-Type: application/json
X-Service-Name: telegram-service
X-Service-Token: your-service-token

{
  "chat_id": "123456789",
  "kode_pasien": "FH-001",
  "gender_req": "Male",
  "usia": 30,
  "jenis_kelamin": "Laki-laki",
  "keluhan": "Sakit pinggang",
  "durasi": "2 minggu",
  "kondisi": "Moderate",
  "riwayat": "Tidak ada",
  "alamat": "Jakarta Selatan",
  "visit": "Home visit",
  "jadwal": "2026-01-10 10:00"
}
```

**Get Bot Info**

```http
GET /api/v1/telegram/me
X-Service-Name: telegram-service
X-Service-Token: your-service-token
```

## 🛡️ Features

- ✅ **Feature-based architecture** - Organized by feature modules
- ✅ **Service authentication** - Secure service-to-service authentication with custom headers
- ✅ **Type-safe validation** - Zod schemas for request validation
- ✅ **Structured responses** - Consistent response format
- ✅ **Health check** - Built-in health monitoring
- ✅ **API documentation** - Interactive Scalar documentation with auth support
- ✅ **Request logging** - Automatic request/response logging with unique request IDs
- ✅ **Error handling** - Global error handling middleware
- ✅ **Database integration** - PostgreSQL with Kysely query builder
- ✅ **Graceful shutdown** - Proper cleanup of resources and database connections
- ✅ **Environment configuration** - Type-safe environment variables
- ✅ **Path aliases** - Clean imports with `@/` prefix

## 📝 Adding a New Feature

1. Create a new feature directory:

```bash
mkdir src/features/your-feature
```

2. Create the three-layer structure:

```typescript
// src/features/your-feature/your-feature.repo.ts
import { z } from "zod";

export const yourSchema = z.object({
  field: z.string(),
});

export type YourInput = z.infer<typeof yourSchema>;
```

```typescript
// src/features/your-feature/your-feature.service.ts
import type { YourInput } from "./your-feature.repo";

export class YourFeatureService {
  async doSomething(input: YourInput) {
    // Business logic here
  }
}
```

```typescript
// src/features/your-feature/your-feature.route.ts
import { Hono } from "hono";
import { successResponse, badRequestResponse } from "@/response";
import { yourSchema } from "./your-feature.repo";
import { YourFeatureService } from "./your-feature.service";

const yourFeature = new Hono();
const service = new YourFeatureService();

yourFeature.post("/", async (c) => {
  const body = await c.req.json();
  const validation = yourSchema.safeParse(body);

  if (!validation.success) {
    return badRequestResponse(c, validation.error.errors);
  }

  const result = await service.doSomething(validation.data);
  return successResponse(c, result);
});

export default yourFeature;
```

3. Register your routes in `src/routes/index.ts`:

```typescript
import { yourFeatureRoutes } from "@/features/your-feature";

routes.route("/your-feature", yourFeatureRoutes);
```

## 🔧 Graceful Shutdown

The application handles graceful shutdown for:

- SIGINT (Ctrl+C)
- SIGTERM (kill command)
- Uncaught exceptions
- Unhandled promise rejections

Database connections and other resources are properly closed during shutdown.

## 📦 Dependencies

- **hono** - Fast web framework
- **zod** - TypeScript-first schema validation
- **kysely** - Type-safe SQL query builder
- **pg** - PostgreSQL client
- **consola** - Elegant console logger
- **@hono/node-server** - Node.js adapter for Hono
- **@scalar/hono-api-reference** - Beautiful API documentation
- **hono-openapi** - OpenAPI integration for Hono
- **http-status-codes** - HTTP status code constants
- **dotenv** - Environment variable management

## 📄 License

MIT
