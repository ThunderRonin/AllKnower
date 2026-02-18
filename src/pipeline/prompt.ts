import type { RagChunk } from "../types/lore.ts";

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

// Per-task model selection — each task uses the model best suited for it
const BRAIN_DUMP_MODEL = process.env.BRAIN_DUMP_MODEL ?? "x-ai/grok-4.1-fast";
const CONSISTENCY_MODEL = process.env.CONSISTENCY_MODEL ?? "moonshotai/kimi-k2.5";

/**
 * Build the structured prompt for the brain dump pipeline.
 *
 * The model receives:
 * 1. System prompt — role, output format, constraints
 * 2. RAG context — semantically similar existing lore
 * 3. User message — the raw brain dump text
 */
export function buildBrainDumpPrompt(
    rawText: string,
    ragContext: RagChunk[]
): { system: string; user: string } {
    const contextBlock =
        ragContext.length > 0
            ? ragContext
                .map((c) => `### ${c.noteTitle}\n${c.content}`)
                .join("\n\n")
            : "No existing lore found — this appears to be new content.";

    const system = `You are the lore architect for a fantasy world called All Reach.
Your job is to parse raw worldbuilding notes and extract structured lore entities.

## Output Format
Return a JSON object with this exact shape:
{
  "entities": [
    {
      "type": "character" | "location" | "faction" | "creature" | "event" | "timeline" | "manuscript" | "statblock",
      "title": "Entity name",
      "content": "<p>HTML content for the note body — narrative description, backstory, etc.</p>",
      "tags": ["tag1", "tag2"],
      "attributes": {
        // Type-specific fields — only include fields that are explicitly mentioned
        // For characters: fullName, aliases, age, race, gender, affiliation, role, status, secrets, physicalDescription, personality, backstory, goals
        // For locations: locationType, region, population, ruler, history, notableLandmarks, secrets, connectedLocations
        // For factions: factionType, foundingDate, leader, goals, members, allies, enemies, secrets, hierarchy
        // For creatures: creatureType, habitat, diet, abilities, lore, dangerLevel, ac, hp, speed, str, dex, con, int, wis, cha, cr
        // For events: inWorldDate, participants, location, outcome, consequences, secrets
      },
      "action": "create" | "update",
      "existingNoteId": "noteId if updating an existing note, omit if creating"
    }
  ],
  "summary": "One paragraph describing what was extracted and any notable decisions made."
}

## Constraints
- NEVER invent details not present in the raw text
- NEVER contradict existing lore shown in the context
- If the raw text mentions an entity that already exists in the context, set action to "update" and include the existingNoteId
- If you are unsure about a detail, omit that field rather than guessing
- Secrets (sensitive plot info) should go in the "secrets" attribute field, not in the main content
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON

## Existing Lore Context
The following lore already exists in the grimoire. Use it to avoid contradictions and identify updates:

${contextBlock}`;

    const user = `Parse the following worldbuilding notes into structured lore entities:\n\n${rawText}`;

    return { system, user };
}

/**
 * Call an LLM via OpenRouter.
 *
 * @param system  System prompt
 * @param user    User message
 * @param task    Which task this call is for — selects the appropriate model
 */
export async function callLLM(
    system: string,
    user: string,
    task: "brain-dump" | "consistency" | "suggest" = "brain-dump"
): Promise<{ raw: string; tokensUsed: number }> {
    const model =
        task === "consistency" ? CONSISTENCY_MODEL : BRAIN_DUMP_MODEL;

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://allknower.local",
            "X-Title": "AllKnower",
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 4096,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter error ${response.status} (model: ${model}): ${err}`);
    }

    const data = await response.json() as any;
    const raw = data.choices[0].message.content as string;
    const tokensUsed = data.usage?.total_tokens ?? 0;

    return { raw, tokensUsed };
}

/**
 * @deprecated Use callLLM with task="brain-dump" instead.
 * Kept for backwards compatibility with existing callers.
 */
export const callClaude = (system: string, user: string) =>
    callLLM(system, user, "brain-dump");
