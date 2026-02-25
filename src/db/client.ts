import { PrismaClient } from "@prisma/client";
import { env } from "../env.ts";

declare global {
    // Prevent multiple Prisma client instances in development (hot reload)
    // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
}

function timestamp() {
    return new Date().toTimeString().slice(0, 8);
}

const isDev = env.NODE_ENV !== "production";

const prisma =
    globalThis.__prisma ??
    new PrismaClient({
        log: isDev
            ? [
                { emit: "event", level: "query" },
                { emit: "event", level: "warn"  },
                { emit: "event", level: "error" },
              ]
            : [{ emit: "event", level: "error" }],
    });

if (isDev) {
    prisma.$on("query", (e) => {
        const duration = `${e.duration}ms`;
        // Condense the query to one line for readability
        const q = e.query.replace(/\s+/g, " ").trim();
        console.log(`🧠 ${timestamp()} \x1b[36mQUERY\x1b[0m ${duration.padEnd(8)} ${q}`);
    });
}

prisma.$on("warn", (e) => {
    console.warn(`🧠 ${timestamp()} \x1b[33mWARN\x1b[0m  ${e.message}`);
});

prisma.$on("error", (e) => {
    console.error(`🧠 ${timestamp()} \x1b[31mERROR\x1b[0m ${e.message}`);
});

if (env.NODE_ENV !== "production") {
    globalThis.__prisma = prisma;
}

export default prisma;
