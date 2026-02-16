import { Router } from "express";
import { interpretConversation } from "../services/interpreter.js";

export const conversationRouter = Router();

conversationRouter.post("/conversation/interpret", (req, res) => {
  const { input } = req.body as { input?: { type?: string; text?: string; audioRef?: string } };

  if (!input?.type) {
    return res.status(400).json({ error: "input.type is required" });
  }

  if (input.type === "audio") {
    return res.status(202).json({
      message: "Audio pathway is reserved for a future phase.",
      input,
      suggestions: []
    });
  }

  if (!input.text) {
    return res.status(400).json({ error: "input.text is required when type is text" });
  }

  const interpreted = interpretConversation(input.text);
  return res.json(interpreted);
});
