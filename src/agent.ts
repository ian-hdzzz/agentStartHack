// ============================================
// WaterHub Agent System - Community Map / Voice
// ============================================

import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { z } from "zod";
import type { WorkflowInput, WorkflowOutput, Classification } from "./types.js";
import { reportarIncidenteTool, getMexicoDate } from "./tools.js";

// Mensaje de bienvenida (solo primera interacción) — amigable, comunidad, anonimato
const WELCOME_MESSAGE = `¡Hola! 👋 Bienvenido a WaterHub. Aquí tu voz cuenta: todo es anónimo y lo que subas se ve en el mapa para más transparencia y acción. ¿Quieres subir tu voz al mapa o saber cómo funciona?`;

// ============================================
// Configuration
// ============================================

const MODELS = {
    CLASSIFIER: "gpt-4.1-mini",
    SPECIALIST: "gpt-4.1",
    INFO: "gpt-4.1-mini"
} as const;

// ============================================
// Conversation Store (Production: use Redis)
// ============================================

interface ConversationEntry {
    history: AgentInputItem[];
    lastAccess: Date;
    classification?: Classification;
    ciudadanoNombre?: string;
    alcaldia?: string;
}

const conversationStore = new Map<string, ConversationEntry>();

// Cleanup old conversations (1 hour expiry)
setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of conversationStore.entries()) {
        if (now - entry.lastAccess.getTime() > 3600000) {
            conversationStore.delete(id);
        }
    }
}, 300000);

function getConversation(id: string): ConversationEntry {
    const existing = conversationStore.get(id);
    if (existing) {
        existing.lastAccess = new Date();
        return existing;
    }

    const newEntry: ConversationEntry = {
        history: [],
        lastAccess: new Date()
    };
    conversationStore.set(id, newEntry);
    return newEntry;
}

// ============================================
// Agent Schemas
// ============================================

const ClassificationSchema = z.object({
    classification: z.enum(["subir_voz", "informacion"]),
    confidence: z.number().min(0).max(1).nullable().describe("Confidence score for classification (optional)"),
    extractedAlcaldia: z.string().nullable().describe("Alcaldia extraida del mensaje si se menciona (optional)")
});

// ============================================
// System Context Builder
// ============================================

