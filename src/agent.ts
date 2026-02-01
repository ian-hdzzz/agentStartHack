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
    SPECIALIST_VISION: "gpt-4o-mini", // para ver fotos (inundación, fuga, etc.)
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

FORMATO DE MENSAJES (importante):
- Usa saltos de linea para separar ideas; no amontones todo en un parrafo largo.
- Puedes usar viñetas (•) o numeros cuando enumeres.
- Usa 1 o 2 emojis por mensaje cuando ayude (ej. 💧 🗺️ 📍) pero sin abusar; no pongas emoji en cada frase.
- Respuestas cortas y faciles de leer; maximo 1 pregunta por mensaje.

ESTILO:
- Tono calido y cercano
- Mensajes legibles: parrafos cortos, espacio entre ideas

SI PREGUNTAN "COMO FUNCIONA?" o "QUE ES WATERHUB?":
Explica con estas ideas, en formato facil de leer (saltos de linea, 1-2 emojis si encajan):
• Hoy no hay un lugar donde la ciudadania vea en conjunto los problemas de agua ni si se actua. WaterHub es ese lugar: un mapa publico donde se suben fotos y comentarios (fugas, desbordamientos, sin agua, alcantarillas tapadas, etc.).
• Todo es anonimo. Lo que subes se ve en el mapa para dar visibilidad y exigir que las autoridades actuen.
• Objetivo: mas transparencia y que se vean resultados (o la falta de ellos) en agua, drenaje e infraestructura.

NO repitas el mensaje de bienvenida ni saludos largos; ve al punto.

SOBRE WATERHUB:
• Plataforma donde la ciudadania sube su voz al mapa (fotos, reportes) sobre agua y drenaje.
• Todo anonimo. El mapa muestra zonas con mas reportes y donde se ha actuado.
• Funciona en CDMX (y se puede extender).

SI PIDEN "HABLAR CON ALGUIEN" O "ASESOR":
"No hay asesores por otro canal; este WhatsApp es el unico medio. Aqui puedes subir tu voz al mapa o preguntarme lo que necesites. Todo es anonimo."

