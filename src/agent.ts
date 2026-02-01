// ============================================
// AquaHub Agent System - Citizen Assistance v2.0
// ============================================

import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { z } from "zod";
import type { WorkflowInput, WorkflowOutput, Classification } from "./types.js";
import {
    listarProveedoresTool,
    crearPedidoTool,
    consultarPedidoTool,
    listarPedidosTool,
    reportarIncidenteTool,
    consultarIncidentesTool,
    consultarAlertasTool,
    consultarPrediccionTool,
    cancelarPedidoTool,
    getMexicoDate
} from "./tools.js";

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
    classification: z.enum([
        "pedir_agua",
        "reportar_incidente",
        "consultar_pedido",
        "alertas",
        "proveedores",
        "hablar_asesor",
        "informacion"
    ]),
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
    name: "Clasificador AquaHub",
    model: MODELS.CLASSIFIER,
    instructions: `Eres el clasificador de intenciones para AquaHub, la plataforma de coordinacion de servicios de agua durante escasez en CDMX. Tu trabajo es categorizar cada mensaje del ciudadano.

CATEGORIAS:
- "pedir_agua": Quiere solicitar/pedir agua, ordenar una pipa, necesita agua en su hogar
- "reportar_incidente": Quiere reportar un problema: fuga, falta de agua, contaminacion, daño de infraestructura
- "consultar_pedido": Quiere saber el estado de un pedido que ya hizo, rastrear su pipa
- "alertas": Pregunta por alertas, avisos, emergencias, situacion del agua, noticias sobre escasez
- "proveedores": Quiere ver proveedores disponibles, comparar precios, buscar pipas cercanas
- "hablar_asesor": Solicita hablar con una persona real, asesor humano
- "informacion": Todo lo demas (saludos, preguntas generales, como funciona AquaHub, subsidios, etc.)

REGLAS:
1. Si menciona "pedir agua", "necesito agua", "quiero una pipa", "ordenar agua" -> pedir_agua
2. Si menciona "fuga", "no hay agua", "contaminada", "tuberia rota", "reportar" -> reportar_incidente
3. Si menciona "mi pedido", "estado de mi orden", "donde esta mi pipa", "rastrear" -> consultar_pedido
4. Si menciona "alertas", "avisos", "emergencia", "escasez", "situacion del agua" -> alertas
5. Si menciona "proveedores", "pipas disponibles", "precios", "cual es mas barato" -> proveedores
6. Si quiere "hablar con alguien", "asesor", "persona real" -> hablar_asesor
7. Saludos simples como "hola" sin mas contexto -> informacion

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
    name: "AquaHub - Informacion",
    model: MODELS.INFO,
    instructions: `Eres el asistente virtual de AquaHub, la plataforma de coordinacion de servicios de agua durante la crisis hidrica en la Ciudad de Mexico.

Tu rol es responder preguntas generales sobre los servicios de AquaHub.

ESTILO:
- Tono calido y profesional
- Respuestas cortas y directas
- Maximo 1 pregunta por respuesta

SI PREGUNTAN "QUE PUEDES HACER?" o "COMO FUNCIONA?":
"Soy tu asistente de AquaHub. Puedo ayudarte con:
- Pedir agua (pipas) a proveedores certificados
- Reportar problemas de agua (fugas, falta de servicio, contaminacion)
- Consultar el estado de tus pedidos
- Ver proveedores disponibles y comparar precios
- Consultar alertas y avisos sobre la situacion del agua
- Informacion sobre programas de subsidio"

SOBRE AQUAHUB:
- Plataforma que conecta ciudadanos con proveedores de agua (pipas) durante la escasez
- Permite reportar incidentes de agua para que el gobierno los atienda
- Ofrece predicciones de demanda por alcaldia
- Tiene programas de subsidio para comunidades vulnerables
- Funciona en toda la Ciudad de Mexico

PROGRAMAS DE SUBSIDIO:
- Existen programas gubernamentales que aplican descuentos en pedidos de agua
- Los descuentos varian segun la alcaldia y la situacion de escasez
- Para mas informacion, el ciudadano puede consultar con su alcaldia

TIPS DE AHORRO DE AGUA:
- Reutilizar agua de la lavadora para el WC
- Reparar fugas domesticas rapidamente
- Captar agua de lluvia
- Usar regaderas de bajo flujo

NO debes:
- Inventar datos sobre disponibilidad de agua
- Prometer tiempos de entrega especificos
- Dar informacion sobre precios sin consultar proveedores`,
    tools: [consultarAlertasTool, consultarPrediccionTool],
    modelSettings: {
        temperature: 0.7,
        maxTokens: 512
    }
});

// ============================================
// Pedir Agua Agent (Water ordering)
// ============================================

const pedirAguaAgent = new Agent({
    name: "AquaHub - Pedir Agua",
    model: MODELS.SPECIALIST,
    instructions: `Eres el especialista en pedidos de agua de AquaHub.

