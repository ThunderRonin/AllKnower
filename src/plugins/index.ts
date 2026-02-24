import Elysia from "elysia";
import { elysiaHelmet } from "elysiajs-helmet";
import { etag } from "@bogeychan/elysia-etag";
import { ip } from "elysia-ip";
import { logixlysia } from "logixlysia";
import { background } from "elysia-background";


/**
 * Registers all infrastructure plugins on the Elysia app.
 * Route-specific plugins (rate-limit, xss) are applied at the route level.
 */
export const plugins = new Elysia({ name: "allknower/plugins" })
    // Security headers
    .use(
        elysiaHelmet({
            // CSP must allow Scalar UI (CDN scripts/styles) — override defaults
            csp: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https:", "data:"],
                imgSrc: ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net"],
                connectSrc: ["'self'"],
                frameSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
            },
        })
    )
    // Automatic ETag caching headers on GET responses
    .use(etag())
    // Background task queue — makes backgroundTasks available in all route handlers
    .use(background())
    // IP resolution — available in request context for logging and auth
    .use(ip())
    // Beautiful request logging with colors and timestamps
    .use(
        logixlysia({
            config: {
                showStartupMessage: true,
                startupMessageFormat: "simple",
                timestamp: { translateTime: "HH:MM:ss" },
                ip: true,
                logFilePath: "./logs/allknower.log",
                customLogFormat:
                    "🧠 {now} {level} {duration} {method} {pathname} {status} {message} {ip}",
            },
        } as any)
    );
