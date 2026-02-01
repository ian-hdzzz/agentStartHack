// ============================================
// WaterHub Agent Server - Community Map / Voice
// ============================================

import express, { Request, Response, NextFunction } from "express";
import { config } from "dotenv";
import { runWorkflow, getAgentHealth } from "./agent.js";
import type { ChatRequest, ChatResponse } from "./types.js";

// Load environment variables
config();

// ============================================
// Configuration
// ============================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Validate required env vars
const requiredEnvVars = ["OPENAI_API_KEY"];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// ============================================
// Express App Setup
// ============================================

const app = express();

// Middleware
app.use(express.json({ limit: "10mb" }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID().substring(0, 8);
    (req as any).requestId = requestId;
    (req as any).startTime = Date.now();

    console.log(`-> [${requestId}] ${req.method} ${req.path}`);

    res.on("finish", () => {
        const duration = Date.now() - (req as any).startTime;
        console.log(`<- [${requestId}] ${res.statusCode} (${duration}ms)`);
    });

    next();
});

// CORS headers for web clients
app.use((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// ============================================
// Health & Status Endpoints
// ============================================

app.get("/health", (req: Request, res: Response) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get("/status", (req: Request, res: Response) => {
    const agentHealth = getAgentHealth();

    res.json({
        status: "ok",
        version: "2.0.0",
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        agents: agentHealth
    });
});

// ============================================
// Main Chat Handler
// ============================================

async function handleChat(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId || crypto.randomUUID().substring(0, 8);

    try {
        let { message, image_url, conversationId, metadata } = req.body as ChatRequest;

        // Sanitize message input
        if (Array.isArray(message)) {
            message = message[0] || "";
        } else if (typeof message === "string" && message.startsWith("[") && message.endsWith("]")) {
            try {
                const parsed = JSON.parse(message);
                if (Array.isArray(parsed)) {
                    message = parsed[0] || "";
                }
            } catch {
                // ignore
            }
        }
        if (typeof message !== "string") {
            message = "";
        }
        if (!message && image_url) {
            message = "[El usuario envió una foto]";
        }
        if (!message) {
            res.status(400).json({
                error: "Missing or invalid 'message' field (or image_url)",
                response: "",
                conversationId: conversationId || crypto.randomUUID()
            } as ChatResponse);
            return;
        }

        if (message.length > 10000) {
            res.status(400).json({
                error: "Message too long (max 10000 characters)",
                response: "",
                conversationId: conversationId || crypto.randomUUID()
            } as ChatResponse);
            return;
        }

        console.log(`[${requestId}] Processing: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

        const result = await runWorkflow({
            input_as_text: message,
            image_url: image_url,
            conversationId: conversationId,
            metadata: metadata
        });

        const response: ChatResponse = {
            response: result.output_text || "Lo siento, no pude procesar tu mensaje.",
            classification: result.classification,
            conversationId: conversationId || crypto.randomUUID(),
            metadata: {
                toolsUsed: result.toolsUsed,
                processingTimeMs: Date.now() - (req as any).startTime
            }
        };

        console.log(`[${requestId}] Classification: ${result.classification}`);
        console.log(`[${requestId}] Response length: ${response.response.length} chars`);

        res.json(response);

    } catch (error) {
        console.error(`[${requestId}] Error:`, error);

        const errorMessage = error instanceof Error ? error.message : "Internal server error";

        res.status(500).json({
            error: NODE_ENV === "development" ? errorMessage : "Internal server error",
            response: "Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo.",
            conversationId: (req.body as ChatRequest)?.conversationId || crypto.randomUUID()
        } as ChatResponse);
    }
}

// ============================================
// API Routes
// ============================================

// Main chat endpoint
app.post("/api/chat", handleChat);

// Webhook alias (for integrations)
app.post("/webhook", handleChat);

// ============================================
// Evolution API Webhook Handler (WhatsApp)
// ============================================

interface EvolutionWebhook {
    event: string;
    instance: string;
    data: {
        key: { remoteJid: string; fromMe: boolean; id: string };
        pushName?: string;
        message?: {
            conversation?: string;
            extendedTextMessage?: { text: string };
            imageMessage?: {
                url?: string;
                directUrl?: string;
                caption?: string;
                base64?: string;
            };
            locationMessage?: {
                degreesLatitude?: number;
                degreesLongitude?: number;
                latitude?: number;
                longitude?: number;
                name?: string;
                address?: string;
            };
            location?: {
                degreesLatitude?: number;
                degreesLongitude?: number;
                latitude?: number;
                longitude?: number;
                name?: string;
                address?: string;
            };
        };
        messageType?: string;
    };
}

async function sendWhatsAppMessage(instance: string, to: string, text: string): Promise<void> {
    const evolutionUrl = process.env.EVOLUTION_API_URL || "https://evolution.whoopflow.com";
    const evolutionKey = process.env.EVOLUTION_API_KEY || "";

    try {
        const response = await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": evolutionKey
            },
            body: JSON.stringify({
                number: to.replace("@s.whatsapp.net", ""),
                text: text
            })
        });

        if (!response.ok) {
            console.error(`[Evolution] Failed to send message: ${response.status}`);
        }
    } catch (error) {
        console.error(`[Evolution] Error sending message:`, error);
    }
}

app.post("/webhook/evolution", async (req: Request, res: Response): Promise<void> => {
    const requestId = (req as any).requestId || crypto.randomUUID().substring(0, 8);

    try {
        const payload = req.body as EvolutionWebhook;

        if (payload.event !== "messages.upsert") {
            res.json({ status: "ignored", reason: "not a message event" });
            return;
        }

        if (payload.data?.key?.fromMe) {
            res.json({ status: "ignored", reason: "message from self" });
            return;
        }

        const msg = payload.data?.message;
        const messageKeys = msg ? Object.keys(msg) : [];
        console.log(`[${requestId}] [Evolution] message keys: ${messageKeys.join(", ") || "(none)"}`);

        let messageText = msg?.conversation || msg?.extendedTextMessage?.text || "";
        let imageUrl: string | undefined;

        const imageMsg = msg?.imageMessage;
        if (imageMsg) {
            imageUrl = imageMsg.url || imageMsg.directUrl;
            if (imageMsg.base64) {
                imageUrl = `data:image/jpeg;base64,${imageMsg.base64}`;
            }
            console.log(`[${requestId}] [Evolution] imageMessage: url=${!!imageMsg.url}, directUrl=${!!imageMsg.directUrl}, base64=${!!imageMsg.base64} (len=${imageMsg.base64?.length ?? 0}), caption=${(imageMsg.caption || "").substring(0, 40)}`);
            if (!messageText && imageMsg.caption) {
                messageText = imageMsg.caption;
            }
            if (!messageText) {
                messageText = "[El usuario envió una foto]";
            }
        }

        const locationMsg = msg?.locationMessage ?? msg?.location;
        if (locationMsg) {
            const lat = locationMsg.degreesLatitude ?? locationMsg.latitude;
            const lng = locationMsg.degreesLongitude ?? locationMsg.longitude;
            const name = locationMsg.name || locationMsg.address || "";
            console.log(`[${requestId}] [Evolution] locationMessage: lat=${lat}, lng=${lng}, name=${name || "(empty)"}, address=${(locationMsg.address || "").substring(0, 40) || "(empty)"}`);
            const coords = lat != null && lng != null ? `Coordenadas: lat ${lat}, lng ${lng}.` : "";
            const locationText = name
                ? `[El usuario compartió su ubicación: ${name}. ${coords}]`
                : coords
                    ? `[El usuario compartió su ubicación: ${coords}]`
                    : "[El usuario compartió su ubicación]";
            messageText = messageText ? `${messageText}\n${locationText}` : locationText;
            console.log(`[${requestId}] [Evolution] location parsed -> input: "${locationText.substring(0, 80)}..."`);
        }

        if (!messageText && !imageUrl) {
            const msgPreview: Record<string, string> = {};
            if (msg) {
                for (const k of messageKeys) {
                    const v = (msg as Record<string, unknown>)[k];
                    if (v && typeof v === "object" && !Array.isArray(v)) {
                        msgPreview[k] = JSON.stringify(Object.keys(v as object));
                    } else {
                        msgPreview[k] = typeof v;
                    }
                }
            }
            console.log(`[${requestId}] [Evolution] ignored: no text or image content. Message preview: ${JSON.stringify(msgPreview)}`);
            res.json({ status: "ignored", reason: "no text, image or location content" });
            return;
        }

        if (!messageText) {
            messageText = "[El usuario envió una foto]";
        }

        const remoteJid = payload.data.key.remoteJid;
        const instance = payload.instance;

        console.log(`[${requestId}] [Evolution] from ${remoteJid} -> input_as_text: "${messageText.substring(0, 80)}..."${imageUrl ? ", image_url: (set)" : ""}`);

        const result = await runWorkflow({
            input_as_text: messageText,
            image_url: imageUrl,
            conversationId: remoteJid,
            metadata: {
                source: "evolution",
                instance: instance,
                pushName: payload.data.pushName
            }
        });

        if (result.output_text) {
            await sendWhatsAppMessage(instance, remoteJid, result.output_text);
        }

        console.log(`[${requestId}] Response sent to ${remoteJid}`);

        res.json({
            status: "ok",
            classification: result.classification,
            responseLength: result.output_text?.length || 0
        });

    } catch (error) {
        console.error(`[${requestId}] Evolution webhook error:`, error);
        res.status(500).json({ status: "error", message: "Internal error" });
    }
});

// Legacy endpoint support
app.post("/chat", handleChat);

// ============================================
// Error Handling
// ============================================

app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: "Not found",
        message: `Route ${req.method} ${req.path} not found`,
        availableEndpoints: [
            "GET /health - Health check",
            "GET /status - Detailed status",
            "POST /api/chat - Main chat endpoint",
            "POST /webhook - Webhook endpoint",
            "POST /webhook/evolution - Evolution API webhook (WhatsApp)"
        ]
    });
});

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled error:", error);

    res.status(500).json({
        error: NODE_ENV === "development" ? error.message : "Internal server error",
        response: "Lo siento, ocurrio un error inesperado.",
        conversationId: crypto.randomUUID()
    });
});

// ============================================
// Server Startup
// ============================================

const server = app.listen(PORT, () => {
    console.log(`
========================================
  AquaHub Agent Server v2.0
========================================
  Running on port ${PORT}
  Health: http://localhost:${PORT}/health
  Status: http://localhost:${PORT}/status
  Chat:   http://localhost:${PORT}/api/chat
  Webhook: http://localhost:${PORT}/webhook
  Environment: ${NODE_ENV}
========================================
    `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("\nSIGTERM received, shutting down gracefully...");
    server.close(() => {
        console.log("Server closed");
        process.exit(0);
    });
});

process.on("SIGINT", () => {
    console.log("\nSIGINT received, shutting down gracefully...");
    server.close(() => {
        console.log("Server closed");
        process.exit(0);
    });
});

export default app;
