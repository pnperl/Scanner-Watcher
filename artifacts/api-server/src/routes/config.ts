import { Router, type IRouter } from "express";
import { getTelegramConfig, sendTelegramTestNotification, setTelegramConfig } from "../lib/telegram";

const router: IRouter = Router();

router.get("/config/telegram", async (_req, res): Promise<void> => {
  res.json(getTelegramConfig());
});

router.patch("/config/telegram", async (req, res): Promise<void> => {
  const botToken = typeof req.body?.botToken === "string" ? req.body.botToken.trim() : "";
  const chatId = typeof req.body?.chatId === "string" ? req.body.chatId.trim() : "";

  if (!botToken || !chatId) {
    res.status(400).json({ error: "botToken and chatId are required" });
    return;
  }

  setTelegramConfig(botToken, chatId);
  res.json(getTelegramConfig());
});

router.post("/config/telegram/test", async (_req, res): Promise<void> => {
  const result = await sendTelegramTestNotification();
  res.json(result);
});

export default router;