// ============================================
// WaterHub Agent Types - Community Map / Voice
// ============================================

export interface ChatRequest {
    message: string;
    /** URL o data URL de imagen (para reconocer tipo: inundación, fuga, etc.) */
    image_url?: string;
    conversationId?: string;
    contactId?: number;
    metadata?: {
        whatsapp?: string;
        channel?: 'whatsapp' | 'web' | 'api';
    };
}

export interface ChatResponse {
    response: string;
    classification?: Classification;
    conversationId: string;
    error?: string;
    metadata?: {
        toolsUsed?: string[];
        processingTimeMs?: number;
    };
}

export type Classification = "subir_voz" | "informacion";

// ============================================
// Workflow Types
// ============================================

export interface WorkflowInput {
    input_as_text: string;
    /** URL o data URL de imagen (ej. foto del problema) para que el agente la reconozca */
    image_url?: string;
    conversationId?: string;
    contactId?: number;
    metadata?: {
        whatsapp?: string;
        channel?: 'whatsapp' | 'web' | 'api';
        [key: string]: unknown;
    };
}

export interface WorkflowOutput {
    output_text?: string;
    classification?: Classification;
    error?: string;
    toolsUsed?: string[];
}

// ============================================
// WaterHub / Map API Types
// ============================================

export interface Proveedor {
    id: string;
    nombre: string;
    calificacion: number;
    precio_por_litro: number;
    tiempo_estimado_llegada?: string;
    latitud?: number;
    longitud?: number;
    direccion?: string;
    colonia?: string;
    alcaldia?: string;
    tamano_flota: number;
    disponible: boolean;
    certificaciones?: string[];
    telefono?: string;
}

export interface Pedido {
    id: string;
    proveedor_id: string;
    ciudadano_id?: string;
    nombre_ciudadano: string;
    direccion?: string;
    colonia?: string;
    alcaldia?: string;
    cantidad_litros: number;
    precio_total: number;
    subsidio_aplicado: number;
    estado: 'pendiente' | 'aceptado' | 'en_transito' | 'entregado' | 'cancelado';
    creado_en: string;
    aceptado_en?: string;
    entregado_en?: string;
}

export type TipoIncidente = 'fuga' | 'sin_agua' | 'contaminacion' | 'infraestructura' | 'otro';

export interface Incidente {
    id: string;
    ciudadano_id?: string;
    tipo: TipoIncidente;
    latitud?: number;
    longitud?: number;
    direccion?: string;
    colonia?: string;
    alcaldia?: string;
    descripcion?: string;
    hogares_afectados: number;
    duracion?: string;
    estado: 'pendiente' | 'reconocido' | 'en_progreso' | 'resuelto';
    creado_en: string;
    reconocido_en?: string;
    resuelto_en?: string;
}

export type TipoAlerta = 'escasez' | 'conservacion' | 'programa' | 'emergencia';

export interface Alerta {
    id: string;
    titulo: string;
    mensaje: string;
    zonas_objetivo?: string[];
    cantidad_destinatarios: number;
    tipo: TipoAlerta;
    enviado_en: string;
}

export interface PrediccionResponse {
    alcaldia: string;
    demanda_predicha: number;
    intensidad: string;
    confianza: number;
    factores: Record<string, any>;
    recomendaciones: string[];
    timestamp: string;
}