function buildSystemContext(): string {
    const now = getMexicoDate();
    const dateStr = now.toLocaleDateString('es-MX', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    return `[Fecha: ${dateStr}, Hora: ${timeStr} (hora de Ciudad de Mexico)]`;
}

// ============================================
// Classification Agent
// ============================================

const classificationAgent = new Agent({
    name: "Clasificador WaterHub",
    model: MODELS.CLASSIFIER,
    instructions: `Eres el clasificador de intenciones para WaterHub, la plataforma donde la ciudadania sube su voz al mapa (fotos, reportes, comentarios sobre agua) para transparencia y accion. Categoriza cada mensaje.

CATEGORIAS:
- "subir_voz": Quiere subir algo al mapa: foto, reporte, queja, problema de agua (fuga, desbordamiento, alcantarilla tapada, sin agua, contaminacion, drenaje, etc.). Cualquier intencion de "reportar", "subir", "publicar", "poner en el mapa".
- "informacion": Preguntas generales, que es WaterHub, como funciona, ver el mapa, comunidad, transparencia, saludos. Tambien si pide "hablar con alguien" o "asesor" -> informacion (no hay asesores; este WhatsApp es el unico canal).

REGLAS:
1. "Quiero reportar", "subir una foto", "hay una fuga", "no tenemos agua", "alcantarilla tapada", "desbordamiento", "quiero poner en el mapa" -> subir_voz
2. "Hola", "que es WaterHub", "como funciona", "donde veo el mapa", "quiero hablar con alguien", "asesor" -> informacion

Si detectas una alcaldia de CDMX, extraela en extractedAlcaldia.`,
    outputType: ClassificationSchema,
    modelSettings: {
        temperature: 0.3,
        maxTokens: 256
    }
});

// ============================================
// Information Agent (General queries)
// ============================================

const informacionAgent = new Agent({
    name: "WaterHub - Informacion",
    model: MODELS.INFO,
    instructions: `Eres el asistente virtual de WaterHub. Tono amigable, crear comunidad, transparencia.

Tu rol es responder preguntas generales sobre WaterHub.

ESTILO:
- Tono calido y cercano
- Respuestas cortas y directas
- Maximo 1 pregunta por respuesta

SI PREGUNTAN "COMO FUNCIONA?" o "QUE ES WATERHUB?":
Explica con estas ideas (con tus palabras, tono cercano):
- Hoy no hay un lugar donde la ciudadania pueda ver en conjunto los problemas de agua ni si se esta haciendo algo al respecto. WaterHub es ese lugar: un mapa publico donde se suben fotos y comentarios sobre agua en tu zona (fugas, desbordamientos, sin agua, alcantarillas tapadas, etc.).
- Todo es anonimo. Lo que subes se ve en el mapa para dar visibilidad y exigir que las autoridades actuen; asi la gente puede ver donde se concentran las quejas y donde el gobierno ha tomado accion (o no).
- Objetivo: mas transparencia, que la poblacion se sienta escuchada y que se vean los resultados (o la falta de ellos) de la accion de gobierno en agua, drenaje e infraestructura.

NO repitas el mensaje de bienvenida ni saludos largos; ve al punto.

SOBRE WATERHUB:
- Plataforma donde la ciudadania sube su voz al mapa (fotos, reportes) sobre agua, drenaje, sistemas fluviales
- Todo es anonimo por diseño
- El mapa muestra zonas con mas reportes y donde se ha actuado
- Funciona en CDMX (y se puede extender)

SI PIDEN "HABLAR CON ALGUIEN" O "ASESOR":
"No hay asesores por otro canal; este WhatsApp es el unico medio de WaterHub. Aqui puedes subir tu voz al mapa (foto o comentario sobre agua en tu zona) o preguntarme lo que necesites. Todo es anonimo."

NO debes:
- Pedir nombre ni telefono
- Inventar datos ni prometer plazos de atencion
- Ofrecer contacto con asesores humanos`,
    modelSettings: {
        temperature: 0.7,
        maxTokens: 512
    }
});

// ============================================
// Subir Voz Agent (post to map — anonymous)
// ============================================

const subirVozAgent = new Agent({
    name: "WaterHub - Subir Voz",
    model: MODELS.SPECIALIST,
    instructions: `Eres el asistente que ayuda a subir la voz de la ciudadania al mapa de WaterHub. Todo es anonimo. No pidas nombre ni telefono.

FLUJO (uno a la vez, amigable):
1. Si pueden, pide una foto del lugar o del problema (opcional: "Si no tienes foto, escribe 'sin foto'").
2. Pregunta que tipo es: desbordamiento/inundacion, alcantarilla tapada/drenaje obstruido, sin agua/corte, fuga en via publica, agua sucia/contaminacion, otro.
3. Pregunta donde es: "Comparte tu ubicacion en el mapa (un toque) o escribe la direccion y colonia." Necesitas direccion y colonia (y alcaldia si se puede inferir) para el mapa.
4. Opcional: una frase de descripcion ("¿Que esta pasando y desde cuando aproximadamente?").
5. Confirma en una linea: tipo, ubicacion, "con foto" o "sin foto".
6. Usa reportar_incidente para registrarlo. Tipos del sistema: fuga, sin_agua, contaminacion, infraestructura, otro. Mapea: desbordamiento -> fuga; alcantarilla tapada -> infraestructura; sin agua -> sin_agua; contaminacion -> contaminacion.
7. Despues de crear, responde EXACTAMENTE con este mensaje amigable (sin numero de reporte): "¡Genial! Tu voz ya esta en el mapa. Se ve en WaterHub para que la comunidad y las autoridades lo vean. Si mas personas reportan lo mismo en la zona, se le da mas prioridad."

REGLAS:
- Una cosa a la vez. Tono cercano, crear comunidad.
- Nunca digas "numero de reporte" ni "folio". Solo "Tu voz ya esta en el mapa."
- Descripcion puede ser breve; si no dan, usa algo generico como "Reporte ciudadano" pero pide al menos tipo y ubicacion.`,
    tools: [reportarIncidenteTool],
    modelSettings: {
        temperature: 0.5,
        maxTokens: 1024
    }
});

// ============================================
// Agent Router Map
// ============================================

const agentMap: Record<Classification, Agent<any>> = {
    subir_voz: subirVozAgent,
    informacion: informacionAgent
};

// ============================================
// Runner with Auto-Approval
// ============================================

async function runAgentWithApproval(
    runner: Runner,
    agent: Agent<any>,
    history: AgentInputItem[]
): Promise<{ output: string; newItems: AgentInputItem[]; toolsUsed: string[] }> {
    const result = await runner.run(agent, history);
    const toolsUsed: string[] = [];

    for (const item of result.newItems) {
        const rawItem = (item as any).rawItem || item;
        if (rawItem.type === "hosted_tool_call" && rawItem.name) {
            toolsUsed.push(rawItem.name);
        }
    }

    let output = result.finalOutput;

    if (!output) {
        for (let i = result.newItems.length - 1; i >= 0; i--) {
            const rawItem = (result.newItems[i] as any).rawItem || result.newItems[i];
            if (rawItem.role === 'assistant' && rawItem.content) {
                if (typeof rawItem.content === 'string') {
                    output = rawItem.content;
                    break;
                } else if (Array.isArray(rawItem.content)) {
                    output = rawItem.content.map((c: any) => c.text || c.output_text || '').filter(Boolean).join('');
                    if (output) break;
                }
            }
        }
    }

    const newItems = result.newItems.map((item: any) => (item as any).rawItem || item);

    return { output: output || '', newItems, toolsUsed };
}

// ============================================
// Main Workflow Function
// ============================================

export async function runWorkflow(input: WorkflowInput): Promise<WorkflowOutput> {
    const startTime = Date.now();
    const conversationId = input.conversationId || crypto.randomUUID();

    return await withTrace("WaterHub-Agent", async () => {
        console.log(`\n========== WORKFLOW START ==========`);
        console.log(`ConversationId: ${conversationId}`);
        console.log(`Input: "${input.input_as_text}"`);

        const conversation = getConversation(conversationId);

        const contextualInput = `${buildSystemContext()}\n${input.input_as_text}`;

        const userMessage: AgentInputItem = {
            role: "user",
            content: [{ type: "input_text", text: contextualInput }]
        };

        const workingHistory: AgentInputItem[] = [...conversation.history, userMessage];
        const toolsUsed: string[] = [];

        const runner = new Runner({
            traceMetadata: {
                __trace_source__: "waterhub-agent",
                conversation_id: conversationId
            }
        });

        try {
            // Step 1: Classification
            console.log(`[Workflow] Running classification...`);
            const classificationResult = await runner.run(classificationAgent, workingHistory);

            if (!classificationResult.finalOutput) {
                throw new Error("Classification failed - no output");
            }

            const classification = classificationResult.finalOutput.classification as Classification;
            const extractedAlcaldia = classificationResult.finalOutput.extractedAlcaldia;

            console.log(`[Workflow] Classification: ${classification}`);
            if (extractedAlcaldia) {
                console.log(`[Workflow] Extracted alcaldia: ${extractedAlcaldia}`);
                conversation.alcaldia = extractedAlcaldia;
            }

            conversation.classification = classification;

            // Step 2: Route to specialized agent
            const selectedAgent = agentMap[classification];
            console.log(`[Workflow] Routing to: ${selectedAgent.name}`);

            const agentResult = await runAgentWithApproval(runner, selectedAgent, workingHistory);
            const output = agentResult.output;
            const newItems = agentResult.newItems;
            toolsUsed.push(...agentResult.toolsUsed);

            // Primera interacción: solo bienvenida (evitar doble mensaje del agente)
            const isFirstMessage = conversation.history.length === 0;
            const finalOutput = isFirstMessage ? WELCOME_MESSAGE : output;

            // Step 4: Update conversation history (store what the user saw)
            conversation.history.push(userMessage);
            if (newItems.length > 0) {
                conversation.history.push(...newItems);
            } else if (finalOutput) {
                conversation.history.push({
                    role: "assistant",
                    content: [{ type: "output_text", text: finalOutput }]
                } as any);
            }

            // Limit history length (keep last 20 messages)
            if (conversation.history.length > 20) {
                conversation.history = conversation.history.slice(-20);
            }

            const processingTime = Date.now() - startTime;
            console.log(`[Workflow] Complete in ${processingTime}ms`);
            console.log(`[Workflow] Output: "${finalOutput.substring(0, 100)}..."`);
            console.log(`========== WORKFLOW END ==========\n`);

            return {
                output_text: finalOutput,
                classification,
                toolsUsed
            };

        } catch (error) {
            console.error(`[Workflow] Error:`, error);

            return {
                output_text: "Lo siento, tuve un problema procesando tu mensaje. Podrias intentar de nuevo?",
                error: error instanceof Error ? error.message : "Unknown error",
                toolsUsed
            };
        }
    });
}

// ============================================
// Health Check for Agents
// ============================================

export function getAgentHealth(): { status: string; agents: string[]; conversationCount: number } {
    return {
        status: "healthy",
        agents: [
            classificationAgent.name,
            subirVozAgent.name,
            informacionAgent.name
        ],
        conversationCount: conversationStore.size
    };
}
