import express, { Request, Response } from "express";
import multer from "multer";
import FormData from "form-data";
import axios from "axios";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Simple health for this router
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Non-streaming chat completion proxy
router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ message: "OPENAI_API_KEY not configured" });
      return;
    }

    const body = req.body || {};

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    // Try to return JSON if possible, otherwise pass-through text
    try {
      const json = JSON.parse(text);
      res.json(json);
      return;
    } catch {
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "text/plain"
      );
      res.send(text);
      return;
    }
  } catch (err: any) {
    console.error("/api/ai/chat error:", err);
    res
      .status(500)
      .json({ message: "OpenAI proxy error", error: err?.message });
    return;
  }
});

// Streaming chat completion proxy (SSE-like stream passthrough)
router.post(
  "/chat-stream",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ message: "OPENAI_API_KEY not configured" });
        return;
      }

      // Ensure stream: true in the body
      const body = { ...(req.body || {}), stream: true };

      const upstream = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        }
      );

      // Forward status and relevant headers
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "text/event-stream"
      );
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (!upstream.body) {
        res.end();
        return;
      }

      const reader = (upstream.body as any).getReader?.();
      if (reader && typeof reader.read === "function") {
        // Web Streams API available
        const encoder = new TextEncoder();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        };
        pump().catch((e: any) => {
          console.error("Stream pump error:", e);
          res.end();
        });
        return;
      } else if (typeof (upstream as any).body?.pipe === "function") {
        // Node stream fallback
        (upstream as any).body.pipe(res);
        return;
      } else {
        // Fallback: just send text
        const text = await upstream.text();
        res.send(text);
        return;
      }
    } catch (err: any) {
      console.error("/api/ai/chat-stream error:", err);
      res.status(500).end();
      return;
    }
  }
);

export default router;

// Transcription proxy - forwards multipart/form-data to OpenAI Whisper
router.post(
  "/transcribe",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ message: "OPENAI_API_KEY not configured" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: "No audio file provided" });
        return;
      }

      // Create FormData using form-data package
      const formData = new FormData();

      formData.append("file", req.file.buffer, {
        filename: req.file.originalname || "audio.webm",
        contentType: req.file.mimetype || "audio/webm",
      });
      formData.append("model", req.body.model || "whisper-1");

      // Add language if provided
      if (req.body.language) {
        formData.append("language", req.body.language);
      }

      // Send to OpenAI using axios (handles FormData properly)
      const response = await axios.post(
        "https://api.openai.com/v1/audio/transcriptions",
        formData,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...formData.getHeaders(),
          },
          validateStatus: () => true, // Don't throw on any status
        }
      );

      if (response.status !== 200) {
        console.error("OpenAI API error:", response.status, response.data);
        res.status(response.status).json({
          message: "OpenAI transcription failed",
          error: response.data,
        });
        return;
      }

      res.json(response.data);
    } catch (err: any) {
      console.error("/api/ai/transcribe error:", err);
      res.status(500).json({
        message: "OpenAI proxy error",
        error: err?.message,
      });
      return;
    }
  }
);
