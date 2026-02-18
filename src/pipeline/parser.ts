import { ClaudeResponseSchema } from "../types/lore.ts";
import type { LoreEntity } from "../types/lore.ts";

/**
 * Parse and validate the raw JSON string returned by the LLM.
 *
 * Uses ClaudeResponseSchema (Zod) as the single source of truth.
 * Invalid entities are logged and dropped rather than crashing the pipeline.
 */
export interface ParsedBrainDump {
    entities: LoreEntity[];
    summary: string;
}

export function parseBrainDumpResponse(raw: string): ParsedBrainDump {
    let json: unknown;

    try {
        json = JSON.parse(raw);
    } catch {
        throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
    }

    const result = ClaudeResponseSchema.safeParse(json);

    if (!result.success) {
        // Log each validation issue for debugging, then return what we can
        console.warn("[parser] LLM response failed Zod validation:");
        for (const issue of result.error.issues) {
            console.warn(`  [${issue.path.join(".")}] ${issue.message}`);
        }

        // Attempt a best-effort partial parse: extract entities that individually pass
        const raw_obj = json as Record<string, unknown>;
        const rawEntities = Array.isArray(raw_obj?.entities) ? raw_obj.entities : [];
        const summary = typeof raw_obj?.summary === "string" ? raw_obj.summary : "No summary provided.";

        const validEntities: LoreEntity[] = [];
        for (const entity of rawEntities) {
            // Try each entity individually against the discriminated union
            const entityResult = ClaudeResponseSchema.shape.entities.element.safeParse(entity);
            if (entityResult.success) {
                validEntities.push(entityResult.data);
            } else {
                console.warn(`[parser] Dropping malformed entity "${(entity as any)?.title ?? "unknown"}":`,
                    entityResult.error.issues[0]?.message);
            }
        }

        return { entities: validEntities, summary };
    }

    return result.data;
}