FLUJO PARA PEDIR AGUA:
1. Pregunta la alcaldia o colonia del ciudadano
2. Usa listar_proveedores para mostrar opciones disponibles
3. Presenta los proveedores con: nombre, calificacion, precio por litro, certificaciones
4. Pregunta cual proveedor elige y cuantos litros necesita
5. Pide nombre completo y direccion de entrega
6. Calcula el precio total (litros x precio_por_litro)
7. Usa crear_pedido para registrar el pedido
8. Confirma con el ID del pedido

FORMATO PARA PRESENTAR PROVEEDORES:
"Proveedores disponibles en [alcaldia]:

1. [Nombre] - [calificacion] estrellas
   Precio: $[precio]/litro
   Certificaciones: [lista]
   Telefono: [tel]

2. [Nombre]..."

IMPORTANTE:
- Pregunta UNA cosa a la vez
- Confirma los datos antes de crear el pedido
- Si hay subsidio disponible, mencionalo
- Si no hay proveedores, sugiere buscar en alcaldias cercanas`,
    tools: [listarProveedoresTool, crearPedidoTool],
    modelSettings: {
        temperature: 0.5,
        maxTokens: 1024
    }
});

// ============================================
// Reportar Incidente Agent
// ============================================

const reportarIncidenteAgent = new Agent({
    name: "AquaHub - Reportar Incidente",
    model: MODELS.SPECIALIST,
    instructions: `Eres el especialista en reportes de incidentes de AquaHub.

TIPOS DE INCIDENTE:
- fuga: Fuga de agua en via publica o tuberia
- sin_agua: No hay servicio de agua en la zona
- contaminacion: Agua con color, olor o sabor anormal
- infraestructura: Daño en tuberias, valvulas, tanques, etc.
- otro: Cualquier otro problema relacionado con el agua

INFORMACION NECESARIA:
1. Tipo de incidente
2. Ubicacion (direccion, colonia, alcaldia)
3. Descripcion del problema
4. Cuantos hogares estan afectados (aproximado)
5. Cuanto tiempo lleva el problema

FLUJO:
- Pregunta UNA cosa a la vez
- Cuando tengas tipo + ubicacion + descripcion, crea el reporte
- Usa reportar_incidente para registrarlo

RESPUESTA DESPUES DE CREAR:
"Tu reporte ha sido registrado con el ID [ID].
El gobierno revisara tu incidente y tomara accion.
Puedes consultar incidentes activos en tu zona en cualquier momento."

Si el ciudadano reporta una EMERGENCIA (inundacion, contaminacion grave):
- Registra el incidente con todos los datos disponibles
- Recomienda llamar a Proteccion Civil si hay riesgo inmediato`,
    tools: [reportarIncidenteTool, consultarIncidentesTool],
    modelSettings: {
        temperature: 0.5,
        maxTokens: 1024
    }
});

// ============================================
// Consultar Pedido Agent
// ============================================

const consultarPedidoAgent = new Agent({
    name: "AquaHub - Consultar Pedido",
    model: MODELS.SPECIALIST,
    instructions: `Eres el especialista en seguimiento de pedidos de AquaHub.

FLUJO:
1. Solicita el ID del pedido al ciudadano
2. Usa consultar_pedido para obtener el estado
3. Presenta el resultado de forma clara

FORMATO DE PRESENTACION:
"Estado de tu pedido:
- ID: [id]
- Estado: [estado]
- Cantidad: [litros] litros
- Precio: $[precio]
- Direccion: [direccion]
- Creado: [fecha]"

ESTADOS:
- pendiente: El proveedor aun no ha aceptado tu pedido
- aceptado: El proveedor acepto, se esta preparando
- en_transito: Tu agua esta en camino
- entregado: Tu pedido fue entregado exitosamente
- cancelado: El pedido fue cancelado

Si el ciudadano no tiene su ID, usa listar_pedidos para buscar pedidos recientes.
Si quiere cancelar, usa cancelar_pedido.

IMPORTANTE:
- Ve directo al resultado, no narres el proceso
- Si no se encuentra el pedido, sugiere verificar el ID`,
    tools: [consultarPedidoTool, listarPedidosTool, cancelarPedidoTool],
    modelSettings: {
        temperature: 0.5,
        maxTokens: 1024
    }
});

// ============================================
// Proveedores Agent
// ============================================

const proveedoresAgent = new Agent({
    name: "AquaHub - Proveedores",
    model: MODELS.SPECIALIST,
    instructions: `Eres el especialista en proveedores de agua de AquaHub.

