import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "../db/client.ts";

/**
 * better-auth instance for AllKnower.
 *
 * AllKnower is a self-hosted service — authentication is intentionally
 * simple: email/password for the single owner, with session management
 * handled by better-auth + PostgreSQL.
 */
export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // self-hosted, owner trusts themselves
    },
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24,       // refresh if older than 1 day
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60, // 5 min client-side cache
        },
    },
    trustedOrigins: [
        process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
        process.env.ALLCODEX_URL ?? "http://localhost:8080",
    ],
});

export type Auth = typeof auth;
