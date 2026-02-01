// ============================================
// AquaHub Native Tools - Citizen Assistance
// ============================================

import { config } from "dotenv";
config();

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { tool } from "@openai/agents";
import { z } from "zod";
import type { Proveedor, Pedido, Incidente, Alerta, PrediccionResponse } from "./types.js";

// ============================================
// Configuration
// ============================================

const AQUAHUB_API_BASE = process.env.AQUAHUB_API_URL || "http://localhost:8000";

let dbPool: Pool | null = null;

function getSupabase(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

function getDbPool(): Pool | null {
    const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!url || !url.startsWith("postgresql://")) return null;
    if (!dbPool) dbPool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
    return dbPool;
}

type TipoQuejaSupabase = "sin_agua" | "fuga" | "agua_contaminada" | "baja_presion" | "otro";

function mapTipoToSupabase(tipo: string): TipoQuejaSupabase {
    switch (tipo) {
        case "fuga": return "fuga";
        case "sin_agua": return "sin_agua";
        case "contaminacion": return "agua_contaminada";
        case "infraestructura":
        default: return "otro";
    }
}

// ============================================
// Utility Functions
// ============================================

async function fetchAquaHub(
    path: string,
    options: RequestInit = {},
    maxRetries = 3,
    delayMs = 1000
): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const url = `${AQUAHUB_API_BASE}${path}`;
            console.log(`[AquaHub API] ${options.method || 'GET'} ${url} (attempt ${attempt})`);

            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                if (response.status === 500) {
                    console.error(`[AquaHub API] 500 Internal Server Error - response body:`, errorBody);
                }
                if (attempt < maxRetries) {
                    console.warn(`[AquaHub API] Attempt ${attempt} failed: ${response.status} ${errorBody.substring(0, 200)}`);
                    await new Promise(r => setTimeout(r, delayMs * attempt));
                    continue;
                }
                throw new Error(`API error ${response.status}: ${errorBody}`);
            }

            return await response.json();
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries) {
                console.warn(`[AquaHub API] Attempt ${attempt} error: ${lastError.message}`);
                await new Promise(r => setTimeout(r, delayMs * attempt));
            }
        }
    }

    throw lastError || new Error("Request failed after retries");
}

export function getMexicoDate(): Date {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
}

// ============================================
// NATIVE TOOLS
// ============================================

/**
 * LISTAR PROVEEDORES - Lists available water providers
 */