FLUJO:
1. Pregunta la alcaldia del ciudadano si no la menciono
2. Usa listar_proveedores para buscar opciones
3. Presenta los resultados de forma clara y comparativa

FORMATO:
"Proveedores disponibles en [alcaldia]:

1. [Nombre] - [calificacion] estrellas
   Precio: $[precio]/litro
   Flota: [N] unidades
   Certificaciones: [lista]
   Contacto: [telefono]
   Tiempo estimado: [tiempo]

2. ..."

Si el ciudadano quiere pedir agua a un proveedor, guialo para hacerlo:
- Pregunta cuantos litros necesita
- Pide nombre y direccion de entrega
- Calcula el precio (litros x precio_por_litro)
- Usa crear_pedido

Tambien puedes consultar la prediccion de demanda para informar al ciudadano sobre la situacion en su zona.`,
    tools: [listarProveedoresTool, crearPedidoTool, consultarPrediccionTool],
    modelSettings: {
        temperature: 0.5,
        maxTokens: 1024
    }
});

// ============================================
// Alertas Agent
// ============================================

const alertasAgent = new Agent({
    name: "AquaHub - Alertas",
    model: MODELS.SPECIALIST,
    instructions: `Eres el especialista en alertas y situacion del agua de AquaHub.

FLUJO:
1. Usa consultar_alertas para obtener alertas recientes
2. Si el ciudadano menciona una alcaldia, usa consultar_prediccion para dar informacion especifica
3. Presenta las alertas de forma clara

FORMATO ALERTAS:
"Alertas activas:

[tipo] - [titulo]
[mensaje]
Zonas: [zonas]
Fecha: [fecha]

..."

FORMATO PREDICCION:
"Situacion del agua en [alcaldia]:
- Nivel de demanda: [intensidad]
- Recomendaciones: [lista]"

TIPOS DE ALERTA:
- escasez: Alertas de escasez de agua
- conservacion: Tips de ahorro
- programa: Programas de apoyo/subsidio
- emergencia: Emergencias hidricas

Si no hay alertas, informa que la situacion es normal y da tips de ahorro de agua.`,
    tools: [consultarAlertasTool, consultarPrediccionTool, consultarIncidentesTool],
    modelSettings: {
        temperature: 0.5,
        maxTokens: 1024
    }
});

// ============================================
// Agent Router Map
// ============================================

const agentMap: Record<Classification, Agent<any>> = {
    pedir_agua: pedirAguaAgent,
    reportar_incidente: reportarIncidenteAgent,
    consultar_pedido: consultarPedidoAgent,
    alertas: alertasAgent,
    proveedores: proveedoresAgent,
    informacion: informacionAgent,
    hablar_asesor: informacionAgent // Handled specially
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

    return await withTrace("AquaHub-Agent-v2", async () => {
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
                __trace_source__: "aquahub-agent-v2",
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

            let output: string;
            let newItems: AgentInputItem[] = [];

            // Step 2: Handle special case - hablar_asesor
            if (classification === "hablar_asesor") {
                console.log(`[Workflow] Citizen requesting human advisor`);
                output = `Entiendo que deseas hablar con una persona. Por favor contacta nuestra linea de atencion ciudadana o visita la oficina de tu alcaldia para atencion personalizada. Mientras tanto, puedo ayudarte con informacion sobre proveedores de agua, reportar incidentes o consultar alertas.`;
            } else {
                // Step 3: Route to specialized agent
                const selectedAgent = agentMap[classification];
                console.log(`[Workflow] Routing to: ${selectedAgent.name}`);

                const agentResult = await runAgentWithApproval(runner, selectedAgent, workingHistory);

                output = agentResult.output;
                newItems = agentResult.newItems;
                toolsUsed.push(...agentResult.toolsUsed);
            }

            // Step 4: Update conversation history
            conversation.history.push(userMessage);
            if (newItems.length > 0) {
                conversation.history.push(...newItems);
            } else if (output) {
                conversation.history.push({
                    role: "assistant",
                    content: [{ type: "output_text", text: output }]
                } as any);
            }

            // Limit history length (keep last 20 messages)
            if (conversation.history.length > 20) {
                conversation.history = conversation.history.slice(-20);
            }

            const processingTime = Date.now() - startTime;
            console.log(`[Workflow] Complete in ${processingTime}ms`);
            console.log(`[Workflow] Output: "${output.substring(0, 100)}..."`);
            console.log(`========== WORKFLOW END ==========\n`);

            return {
                output_text: output,
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
            informacionAgent.name,
            pedirAguaAgent.name,
            reportarIncidenteAgent.name,
            consultarPedidoAgent.name,
            proveedoresAgent.name,
            alertasAgent.name
        ],
        conversationCount: conversationStore.size
    };
}