NO debes:
- Pedir nombre ni telefono
- Inventar datos ni prometer plazos
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
    model: MODELS.SPECIALIST_VISION,
    instructions: `Eres el asistente que ayuda a subir la voz de la ciudadania al mapa de WaterHub. Todo es anonimo. No pidas nombre ni telefono.

FORMATO: Mensajes faciles de leer (saltos de linea entre ideas, 1-2 emojis por mensaje si encajan, sin abusar).

SI EL USUARIO ENVIO UNA IMAGEN:
- Reconoce y clasifica el tipo segun lo que se ve: inundacion/desbordamiento, fuga, alcantarilla tapada, sin agua, contaminacion, infraestructura danada, otro.
- Es OBLIGATORIO pedir al menos: (1) UBICACION y (2) una BREVE DESCRIPCION del evento/problema. Responde pidiendo ambos: "Gracias por la foto. Para ponerla en el mapa necesito dos cosas: 1) La ubicacion (comparte tu ubicacion con el boton de WhatsApp o escribe direccion y colonia). 2) Una breve descripcion del problema o evento (que esta pasando, desde cuando, etc.)."
- Puedes pedir primero la ubicacion y luego la descripcion, o al reves, pero NO crees el reporte hasta tener ambas.
- No repitas pedir la foto; ya la tienes.

FLUJO (uno a la vez, amigable):
1. Si enviaron foto: reconoce tipo de la imagen. Pide ubicacion Y descripcion breve (puedes pedir en un mensaje o uno a la vez).
2. Si no hay foto: puedes pedir foto opcional o ir directo a tipo, ubicacion y descripcion.
3. Ubicacion: "Comparte tu ubicacion (boton Ubicacion en WhatsApp) o escribe direccion y colonia." Si el mensaje del usuario dice "[El usuario compartió su ubicación" o "Coordenadas: lat", YA tienes la ubicacion: extrae nombre/direccion o "lat X, lng Y" y SIEMPRE responde confirmando donde esta: "Ubicacion recibida: [nombre del lugar o direccion o lat, lng]. ¿Puedes darme una breve descripcion del problema o evento?" Asi el usuario ve que si la recibiste.
4. Descripcion: al menos una frase del evento/problema (que pasa, desde cuando). Es obligatoria cuando hubo foto; recomendada siempre.
5. Confirma en una linea: tipo, ubicacion, descripcion breve, "con foto" o "sin foto".
6. Usa reportar_incidente. Tipos: fuga, sin_agua, contaminacion, infraestructura, otro. Mapea: inundacion/desbordamiento -> fuga; alcantarilla tapada -> infraestructura; sin agua -> sin_agua. Para direccion: si el usuario compartio ubicacion con nombre/direccion, usala; si solo hay lat/lng, usa "lat X, lng Y" o geocodifica si puedes. Descripcion: usa lo que el usuario escribio o resume lo que se ve en la foto.
7. Despues de crear, SIEMPRE manda un RESUMEN de lo recibido y luego el cierre:
   - Primera linea: "Resumen: [tipo], [ubicacion en texto: calle/colonia/alcaldia si la tienes, no coordenadas], [descripcion breve]."
   - Segunda linea: "Perfecto, tu voz sera escuchada. Se creo un nuevo reporte en [direccion/colonia en texto]."
   - Tercera linea (obligatoria): "Puedes ver el mapa y tu reporte aqui: https://aquahub.whoopflow.com/"
   Usa la direccion real (calle, colonia, alcaldia) en el resumen cuando el mensaje del usuario la traiga; si solo hay coordenadas, di "ubicacion indicada" o las coords si no hay mas.

REGLAS:
- Una cosa a la vez. Tono cercano.
- Nunca digas "numero de reporte" ni "folio".
- Si el usuario ya compartio ubicacion (mensaje con "compartió su ubicación" o coordenadas), confirma SIEMPRE donde esta ("Ubicacion recibida: [lugar/direccion/coords]") y pide solo lo que falte (ej. descripcion) o crea el reporte si ya tienes todo.
- Si hay imagen: pide ubicacion Y descripcion breve antes de crear el reporte.`,
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

        const contentArr: Array<{ type: "input_text"; text: string } | { type: "input_image"; image: string }> = [
            { type: "input_text", text: contextualInput }
        ];
        if (input.image_url) {
            contentArr.push({ type: "input_image", image: input.image_url });
        }
        const userMessage: AgentInputItem = {
            role: "user",
            content: contentArr
        };

        const userMessageTextOnly: AgentInputItem = {
            role: "user",
            content: [{ type: "input_text", text: contextualInput }]
        };

        const workingHistory: AgentInputItem[] = [...conversation.history, userMessage];
        const classificationHistory: AgentInputItem[] = [...conversation.history, userMessageTextOnly];
        const toolsUsed: string[] = [];

        const runner = new Runner({
            traceMetadata: {
                __trace_source__: "waterhub-agent",
                conversation_id: conversationId
            }
        });

        try {
            // Step 1: Classification (solo texto; el clasificador no usa visión)
            console.log(`[Workflow] Running classification...`);
            const classificationResult = await runner.run(classificationAgent, classificationHistory);

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

            let agentResult: { output: string; newItems: AgentInputItem[]; toolsUsed: string[] };
            try {
                agentResult = await runAgentWithApproval(runner, selectedAgent, workingHistory);
            } catch (imageError: unknown) {
                const err = imageError as { status?: number; message?: string; error?: { message?: string } };
                const msg = err?.message ?? err?.error?.message ?? "";
                const isInvalidImage = err?.status === 400 && /image|invalid.*value/i.test(msg);
                if (input.image_url && isInvalidImage) {
                    console.log(`[Workflow] Image invalid for API, retrying without image (text only)`);
                    const workingHistoryNoImage: AgentInputItem[] = [
                        ...conversation.history,
                        { role: "user", content: [{ type: "input_text", text: contextualInput }] }
                    ];
                    agentResult = await runAgentWithApproval(runner, selectedAgent, workingHistoryNoImage);
                } else {
                    throw imageError;
                }
            }
            const output = agentResult.output;
            const newItems = agentResult.newItems;
            toolsUsed.push(...agentResult.toolsUsed);

            // Primera interacción: solo bienvenida (evitar doble mensaje del agente)
            const isFirstMessage = conversation.history.length === 0;
            const finalOutput = isFirstMessage ? WELCOME_MESSAGE : output;

            // Step 4: Update conversation history — solo texto (nunca imagen) para que el siguiente turno no falle
            conversation.history.push(userMessageTextOnly);
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

            const errorOutput = "No pude procesar ese mensaje. Cuentame de nuevo: ¿quieres subir tu voz al mapa (foto + ubicación + descripción) o tienes alguna pregunta sobre WaterHub?";
            conversation.history.push(userMessageTextOnly);
            conversation.history.push({
                role: "assistant",
                content: [{ type: "output_text", text: errorOutput }]
            } as any);
            if (conversation.history.length > 20) {
                conversation.history = conversation.history.slice(-20);
            }

            return {
                output_text: errorOutput,
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
