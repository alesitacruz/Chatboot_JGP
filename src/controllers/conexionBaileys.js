// src/controllers/conexionBaileys.js
import * as baileys from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { handleIncomingMessage } from "./message.controller.js";

export const connectToWhatsApp = async (userStates = {}, prompts = {}, handlers = {}) => {
  console.log("Iniciando conexión con WhatsApp...");

  const { state, saveCreds } = await baileys.useMultiFileAuthState("auth_info_baileys");

  const sock = baileys.makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📲 Escanea este QR con WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== baileys.DisconnectReason.loggedOut;
      console.log("Conexión cerrada. Reconectando:", shouldReconnect);
      if (shouldReconnect) connectToWhatsApp(userStates, prompts, handlers);
    } else if (connection === "open") {
      console.log("✅ Conectado a WhatsApp");
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    const message = m.messages[0];
    if (message.key.fromMe) return;

    await handleIncomingMessage(message, sock, userStates, prompts);
  });

  return sock;
};


