
import { classifyYesNo, getRandomVariation } from '../config/utils.js';
import { resetUserState } from '../controllers/user.state.controller.js';
import directoryManager from '../config/directory.js';
import fs from "fs";
import { contentMenu } from '../utils/message.js';
import { getDocumentState, documentsFlow, getDocumentMessage } from '../utils/document.flow.js'
import { userRetryMessage } from '../utils/user.intents.messages.js';
import { showOptionsDeuda, CORRECTION_MAP, MIN_MONTO, MAX_MONTO, MIN_PLAZO, MAX_PLAZO, MIN_SUELDO, MAX_SUELDO, MIN_DEUDAS, MAX_DEUDAS ,showDontGetTramite, showChangeData } from '../utils/tramite.constant.js';
import { processCapacityEvaluation, processCapacityEvaluationFamiliar, handleCancel } from '../utils/tramite.helppers.js';
import { parseCurrency } from '../utils/tramite.validations.js';
import { calculateCapacidad, calculateMaxLoanAmount } from '../utils/tramite.calculations.js';
import { getTramitePrompt, handleTextInput, handleLocationInput, handleNumberInput, handlePlazoInput } from '../utils/tramite.flow.js'
import {messageCancelSuccess, messagePrestamosAsalariado, meesageRespondaSioNo, messageCustodia,messageMontoValido, messageSaldoInsuficiente} from '../utils/message.js';

export const handleInitialChecks = (userMessage, sender, userStates) => {
    if (typeof userMessage !== "object" && userMessage.toLowerCase().includes("cancelar")) {
        handleCancel(sender, userStates);
        return `${messageCancelSuccess}\n\n${contentMenu}`;
    }
    return null;
};



