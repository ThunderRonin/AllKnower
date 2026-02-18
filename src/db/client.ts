import { PrismaClient } from "@prisma/client";
import { env } from "../env.ts";

declare global {
    // Prevent multiple Prisma client instances in development (hot reload)
    // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
}

const prisma =
    globalThis.__prisma ??
    new PrismaClient({
        log:
            env.NODE_ENV === "development"
                ? ["query", "error", "warn"]
                : ["error"],
    });

if (env.NODE_ENV !== "production") {
    globalThis.__prisma = prisma;
}

export default prisma;
