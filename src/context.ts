// ============================================
// AquaHub Context - Placeholder for future use
// ============================================
// This module can be used to store per-request context
// (e.g., citizen session info) using AsyncLocalStorage.

import { AsyncLocalStorage } from "async_hooks";

export interface AquaHubContext {
    conversationId?: string;
    ciudadanoId?: string;
    alcaldia?: string;
}

const contextStorage = new AsyncLocalStorage<AquaHubContext>();

export function getCurrentContext(): AquaHubContext {
    return contextStorage.getStore() || {};
}

export function runWithContext<T>(
    context: AquaHubContext,
    fn: () => T | Promise<T>
): T | Promise<T> {
    return contextStorage.run(context, fn);
}