export const listarProveedoresTool = tool({
    name: "listar_proveedores",
    description: `Lista los proveedores de agua (pipas) disponibles en AquaHub.

RETORNA lista de proveedores con:
- nombre, calificacion, precio_por_litro
- disponibilidad, certificaciones, telefono
- alcaldia, tiempo estimado de llegada

Filtros opcionales: disponibilidad, alcaldia.
Usa cuando el ciudadano quiera ver proveedores disponibles, comparar precios o buscar pipas cerca.`,
    parameters: z.object({
        alcaldia: z.string().nullable().optional().describe("Filtrar por alcaldia (ej: 'Coyoacán', 'Iztapalapa')"),
        solo_disponibles: z.boolean().nullable().optional().default(true).describe("Mostrar solo proveedores disponibles")
    }),
    execute: async ({ alcaldia, solo_disponibles }) => {
        console.log(`[listar_proveedores] alcaldia=${alcaldia}, disponibles=${solo_disponibles}`);

        try {
            const params = new URLSearchParams();
            if (alcaldia) params.set("alcaldia", alcaldia);
            if (solo_disponibles) params.set("disponible", "true");

            const proveedores: Proveedor[] = await fetchAquaHub(`/api/proveedores?${params.toString()}`);

            if (!proveedores || proveedores.length === 0) {
                return {
                    success: true,
                    proveedores: [],
                    message: alcaldia
                        ? `No se encontraron proveedores disponibles en ${alcaldia}`
                        : "No hay proveedores disponibles en este momento"
                };
            }

            return {
                success: true,
                proveedores: proveedores.map(p => ({
                    id: p.id,
                    nombre: p.nombre,
                    calificacion: p.calificacion,
                    precio_por_litro: p.precio_por_litro,
                    disponible: p.disponible,
                    alcaldia: p.alcaldia,
                    telefono: p.telefono,
                    certificaciones: p.certificaciones,
                    tiempo_estimado: p.tiempo_estimado_llegada,
                    flota: p.tamano_flota
                })),
                count: proveedores.length
            };
        } catch (error) {
            console.error(`[listar_proveedores] Error:`, error);
            return {
                success: false,
                error: `No se pudieron consultar los proveedores: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

/**
 * CREAR PEDIDO - Creates a new water order
 */
export const crearPedidoTool = tool({
    name: "crear_pedido",
    description: `Crea un nuevo pedido de agua en AquaHub.

REQUIERE:
- proveedor_id: ID del proveedor seleccionado
- nombre_ciudadano: Nombre de quien solicita
- cantidad_litros: Cantidad de agua en litros
- precio_total: Precio total calculado
- direccion, colonia, alcaldia: Ubicacion de entrega

Usa cuando el ciudadano quiera pedir agua a un proveedor.
IMPORTANTE: Primero usa listar_proveedores para obtener el proveedor_id.`,
    parameters: z.object({
        proveedor_id: z.string().describe("ID del proveedor (UUID)"),
        nombre_ciudadano: z.string().describe("Nombre del ciudadano que solicita"),
        cantidad_litros: z.number().int().positive().describe("Cantidad de litros solicitados"),
        precio_total: z.number().positive().describe("Precio total del pedido"),
        direccion: z.string().describe("Direccion de entrega"),
        colonia: z.string().nullable().optional().describe("Colonia"),
        alcaldia: z.string().nullable().optional().describe("Alcaldia"),
        subsidio_aplicado: z.number().nullable().optional().default(0).describe("Monto de subsidio aplicado")
    }),
    execute: async (input) => {
        console.log(`[crear_pedido] Creating order for ${input.nombre_ciudadano}`);

        try {
            const pedido: Pedido = await fetchAquaHub("/api/pedidos", {
                method: "POST",
                body: JSON.stringify({
                    proveedor_id: input.proveedor_id,
                    nombre_ciudadano: input.nombre_ciudadano,
                    cantidad_litros: input.cantidad_litros,
                    precio_total: input.precio_total,
                    direccion: input.direccion,
                    colonia: input.colonia || null,
                    alcaldia: input.alcaldia || null,
                    subsidio_aplicado: input.subsidio_aplicado
                })
            });

            return {
                success: true,
                pedido_id: pedido.id,
                estado: pedido.estado,
                message: `Pedido creado exitosamente. ID: ${pedido.id}. Estado: ${pedido.estado}`
            };
        } catch (error) {
            console.error(`[crear_pedido] Error:`, error);
            return {
                success: false,
                error: `No se pudo crear el pedido: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

/**
 * CONSULTAR PEDIDO - Check order status
 */
export const consultarPedidoTool = tool({
    name: "consultar_pedido",
    description: `Consulta el estado de un pedido de agua por su ID.

RETORNA:
- estado: pendiente, aceptado, en_transito, entregado, cancelado
- proveedor, cantidad, precio, direccion
- timestamps de cada etapa

Usa cuando el ciudadano quiera saber el estado de su pedido.`,
    parameters: z.object({
        pedido_id: z.string().describe("ID del pedido (UUID)")
    }),
    execute: async ({ pedido_id }) => {
        console.log(`[consultar_pedido] Fetching order: ${pedido_id}`);

        try {
            const pedido: Pedido = await fetchAquaHub(`/api/pedidos/${pedido_id}`);

            const estadoDescripcion: Record<string, string> = {
                pendiente: "Tu pedido esta pendiente de aceptacion por el proveedor",
                aceptado: "Tu pedido fue aceptado, el proveedor se esta preparando",
                en_transito: "Tu agua esta en camino",
                entregado: "Tu pedido fue entregado",
                cancelado: "Tu pedido fue cancelado"
            };

            return {
                success: true,
                pedido_id: pedido.id,
                estado: pedido.estado,
                descripcion_estado: estadoDescripcion[pedido.estado] || pedido.estado,
                cantidad_litros: pedido.cantidad_litros,
                precio_total: pedido.precio_total,
                subsidio_aplicado: pedido.subsidio_aplicado,
                direccion: pedido.direccion,
                creado_en: pedido.creado_en,
                aceptado_en: pedido.aceptado_en,
                entregado_en: pedido.entregado_en
            };
        } catch (error) {
            console.error(`[consultar_pedido] Error:`, error);
            return {
                success: false,
                error: `No se pudo consultar el pedido: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

/**
 * LISTAR PEDIDOS - List orders for a citizen
 */
export const listarPedidosTool = tool({
    name: "listar_pedidos",
    description: `Lista los pedidos de agua recientes, con filtros opcionales.

RETORNA lista de pedidos con estado, proveedor, cantidad, fecha.
Usa cuando el ciudadano quiera ver sus pedidos recientes o buscar un pedido.`,
    parameters: z.object({
        estado: z.enum(["pendiente", "aceptado", "en_transito", "entregado", "cancelado"]).nullable().optional()
            .describe("Filtrar por estado del pedido"),
        alcaldia: z.string().nullable().optional().describe("Filtrar por alcaldia")
    }),
    execute: async ({ estado, alcaldia }) => {
        console.log(`[listar_pedidos] estado=${estado}, alcaldia=${alcaldia}`);

        try {
            const params = new URLSearchParams();
            if (estado) params.set("estado", estado);
            if (alcaldia) params.set("alcaldia", alcaldia);
            params.set("limit", "10");

            const pedidos: Pedido[] = await fetchAquaHub(`/api/pedidos?${params.toString()}`);

            return {
                success: true,
                pedidos: pedidos.map(p => ({
                    id: p.id,
                    estado: p.estado,
                    cantidad_litros: p.cantidad_litros,
                    precio_total: p.precio_total,
                    direccion: p.direccion,
                    creado_en: p.creado_en
                })),
                count: pedidos.length
            };
        } catch (error) {
            console.error(`[listar_pedidos] Error:`, error);
            return {
                success: false,
                error: `No se pudieron consultar los pedidos: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

/**
 * REPORTAR INCIDENTE - Report a water incident
 */
export const reportarIncidenteTool = tool({
    name: "reportar_incidente",
    description: `Reporta un incidente de agua (fuga, falta de agua, contaminacion, etc.)

TIPOS DE INCIDENTE:
- fuga: Fuga de agua en vía publica o tubería
- sin_agua: No hay servicio de agua
- contaminacion: Agua contaminada o de mala calidad
- infraestructura: Daño en infraestructura hidráulica
- otro: Otro tipo de problema

REQUIERE: tipo, descripcion, direccion/colonia/alcaldia
Opcionales: hogares_afectados, duracion, latitud, longitud

Usa cuando el ciudadano quiera reportar un problema de agua.`,
    parameters: z.object({
        tipo: z.enum(["fuga", "sin_agua", "contaminacion", "infraestructura", "otro"])
            .describe("Tipo de incidente"),
        descripcion: z.string().describe("Descripcion detallada del incidente"),
        direccion: z.string().nullable().optional().describe("Direccion donde ocurre el incidente"),
        colonia: z.string().nullable().optional().describe("Colonia"),
        alcaldia: z.string().nullable().optional().describe("Alcaldia"),
        hogares_afectados: z.number().int().nullable().optional().default(1).describe("Numero de hogares afectados"),
        duracion: z.string().nullable().optional().describe("Cuanto tiempo lleva el problema (ej: '2 horas', '3 dias')"),
        latitud: z.number().nullable().optional().describe("Latitud si el usuario compartio ubicacion"),
        longitud: z.number().nullable().optional().describe("Longitud si el usuario compartio ubicacion")
    }),
    execute: async (input) => {
        console.log(`[reportar_incidente] tipo=${input.tipo}, alcaldia=${input.alcaldia}`);

        const texto = [input.descripcion, input.direccion].filter(Boolean).join(". ");
        const tipoSupabase = mapTipoToSupabase(input.tipo);

        const pool = getDbPool();
        if (pool) {
            console.log(`[reportar_incidente] Saving to Postgres (public.quejas)`);
            try {
                const res = await pool.query(
                    `INSERT INTO public.quejas (texto, tipo, alcaldia, colonia, latitud, longitud)
                     VALUES ($1, $2::tipo_queja, $3, $4, $5, $6)
                     RETURNING id`,
                    [
                        texto,
                        tipoSupabase,
                        input.alcaldia || null,
                        input.colonia || null,
                        input.latitud ?? null,
                        input.longitud ?? null
                    ]
                );
                const id = res.rows?.[0]?.id;
                return {
                    success: true,
                    incidente_id: id,
                    estado: "reportado",
                    message: `Reporte guardado. Tu voz se vera en el mapa. ID: ${id ?? "ok"}.`
                };
            } catch (e) {
                console.error(`[reportar_incidente] Postgres error:`, e);
                return {
                    success: false,
                    error: `No se pudo guardar el reporte: ${e instanceof Error ? e.message : "Error desconocido"}`
                };
            }
        }

        const supabase = getSupabase();
        if (supabase) {
            console.log(`[reportar_incidente] Saving to Supabase (quejas)`);
            const row = {
                texto,
                tipo: tipoSupabase,
                alcaldia: input.alcaldia || null,
                colonia: input.colonia || null,
                latitud: input.latitud ?? null,
                longitud: input.longitud ?? null,
                tweet_id: null,
                username: null,
                user_name: null
            };
            try {
                const { data, error } = await supabase.from("quejas").insert(row).select("id").single();
                if (error) {
                    console.error(`[reportar_incidente] Supabase error:`, error);
                    return {
                        success: false,
                        error: `No se pudo guardar el reporte: ${error.message}`
                    };
                }
                return {
                    success: true,
                    incidente_id: data?.id,
                    estado: "reportado",
                    message: `Reporte guardado. Tu voz se vera en el mapa. ID: ${data?.id ?? "ok"}.`
                };
            } catch (e) {
                console.error(`[reportar_incidente] Error:`, e);
                return {
                    success: false,
                    error: `No se pudo reportar el incidente: ${e instanceof Error ? e.message : "Error desconocido"}`
                };
            }
        }

        console.log(`[reportar_incidente] No DB configured, using AquaHub API`);
        const payload = {
            tipo: input.tipo,
            descripcion: input.descripcion,
            direccion: input.direccion || null,
            colonia: input.colonia || null,
            alcaldia: input.alcaldia || null,
            hogares_afectados: input.hogares_afectados,
            duracion: input.duracion || null
        };
        try {
            const incidente: Incidente = await fetchAquaHub("/api/incidentes", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            return {
                success: true,
                incidente_id: incidente.id,
                estado: incidente.estado,
                message: `Incidente reportado exitosamente. ID: ${incidente.id}. Un equipo revisara tu reporte.`
            };
        } catch (error) {
            console.error(`[reportar_incidente] Error:`, error);
            console.error(`[reportar_incidente] Request payload (for backend debug):`, JSON.stringify(payload));
            return {
                success: false,
                error: `No se pudo reportar el incidente: ${error instanceof Error ? error.message : "Error desconocido"}`
            };
        }
    }
});

/**
 * CONSULTAR INCIDENTES - Check incidents in an area
 */
export const consultarIncidentesTool = tool({
    name: "consultar_incidentes",
    description: `Consulta incidentes reportados en una zona, con estadisticas.

Usa cuando el ciudadano quiera saber si hay problemas de agua reportados en su zona.`,
    parameters: z.object({
        alcaldia: z.string().nullable().optional().describe("Filtrar por alcaldia"),
        tipo: z.enum(["fuga", "sin_agua", "contaminacion", "infraestructura", "otro"]).nullable().optional()
            .describe("Filtrar por tipo de incidente")
    }),
    execute: async ({ alcaldia, tipo }) => {
        console.log(`[consultar_incidentes] alcaldia=${alcaldia}, tipo=${tipo}`);

        const pool = getDbPool();
        if (pool) {
            try {
                const conditions: string[] = [];
                const params: unknown[] = [];
                let idx = 0;
                if (alcaldia) {
                    idx++;
                    conditions.push(`alcaldia = $${idx}`);
                    params.push(alcaldia);
                }
                if (tipo) {
                    idx++;
                    conditions.push(`tipo = $${idx}::tipo_queja`);
                    params.push(mapTipoToSupabase(tipo));
                }
                const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
                const sql = `SELECT id, texto, tipo, alcaldia, colonia, latitud, longitud, created_at
                            FROM public.quejas${where} ORDER BY created_at DESC LIMIT 10`;
                const res = await pool.query(sql, params);
                const incidentes = (res.rows || []).map((r: { id: number; texto: string; tipo: string; alcaldia: string | null; colonia: string | null; latitud: number | null; longitud: number | null; created_at: string }) => ({
                    id: String(r.id),
                    tipo: r.tipo,
                    estado: "reportado",
                    descripcion: r.texto,
                    alcaldia: r.alcaldia,
                    colonia: r.colonia,
                    latitud: r.latitud,
                    longitud: r.longitud,
                    creado_en: r.created_at
                }));
                return {
                    success: true,
                    incidentes,
                    estadisticas: { total: incidentes.length },
                    count: incidentes.length
                };
            } catch (e) {
                console.error(`[consultar_incidentes] Postgres error:`, e);
                return { success: false, error: e instanceof Error ? e.message : "Error desconocido" };
            }
        }

        const supabase = getSupabase();
        if (supabase) {
            try {
                let query = supabase.from("quejas").select("id, texto, tipo, alcaldia, colonia, latitud, longitud, created_at").order("created_at", { ascending: false }).limit(10);
                if (alcaldia) query = query.eq("alcaldia", alcaldia);
                if (tipo) query = query.eq("tipo", mapTipoToSupabase(tipo));
                const { data: rows, error } = await query;
                if (error) {
                    console.error(`[consultar_incidentes] Supabase error:`, error);
                    return { success: false, error: error.message };
                }
                const incidentes = (rows || []).map((r: { id: number; texto: string; tipo: string; alcaldia: string | null; colonia: string | null; latitud: number | null; longitud: number | null; created_at: string }) => ({
                    id: String(r.id),
                    tipo: r.tipo,
                    estado: "reportado",
                    descripcion: r.texto,
                    alcaldia: r.alcaldia,
                    colonia: r.colonia,
                    latitud: r.latitud,
                    longitud: r.longitud,
                    creado_en: r.created_at
                }));
                return {
                    success: true,
                    incidentes,
                    estadisticas: { total: incidentes.length },
                    count: incidentes.length
                };
            } catch (e) {
                console.error(`[consultar_incidentes] Error:`, e);
                return {
                    success: false,
                    error: e instanceof Error ? e.message : "Error desconocido"
                };
            }
        }

        try {
            const params = new URLSearchParams();
            if (alcaldia) params.set("alcaldia", alcaldia);
            if (tipo) params.set("tipo", tipo);
            params.set("limit", "10");

            const [incidentes, estadisticas] = await Promise.all([
                fetchAquaHub(`/api/incidentes?${params.toString()}`),
                fetchAquaHub("/api/incidentes/estadisticas")
            ]);

            return {
                success: true,
                incidentes: (incidentes as Incidente[]).map(i => ({
                    id: i.id,
                    tipo: i.tipo,
                    estado: i.estado,
                    descripcion: i.descripcion,
                    alcaldia: i.alcaldia,
                    colonia: i.colonia,
                    hogares_afectados: i.hogares_afectados,
                    creado_en: i.creado_en
                })),
                estadisticas,
                count: (incidentes as Incidente[]).length
            };
        } catch (error) {
            console.error(`[consultar_incidentes] Error:`, error);
            return {
                success: false,
                error: `No se pudieron consultar los incidentes: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

/**
 * CONSULTAR ALERTAS - Check active alerts
 */
export const consultarAlertasTool = tool({
    name: "consultar_alertas",
    description: `Consulta las alertas activas de AquaHub (escasez, emergencias, programas de apoyo, conservacion).

TIPOS DE ALERTA:
- escasez: Alertas de escasez de agua
- conservacion: Recomendaciones de ahorro de agua
- programa: Programas de subsidio o apoyo
- emergencia: Emergencias hidricas

Usa cuando el ciudadano pregunte por alertas, noticias, avisos o situacion del agua en su zona.`,
    parameters: z.object({
        tipo: z.enum(["escasez", "conservacion", "programa", "emergencia"]).nullable().optional()
            .describe("Filtrar por tipo de alerta")
    }),
    execute: async ({ tipo }) => {
        console.log(`[consultar_alertas] tipo=${tipo}`);

        try {
            const params = new URLSearchParams();
            if (tipo) params.set("tipo", tipo);
            params.set("limit", "10");

            const alertas: Alerta[] = await fetchAquaHub(`/api/alertas?${params.toString()}`);

            if (!alertas || alertas.length === 0) {
                return {
                    success: true,
                    alertas: [],
                    message: "No hay alertas activas en este momento"
                };
            }

            return {
                success: true,
                alertas: alertas.map(a => ({
                    titulo: a.titulo,
                    mensaje: a.mensaje,
                    tipo: a.tipo,
                    zonas: a.zonas_objetivo,
                    fecha: a.enviado_en
                })),
                count: alertas.length
            };
        } catch (error) {
            console.error(`[consultar_alertas] Error:`, error);
            return {
                success: false,
                error: `No se pudieron consultar las alertas: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

/**
 * CONSULTAR PREDICCION - Check demand prediction for an area
 */
export const consultarPrediccionTool = tool({
    name: "consultar_prediccion",
    description: `Consulta la prediccion de demanda de agua para una alcaldia.

RETORNA:
- demanda_predicha: nivel numerico de demanda
- intensidad: baja, media, alta, critica
- recomendaciones: sugerencias para el ciudadano

Usa cuando el ciudadano pregunte sobre la situacion del agua en su alcaldia o quiera saber si habra escasez.`,
    parameters: z.object({
        alcaldia: z.string().describe("Alcaldia de CDMX (ej: 'Coyoacán', 'Iztapalapa', 'Benito Juárez')")
    }),
    execute: async ({ alcaldia }) => {
        console.log(`[consultar_prediccion] alcaldia=${alcaldia}`);

        try {
            const prediccion: PrediccionResponse = await fetchAquaHub(
                `/api/predicciones/demanda/${encodeURIComponent(alcaldia)}`
            );

            const intensidadEmoji: Record<string, string> = {
                baja: "verde",
                media: "amarillo",
                alta: "naranja",
                critica: "rojo"
            };

            return {
                success: true,
                alcaldia: prediccion.alcaldia,
                demanda: prediccion.demanda_predicha,
                intensidad: prediccion.intensidad,
                nivel: intensidadEmoji[prediccion.intensidad] || prediccion.intensidad,
                confianza: prediccion.confianza,
                recomendaciones: prediccion.recomendaciones,
                factores: prediccion.factores
            };
        } catch (error) {
            console.error(`[consultar_prediccion] Error:`, error);
            return {
                success: false,
                error: `No se pudo consultar la prediccion: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

/**
 * CANCELAR PEDIDO - Cancel a water order
 */
export const cancelarPedidoTool = tool({
    name: "cancelar_pedido",
    description: `Cancela un pedido de agua que aun no ha sido entregado.

Solo se pueden cancelar pedidos que NO estan en estado "entregado".
Usa cuando el ciudadano quiera cancelar un pedido.`,
    parameters: z.object({
        pedido_id: z.string().describe("ID del pedido a cancelar (UUID)")
    }),
    execute: async ({ pedido_id }) => {
        console.log(`[cancelar_pedido] Cancelling order: ${pedido_id}`);

        try {
            const pedido: Pedido = await fetchAquaHub(`/api/pedidos/${pedido_id}/cancelar`, {
                method: "POST"
            });

            return {
                success: true,
                pedido_id: pedido.id,
                estado: pedido.estado,
                message: `Pedido ${pedido_id} cancelado exitosamente`
            };
        } catch (error) {
            console.error(`[cancelar_pedido] Error:`, error);
            return {
                success: false,
                error: `No se pudo cancelar el pedido: ${error instanceof Error ? error.message : 'Error desconocido'}`
            };
        }
    }
});

// ============================================
// Export all native tools
// ============================================

export const nativeTools = [
    listarProveedoresTool,
    crearPedidoTool,
    consultarPedidoTool,
    listarPedidosTool,
    reportarIncidenteTool,
    consultarIncidentesTool,
    consultarAlertasTool,
    consultarPrediccionTool,
    cancelarPedidoTool
];
