import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Pool } from "pg";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
}));

app.use(cors({
  origin: true,
  credentials: true,
}));

if (process.env.NODE_ENV === "production") {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  });
  app.use(limiter);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run schema migrations (idempotent — safe to run on every startup)
  try {
    const migrationPool = new Pool({ connectionString: process.env.DATABASE_URL });
    await migrationPool.query(`
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await migrationPool.query(`
      CREATE TABLE IF NOT EXISTS room_sessions (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        room_name TEXT NOT NULL DEFAULT '',
        opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMP
      );
    `);
    await migrationPool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await migrationPool.end();
    console.log("Schema migrations applied.");
  } catch (e) {
    console.error("Schema migration failed:", e);
  }

  // Ensure webhook URLs are always set correctly
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(`
      INSERT INTO bot_settings (id, enabled, min_amount, max_amount, webhook_url1, webhook_url2, webhook_url3)
      VALUES ('default', false, 100, 500,
        'https://discord.com/api/webhooks/1479947307255337184/Fd9seX8kXqFNv4ViPNzAmE8rlEfDCJ-fSGkKX-cKPDI85rp2YsrAjZLJuogsb7-GZV1C',
        'https://discord.com/api/webhooks/1479942636805558342/rPVE5Z-FplT5TsMDJY0FYO7OAmp7Z7cp-F3_FKHJIz8Q7Tn--2wWUNROiVHhDPQWZnfc',
        'https://discord.com/api/webhooks/1479946891906252953/VgSktRJJIeNSYn4_b0B_osEVaFqFJuw0gVDzkQRHgeXmGMkOrDn8mbfn1DRaBv_OpN-Y'
      )
      ON CONFLICT (id) DO UPDATE SET
        webhook_url1 = 'https://discord.com/api/webhooks/1479947307255337184/Fd9seX8kXqFNv4ViPNzAmE8rlEfDCJ-fSGkKX-cKPDI85rp2YsrAjZLJuogsb7-GZV1C',
        webhook_url2 = 'https://discord.com/api/webhooks/1479942636805558342/rPVE5Z-FplT5TsMDJY0FYO7OAmp7Z7cp-F3_FKHJIz8Q7Tn--2wWUNROiVHhDPQWZnfc',
        webhook_url3 = 'https://discord.com/api/webhooks/1479946891906252953/VgSktRJJIeNSYn4_b0B_osEVaFqFJuw0gVDzkQRHgeXmGMkOrDn8mbfn1DRaBv_OpN-Y'
    `);
    await pool.end();
  } catch (e) {
    console.error("Startup init failed:", e);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
