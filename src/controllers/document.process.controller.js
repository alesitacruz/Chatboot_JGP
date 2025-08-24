import fs from "fs";
import { validateDocument, validateName } from './gemini.controller.js';
import { getDocumentPrompt, getDocumentMimeType } from "../utils/document.flow.js";

/**
 * Procesa un documento o imagen: valida formato, extrae datos y compara con userData.
 * @param {string} filePath - Ruta al archivo
 * @param {string} documentKey - Tipo de documento (foto_ci_an, croquis, etc.)
 * @param {object} userData - Datos ingresados por el usuario (cedula, nombre, ....)
 * @returns {Promise<object>} { policyResult, extracted, matches }
 */
export async function processDocument(filePath, documentKey, userData, userStates, sender) {
  const mimeType = getDocumentMimeType(documentKey);
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString("base64");

  // 1. Validación de legibilidad y formato
  const validationPrompt = getDocumentPrompt(documentKey);
  const policyResult = await validateDocument(base64Data, mimeType, validationPrompt);

  // 2. Extracción de datos si aplica
  let extracted = {};
  switch (documentKey) {
    case 'foto_ci_an':
    case 'foto_ci_re': {
      const extractPrompt = `Extrae de esta imagen la cédula de identidad (CI) y el nombre completo, como obtener el CI si en la imagen detectas una foto, saca el valor que está debajo de la foto. Si no hay un valor debajo de la foto, entonces busca en la esquina superior contraria. JSON { "ci": "...", "name": "..." }.`;
      const jsonText = await validateDocument(base64Data, mimeType, extractPrompt);
      try {
        extracted = JSON.parse(jsonText);
      } catch {
        // Fallback: regex manual
        const ciMatch = /\"ci\"\s*:\s*\"(\d{5,10})\"/.exec(jsonText);
        const nameMatch = /\"name\"\s*:\s*\"([^\"]+)\"/.exec(jsonText);
        extracted = {
          ci: ciMatch?.[1] || null,
          name: nameMatch?.[1] || null
        };
      }
      break;
    }
    default:
      break;
  }

  console.log("Datos extraídos:", extracted);

  // 3. Comparación con datos de usuario
  const matches = await compareWithUserData(extracted, userData);
  if (!userStates[sender].matches) {
    userStates[sender].matches = matches;
  } else {
    if (!userStates[sender].matches.ciMatch) {
      userStates[sender].matches = matches;
    }
  }

  const resultado = policyResult.trim(); // "si" o "no"
  return resultado;
}

/**
 * Compara datos extraídos con datos proporcionados por el usuario
 */
async function compareWithUserData(extracted, userData) {
  const results = {};
  if (userData.cedula && extracted.ci) {
    results.ciMatch = await userData.cedula === extracted.ci;
  }
  if (userData.nombre_completo && extracted.name) {
    try {
      const isValid = await validateName(`
      ¿El nombre "${userData.nombre_completo}" es similar a "${extracted.name}", no importa la posición de las palabras ni las tildes o mayúsculas?
      Responde ÚNICAMENTE con "true" o "false".
    `);

      console.log("Resultado validación nombre:", isValid);
      results.nameMatch = isValid === "true"; // Convertir a booleano
    } catch (error) {
      console.error("Error validando nombre:", error);
      results.nameMatch = false;
    }
  }
  if (extracted.latitude && extracted.longitude && userData.latitude && userData.longitude) {
    results.locationMatch =
      Math.abs(extracted.latitude - userData.latitude) < 0.0005 &&
      Math.abs(extracted.longitude - userData.longitude) < 0.0005;
  }
  return results;
}