export const handleStateFlow = (state, data, sender, userMessage, userStates, prompts) => {
    switch (state) {
        case "verificar_asalariado": {
            const respuesta = classifyYesNo(userMessage);
            if (respuesta === true) {
                data.es_asalariado = true;
                userStates[sender].in_data_charge = true;
                userStates[sender].state = "sueldo";
                userStates[sender].retries = 0;
                return getTramitePrompt("sueldo");
            } else if (respuesta === false) {
                const message = `${messagePrestamosAsalariado}\n\n${getRandomVariation(prompts["requisitos"])}`;
                userStates[sender].state = "INIT";
                userStates[sender].retries = 0;
                userStates[sender].in_application = false;
                return `${message}\n\n${contentMenu}`;
            } else {
                return userRetryMessage(userStates, sender, `${meesageRespondaSioNo}`);
            }
        }
        case "sueldo": {
            const val = parseCurrency(userMessage);
            
            return handleNumberInput(userStates, sender, data, "sueldo", "monto", val, MIN_SUELDO, MAX_SUELDO);
        }
        case "monto": {
            const val = parseCurrency(userMessage);            
            const MX_MONTO = data.max_loan_amount ? data.max_loan_amount : MAX_MONTO; 

            return handleNumberInput(userStates, sender, data, "monto", "plazo_meses", val, MIN_MONTO, MX_MONTO);
        }
        case "plazo_meses": {
            const meses = parseCurrency(userMessage);
            return handlePlazoInput(userStates, sender, data, "plazo_meses", "deuda", meses, MIN_PLAZO, MAX_PLAZO);
        }
        case "deuda": {
            switch (classifyYesNo(userMessage)) {
                case true:
                    userStates[sender].state = "cantidad_deuda";
                    return getTramitePrompt("cantidad_deuda");
                case false:
                    return processCapacityEvaluation(data, userStates, sender);
                default:
                    return `${meesageRespondaSioNo}`;
            }
        }
        case "cantidad_deuda": {
            const count = parseCurrency(userMessage);
            return handleNumberInput(userStates, sender, data, "cantidad_deuda", "monto_pago_deuda", count, MIN_DEUDAS, MAX_DEUDAS);
        }
        case "monto_pago_deuda": {
            const amount = parseCurrency(userMessage);
            if (isNaN(amount) || amount < 0) {
                return userRetryMessage(userStates, sender, messageMontoValido);
            }
            data.monto_pago_deuda = amount;
            return processCapacityEvaluation(data, userStates, sender);
        }
        ////datos personales
        case "nombre_completo": {
            return handleTextInput(userStates, sender, data, "nombre_completo", "cedula", userMessage.trim());
        }
        case "cedula": {
            return handleTextInput(userStates, sender, data, "cedula", "email", userMessage.trim());
        }
        case "email": {
            return handleTextInput(userStates, sender, data, "email", "direccion", userMessage.trim());
        }
        case "direccion": {
            return handleTextInput(userStates, sender, data, "direccion", "enlace_maps", userMessage.trim());
        }
        case "enlace_maps": {
            return handleLocationInput(userStates, sender, data, "enlace_maps", "direccion_trabajo", userMessage);
        }
        case "direccion_trabajo": {
            return handleTextInput(userStates, sender, data, "direccion_trabajo", "enlace_maps_trabajo", userMessage.trim());
        }
        case "rubro": {
            return handleTextInput(userStates, sender, data, "rubro", "sueldo", userMessage.trim());
        }
        case "familiar_asalariado": {
            switch (classifyYesNo(userMessage)) {
                case true:
                    userStates[sender].state = "sueldo_familiar";
                    return getTramitePrompt("sueldo_familiar");
                case false:
                    userStates[sender].state = "select_option_deuda";
                    return showOptionsDeuda(data);
                default:
                    return `${meesageRespondaSioNo}`;
            }
        }
        case "sueldo_familiar": {
            const amount = parseCurrency(userMessage);
            if (isNaN(amount) || amount <= 0) {
                return userRetryMessage(userStates, sender, messageMontoValido);
            }
            data.ingreso_familiar = amount;
            return processCapacityEvaluationFamiliar(data, userStates, sender);
        }
        case "select_option_deuda": {
            const option = parseCurrency(userMessage);
            switch (option) {
                case 1:
                    userStates[sender].adjustmentFlow = 'monto';
                    userStates[sender].state = "monto";
                    return `Ingrese nuevo monto (máximo ${data.max_loan_amount.toFixed(2)} Bs):`;

                case 2:
                    userStates[sender].adjustmentFlow = 'plazo';
                    userStates[sender].state = "plazo_meses";
                    return `Ingrese nuevo plazo (${MIN_PLAZO}-${MAX_PLAZO} meses):`;

                case 3:
                    userStates[sender].state = "INIT";
                    return `Visite nuestras oficinas para más opciones.\n ${prompts.sucursales_horarios.content}\n${contentMenu}`;

                default:
                    const capacidad = calculateCapacidad(data);
                    if (capacidad > 0) {
                        return showDontGetTramite();
                    }
                    const maxLoan = calculateMaxLoanAmount(capacidad, data.plazo_meses);
                    return userRetryMessage(userStates, sender, showOptionsDeuda(data, capacidad, maxLoan));
            }
        }
        case "fondos_insuficientes": {
            resetUserState(userStates, sender);
            return messageSaldoInsuficiente+"\n\n" + contentMenu;
        }

        case "verificacion": {
            const resp = classifyYesNo(userMessage);
            if (resp === true) {
                // ... (código existente para la verificación)
                // En lugar de ir a los documentos, ahora vamos a los términos
                userStates[sender].state = "terminos_condiciones";
                userStates[sender].retries = 0;
                return getTramitePrompt("terminos_condiciones");
            } else if (resp === false) {
                // ... (código existente para corrección)
            } else {
                return `❓ Responda Sí✔️ o No❌.`;
            }
        }
        
        // Nuevo caso para manejar los Términos y Condiciones
        case "terminos_condiciones": {
            const respuesta = classifyYesNo(userMessage);
            if (respuesta === true) {
                userStates[sender].retries = 0;
                userStates[sender].state = "nombre_completo"; 

                // Combina los mensajes usando la variable con el nombre
               return `Es buena noticia que quieras iniciar un tramite virtual. Ahora comencemos, escribe tu:\n\n${getTramitePrompt("nombre_completo")}`;

            } else if (respuesta === false) {
                // ... (lógica de reintentos existente)
            } else {
                return userRetryMessage(userStates, sender, `${meesageRespondaSioNo}`);
            }
        }
        
        // Nuevo caso para la razón del rechazo
        case "razon_rechazo_terminos": {
            // Aquí puedes procesar la razón del usuario y guardarla si es necesario
            const razon = userMessage.trim();
            // Lógica para guardar la razón...
            // Luego, terminas el flujo o lo rediriges
            userStates[sender].state = "INIT";
            return `Gracias por la información. Hemos registrado tu razón. Puedes iniciar un nuevo trámite cuando lo desees.\n\n${contentMenu}`;
        }

        case "enlace_maps_trabajo": {
            const response = handleLocationInput(userStates, sender, data, "enlace_maps_trabajo", null, userMessage);

            // Si es un mensaje válido (no es un reintento)
            if (!response.includes('❌') && !response.includes('Responda')) {
                const transitionMessage = "¡Excelente! Ya tenemos todos tus datos personales. Ahora, continuemos con los documentos necesarios para el trámite.";

                const userTempDir = directoryManager.getPath("temp") + "/" + sender;
                fs.mkdirSync(userTempDir, { recursive: true });

                const firstKey = documentsFlow[0].key;
                userStates[sender].state = getDocumentState(firstKey);  
                userStates[sender].current_document = firstKey;
                userStates[sender].retries = 0;

                return `${transitionMessage}\n\n${getDocumentMessage(firstKey)}`;
            }

            // Si hubo error en la ubicación
            return response;
        }

        
        default:
            return `Ha ocurrido un error inesperado, intente de nuevo o escriba 'cancelar'.`;
    }
};


export const handleCorrections = (state, sender, userMessage, userStates, data) => {
    if (state === "correccion") {
        const opcion = parseCurrency(userMessage);
        if (![1, 2, 3, 4, 5].includes(opcion)) {
            return userRetryMessage(userStates, sender, `❌ Opción no válida. Ingrese un número del 1 al 5:`);
        }
        const nextState = CORRECTION_MAP[opcion];
        userStates[sender].state = nextState;
        return `✏️ Ingrese el nuevo valor para ${getTramitePrompt(nextState.split('-')[1])}:`;
    }

    // Correcciones individuales
    if (state === "correccion-nombre_completo") {
        return handleTextInput(userStates, sender, data, "nombre_completo", "verificacion", userMessage.trim());
    }
    if (state === "correccion-cedula") {
        return handleTextInput(userStates, sender, data, "cedula", "verificacion", userMessage.trim());
    }
    if (state === "correccion-direccion") {
        return handleTextInput(userStates, sender, data, "direccion", "verificacion", userMessage.trim());
    }
    if (state === "correccion-email") {
        return handleTextInput(userStates, sender, data, "email", "verificacion", userMessage.trim());
    }
    if (state === "correccion-enlace_maps") {
        return handleLocationInput(userStates, sender, data, "enlace_maps", "verificacion", userMessage);
    }
    return null;
};
