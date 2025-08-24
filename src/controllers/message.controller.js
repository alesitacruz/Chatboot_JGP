import { logConversation } from "../utils/logger.js";
import { resetUserState } from "../controllers/user.state.controller.js";
import { isInApplicationProcess } from "../utils/validate.js";
import {
  generateResponse,
  handleVirtualApplication,
  continueVirtualApplication,
  handleUserMessage,
} from "../controllers/conversation.controller.js";
import { classifyIntent } from "../controllers/gemini.controller.js";
import { getRandomVariation } from "../config/utils.js";
import { contentMenu, messageCancel } from "../utils/message.js";
import { documentIngress } from "../controllers/document.gateway.js";
import { userStateInit } from "../controllers/user.state.controller.js";

// El mensaje para pedir el nombre
const askNameMessage =
  "Para continuar, ¿podrías indicarme tu nombre por favor?";

export const handleIncomingMessage = async (message, sock, userStates, prompts) => {
  const id = message.key.remoteJid;

  if (!userStates[id]) {
    userStateInit(userStates, id);
    const initialGreeting = getRandomVariation(prompts["saludo"]);

    // Envía el mensaje de bienvenida primero
    await sock.sendMessage(id, { text: initialGreeting });
    logConversation(id, initialGreeting, "bot");

    // Envía el segundo mensaje pidiendo el nombre de forma separada
    await sock.sendMessage(id, { text: askNameMessage });
    logConversation(id, askNameMessage, "bot");

    // Cambia el estado para esperar el nombre del usuario
    userStates[id].state = "ASK_NAME";
    return;
  }

  const userState = userStates[id].state;

  if (["baned", "finished", "limit_retries"].includes(userState)) {
    const messages = {
      baned: messageCancel,
      finished: "⏳ El chatbot se está reiniciando...",
      limit_retries: "⏳ Has alcanzado el límite de intentos...",
    };
    const reply = messages[userState];
    await sock.sendMessage(id, { text: reply });
    logConversation(id, reply, "bot");
    if (userState === "finished") resetUserState(userStates, id);
    return;
  }

  if (message.message?.audioMessage) {
    const aviso =
      "🔇 No se aceptan notas de voz. Por favor, escribe tu mensaje en texto.";
    await sock.sendMessage(id, { text: aviso });
    logConversation(id, aviso, "bot");
    return;
  }

  if (userStates[id].in_application && userStates[id].current_document) {
    if (userStates[id].intents >= 3) {
      userStates[id].state = "finished";
      userStates[id].in_application = false;
      delete userStates[id].timeout;
      delete userStates[id].intents;

      const errorMsg =
        "❌ Demasiados intentos inválidos. Por favor, inicie el trámite nuevamente.\n\n";
      await sock.sendMessage(id, { text: errorMsg });
      logConversation(id, errorMsg, "bot");
      resetUserState(userStates, id);
      return;
    }

    await documentIngress(userStates, message, sock);
    return;
  }

  const mensaje =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.documentMessage?.caption ||
    message.message?.locationMessage ||
    "";

  logConversation(id, mensaje, "usuario");

  if (userState === "ASK_NAME") {
    userStates[id].data.userName = mensaje;
    userStates[id].state = "INIT";

    // Mensaje que saluda al usuario con su nombre y muestra el menú
    const replyWithName = `Perfecto **${mensaje}**, por favor selecciona una de las opciones disponibles en el menú principal.\n\n${contentMenu}`;
    
    await sock.sendMessage(id, { text: replyWithName });
    logConversation(id, replyWithName, "bot");
    return;
  }

  if (userState === "INIT") {
    const num = parseInt(mensaje);
    if (!isNaN(num)) {
      const opciones = {
        1: () => getRandomVariation(prompts["informacion_general"]),
        2: () => getRandomVariation(prompts["requisitos"]),
        3: () => prompts["sucursales_horarios"].content,
        4: async () => await handleVirtualApplication(id, mensaje, userStates, prompts),
      };

      const selected = opciones[num];
      let reply;

      if (selected) {
        if (num === 4) {
          // Para iniciar trámite, no agregamos el menú automáticamente
          reply = await selected();
        } else {
          reply = (await selected()) + "\n" + contentMenu;
        }
      } else {
        reply = "Opción inválida. Por favor, selecciona una opción de 1-4.\n" + contentMenu;
      }

      await sock.sendMessage(id, { text: reply });
      logConversation(id, reply, "bot");
      return;
    }

    // Si el usuario envía texto en lugar de número, clasificamos intención
    const intent = await classifyIntent(mensaje);
    const response = await generateResponse(intent, mensaje, id, prompts, userStates);
    await sock.sendMessage(id, { text: response });
    logConversation(id, response, "bot");
    return;
  }

  const enTramite = isInApplicationProcess(userStates, id);
  const respuesta = enTramite
    ? await continueVirtualApplication(
        userState,
        userStates[id].data,
        id,
        mensaje,
        userStates,
        prompts
      )
    : await handleUserMessage(id, mensaje, prompts, userStates);

  await sock.sendMessage(id, { text: respuesta });
  logConversation(id, respuesta, "bot");
};