# CEA Querétaro Agent Server v2.0

Production-ready AI agent server for CEA Querétaro customer service, designed for n8n webhook integration.

## 🚀 What's New in v2.0

- **Native Tools** - Critical operations now use native tools instead of MCP for reliability
- **Parsed Responses** - SOAP XML responses are parsed into structured data
- **Better Error Handling** - Retry logic, timeouts, and graceful degradation
- **Improved Prompts** - Concise, action-oriented agent instructions
- **Conversation Management** - In-memory with TTL cleanup (use Redis for production)
- **Observability** - Request logging, health checks, and agent status

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Server                           │
│  POST /api/chat ─────────────────────────────────────────▶ │
│  POST /webhook  ─────────────────────────────────────────▶ │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               Classification Agent (gpt-4.1-mini)           │
│  Determines: fuga|pagos|consumos|contrato|tickets|...       │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Fugas   │   │  Pagos   │   │ Consumos │ ...
        │  Agent   │   │  Agent   │   │  Agent   │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │              │              │
             ▼              ▼              ▼
        ┌─────────────────────────────────────────┐
        │           Native Tools (tools.ts)       │
        │  • get_deuda (SOAP → Parsed JSON)       │
        │  • get_consumo (SOAP → Parsed JSON)     │
        │  • get_contract_details                 │
        │  • create_ticket (Supabase)             │
        │  • get_client_tickets (Supabase)        │
        └─────────────────────────────────────────┘
```

## 🔧 Native Tools vs MCP

| Tool | Type | Why |
|------|------|-----|
| `get_deuda` | **Native** | Critical path, needs response parsing |
| `get_consumo` | **Native** | Critical path, needs response parsing |
| `get_contract_details` | **Native** | Critical path, needs response parsing |
| `create_ticket` | **Native** | Must return folio synchronously |
| `get_client_tickets` | **Native** | Direct Supabase query |
| `search_customer_by_contract` | **Native** | Direct Supabase query |
| `update_ticket` | **Native** | Direct Supabase mutation |

## 📦 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials:
# - OPENAI_API_KEY (required)
# - SUPABASE_URL (required)
# - SUPABASE_SERVICE_KEY (required)
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Test the API

```bash
# Basic test
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola, quiero consultar mi saldo"}'

# With conversation ID
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Mi contrato es 123456", "conversationId": "test-123"}'
```

### 5. Run Tests

```bash
# Automated tests
npm test

# Interactive mode
npm test -- --interactive
```

## 📡 API Reference

### POST /api/chat

Main chat endpoint for conversational AI.

**Request:**
```json
{
  "message": "Quiero consultar mi adeudo",
  "conversationId": "optional-session-id",
  "metadata": {
    "whatsapp": "+521234567890",
    "channel": "whatsapp"
  }
}
```

**Response:**
```json
{
  "response": "Claro, ¿me proporcionas tu número de contrato?",
  "classification": "pagos",
  "conversationId": "session-id",
  "metadata": {
    "toolsUsed": ["get_deuda"],
    "processingTimeMs": 1234
  }
}
```

### GET /health

Simple health check for load balancers.

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600
}
```

### GET /status

Detailed status with agent information.

```json
{
  "status": "ok",
  "version": "2.0.0",
  "environment": "production",
  "agents": {
    "status": "healthy",
    "agents": ["Clasificador María", "María - Pagos", ...],
    "conversationCount": 42
  },
  "memory": {
    "heapUsed": 128,
    "heapTotal": 256
  }
}
```

## 🤖 Agent Capabilities

| Agent | Purpose | Tools Used |
|-------|---------|------------|
| **Clasificador** | Routes messages to specialists | - |
| **Información** | General queries, hours, policies | - |
| **Pagos** | Balance, payments, digital receipts | `get_deuda`, `create_ticket` |
| **Consumos** | Usage history, meter readings | `get_consumo`, `create_ticket` |
| **Fugas** | Water leak reports | `create_ticket` |
| **Contratos** | New/existing contracts | `get_contract_details` |
| **Tickets** | Ticket status and updates | `get_client_tickets`, `update_ticket` |

## 🏗️ Ticket Folio Format

Tickets use the format: `CEA-[TYPE]-[YYMMDD]-[NNNN]`

| Code | Type | Example |
|------|------|---------|
| FUG | Fuga | CEA-FUG-250115-0001 |
| PAG | Pagos | CEA-PAG-250115-0001 |
| ACL | Aclaraciones | CEA-ACL-250115-0001 |
| LEC | Lecturas | CEA-LEC-250115-0001 |
| REV | Revisión recibo | CEA-REV-250115-0001 |
| DIG | Recibo digital | CEA-DIG-250115-0001 |
| URG | Urgente/Asesor | CEA-URG-250115-0001 |

## 🔗 n8n Integration

### HTTP Request Node Configuration

1. **Method**: `POST`
2. **URL**: `https://your-domain.com/api/chat`
3. **Body Content Type**: `JSON`
4. **Body**:
```json
{
  "message": "={{ $json.body.message }}",
  "conversationId": "={{ $json.body.from }}",
  "metadata": {
    "whatsapp": "={{ $json.body.from }}",
    "channel": "whatsapp"
  }
}
```

### Example n8n Workflow

```
WhatsApp Trigger → HTTP Request (Agent) → IF (needs human) → ...
                                        → Respond to WhatsApp
```

## 🐳 Docker Deployment

### Build

```bash
docker build -t cea-agent:2.0 .
```

### Run

```bash
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxx \
  -e SUPABASE_URL=https://xxx.supabase.co \
  -e SUPABASE_SERVICE_KEY=eyJ... \
  cea-agent:2.0
```

### Docker Compose

```yaml
version: '3.8'
services:
  cea-agent:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

## 📊 Monitoring

### Logging

All requests are logged with request IDs:
```
→ [a1b2c3d4] POST /api/chat
[a1b2c3d4] Processing: "Quiero consultar mi saldo..."
[a1b2c3d4] Classification: pagos
← [a1b2c3d4] 200 (1234ms)
```

### Metrics to Track

- Request latency (p50, p95, p99)
- Classification distribution
- Tool usage frequency
- Error rates by classification
- Conversation length distribution

## 🛠️ Troubleshooting

### "No se pudo consultar el saldo"

CEA SOAP API is unavailable. Check:
1. Network connectivity to `aquacis-cf-int.ceaqueretaro.gob.mx`
2. API credentials in SOAP headers
3. Contract number format

### "Classification failed"

OpenAI API issue. Check:
1. `OPENAI_API_KEY` is valid
2. API quota/rate limits
3. Model availability

### Tickets not creating

Supabase issue. Check:
1. `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
2. RLS policies on `cea.tickets` table
3. Table schema matches expected format

## 📝 License

Private - CEA Querétaro

---

Built with ❤️ for CEA Querétaro
# agentStartHack
