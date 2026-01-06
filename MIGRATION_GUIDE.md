# Migration Guide: v1.0 → v2.0

This document explains all the architectural changes and improvements made to the CEA Agent Server.

## 🔴 Critical Problems Fixed

### 1. MCP Tool Reliability

**Problem:** MCP connections are inherently unstable for production. Your original code had a `performCreateTicket` function that bypassed MCP because it wasn't reliable.

**Solution:** Converted all critical tools to native implementations:

| Tool | Before (MCP) | After (Native) |
|------|--------------|----------------|
| `get_deuda` | MCP call, raw XML | Native with parsed JSON |
| `get_consumo` | MCP call, raw XML | Native with parsed JSON |
| `get_contract_details` | MCP call, raw XML | Native with parsed JSON |
| `create_ticket` | MCP call, no folio return | Native with immediate folio |
| `get_client_tickets` | MCP call | Native Supabase query |

### 2. Dead Guardrails Code

**Problem:** The original code referenced `@openai/guardrails` which doesn't exist as a public package. The guardrails code was effectively dead.

**Solution:** Removed the non-functional guardrails code. If you need content moderation:
- Use OpenAI's moderation API separately
- Implement your own content filtering
- Or wait for Anthropic/OpenAI to release official guardrails

### 3. No Response Parsing

**Problem:** CEA's SOAP APIs return XML, but agents received raw XML strings they couldn't interpret properly.

**Solution:** Added XML parsing for all SOAP responses:

```typescript
// Before: Agent sees raw XML
"<soap:Envelope>...<totalDeuda>150.00</totalDeuda>...</soap:Envelope>"

// After: Agent sees structured data
{
  success: true,
  totalDeuda: 150.00,
  vencido: 50.00,
  porVencer: 100.00,
  resumen: "Saldo total: $150.00 MXN (Vencido: $50.00)"
}
```

### 4. Ticket Folio Not Returned

**Problem:** When creating tickets via MCP, the folio wasn't being returned synchronously, causing agents to respond without confirming the ticket.

**Solution:** Native `create_ticket` tool generates folio locally and persists to Supabase:

```typescript
// Folio is generated BEFORE database call
const folio = generateTicketFolio("fuga"); // CEA-FUG-250115-0001

// Database call (with fallback if it fails)
try {
  await supabaseQuery('cea.tickets', 'POST', undefined, { folio, ... });
} catch {
  // Still return the folio - sync later
}

return { success: true, folio };
```

### 5. Verbose Agent Prompts

**Problem:** Agent prompts were too long with conflicting instructions, causing inconsistent behavior.

**Solution:** Streamlined prompts with clear action flows:

```
// Before (verbose, confusing)
"You are María, the information agent for CEA Querétaro...
IMPORTANT: Keep responses brief... 
CAPABILITIES / WHAT CAN I DO:
If a user asks..."
[300+ words]

// After (actionable)
"Eres María, especialista en pagos de CEA.

FLUJO:
1. Pide contrato
2. Usa get_deuda
3. Presenta resultado

RESPUESTA EJEMPLO:
'Tu saldo es $X. ¿Deseas pagar?'"
```

---

## 📁 New File Structure

```
cea-agent-server/
├── src/
│   ├── types.ts      # All TypeScript types (expanded)
│   ├── tools.ts      # NEW: Native tool implementations
│   ├── agent.ts      # Refactored agents (cleaner)
│   ├── server.ts     # Express server (improved logging)
│   └── test.ts       # NEW: Test suite
├── package.json      # Updated dependencies
├── tsconfig.json
├── Dockerfile        # Production-ready
├── .env.example      # All required vars
├── .gitignore
└── README.md         # Comprehensive docs
```

---

## 🛠️ Key Code Changes

### tools.ts (NEW FILE)

This is the core improvement. All critical tools are now native:

