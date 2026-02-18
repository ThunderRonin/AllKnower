import Elysia from "elysia";
import helmet from "elysiajs-helmet";
import { etag } from "@bogeychan/elysia-etag";
import { compression } from "elysia-compress";
import { ip } from "elysia-ip";
import { logger as logixlysia } from "logixlysia";


/**
 * Registers all infrastructure plugins on the Elysia app.
 * Route-specific plugins (rate-limit, xss) are applied at the route level.
 */
export const plugins = new Elysia({ name: "allknower/plugins" })
    // Security headers
    .use(
        (helmet as any)({
            contentSecurityPolicy: false, // Disabled — Scalar UI needs inline scripts
            crossOriginEmbedderPolicy: false,
        })
    )
    // Automatic ETag caching headers on GET responses
    .use(etag())
    // Gzip/Brotli response compression — lore payloads can be large
    .use(compression())
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