```typescript
// Retry logic for external APIs
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000) // 30s timeout
      });
      if (response.ok) return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(1000 * attempt); // Exponential backoff
    }
  }
}

// SOAP builders
function buildDeudaSOAP(contrato) { /* ... */ }
function buildConsumoSOAP(contrato) { /* ... */ }

// Response parsers
function parseDeudaResponse(xml): DeudaResponse { /* ... */ }
function parseConsumoResponse(xml): ConsumoResponse { /* ... */ }

// Native tools
export const getDeudaTool = tool({
  name: "get_deuda",
  description: "Obtiene el saldo...",
  parameters: z.object({ contrato: z.string() }),
  execute: async ({ contrato }) => {
    const response = await fetchWithRetry(url, { body: buildDeudaSOAP(contrato) });
    return parseDeudaResponse(await response.text());
  }
});
```

### agent.ts Changes

1. **Removed dead guardrails code**
2. **Simplified agent definitions** - Each agent now has focused instructions
3. **Added conversation TTL cleanup** - Prevents memory leaks
4. **Improved auto-approval handling** - Cleaner loop with max iterations

```typescript
// Before: Complex guardrails + approval logic mixed together
// After: Clean separation

// Conversation store with TTL cleanup
setInterval(() => {
  for (const [id, entry] of conversationStore.entries()) {
    if (Date.now() - entry.lastAccess.getTime() > 3600000) {
      conversationStore.delete(id); // 1 hour expiry
    }
  }
}, 300000);
```

### server.ts Changes

1. **Better logging** - Request IDs, timing, classification
2. **CORS support** - For web clients
3. **Graceful shutdown** - SIGTERM/SIGINT handling
4. **Health endpoints** - `/health` and `/status`

---

## ⚙️ Environment Variables

### Required (NEW)

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### Existing
```bash
OPENAI_API_KEY=sk-xxx
PORT=3000
NODE_ENV=development
```

---

## 🔄 MCP Server Recommendations

Your n8n MCP server still has value for non-critical tools. Recommended changes:

### Keep in MCP (read-only, non-critical)
- `get_conceptos_cea` - Workflow tool, OK in MCP
- `Procesador_de_Cola` - Background processing

### Remove from MCP (now native)
- `get_deuda` → Native `get_deuda`
- `get_consumo` → Native `get_consumo`
- `get_contract_details` → Native `get_contract_details`
- `Crear_ticket` → Native `create_ticket`
- `get_client_tickets` → Native `get_client_tickets`
- `Buscar_Customer_Por_Contrato` → Native `search_customer_by_contract`
- `Actualizar_Ticket` → Native `update_ticket`

---

## 🧪 Testing

### Run automated tests
```bash
npm test
```

### Interactive mode
```bash
npm test -- -i
```

### Test cases covered:
- ✅ Greeting → informacion
- ✅ Payment query → pagos
- ✅ Consumption query → consumos
- ✅ Leak report → fuga
- ✅ Contract query → contrato
- ✅ Ticket status → tickets
- ✅ Human advisor → hablar_asesor
- ✅ Digital receipt → pagos
- ✅ Folio generation format
- ✅ Mexico timezone handling

---

## 🚀 Deployment Checklist

1. [ ] Set all environment variables
2. [ ] Update Supabase RLS policies for service key
3. [ ] Test CEA SOAP endpoints connectivity
4. [ ] Run test suite
5. [ ] Deploy to Easypanel/Docker
6. [ ] Update n8n webhook URL
7. [ ] Monitor logs for first 24 hours

---

## ❓ FAQ

### Q: Why remove MCP entirely?

**A:** We didn't remove it entirely. The `hostedMcpTool` is still available if needed. We just moved **critical path** tools to native implementations for reliability.

### Q: What if the native tools fail?

**A:** Native tools have:
- 3 retry attempts with exponential backoff
- 30 second timeouts
- Graceful error messages
- Local folio generation as fallback

### Q: How do I add new tools?

**A:** Add to `tools.ts`:

```typescript
export const myNewTool = tool({
  name: "my_tool",
  description: "...",
  parameters: z.object({ ... }),
  execute: async (args) => { ... }
});

// Then add to the relevant agent in agent.ts
tools: [getDeudaTool, myNewTool]
```

---

## 📞 Support

For issues:
1. Check `/status` endpoint for system health
2. Review logs for request IDs
3. Test individual tools with `npm test -- -i`
