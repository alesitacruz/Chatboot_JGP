import { getDbConnection } from "../db/db.js";

export class ApplicationData {
    constructor() {
        // Datos personales
        this.nombre_completo = null;
        this.cedula = null;
        this.email = null;
        this.telefono = null;
        this.es_asalariado = null;

        // Datos financieros
        this.monto = null;
        this.plazo_meses = null;
        this.cuota_mensual = null;
        this.sueldo = null;
        this.ingreso_familiar = null;
        this.cantidad_deuda = 0;
        this.monto_pago_deuda = 0;
        this.max_loan_amount = null;

        // Direcciones opcionales
        this.direccion = null;
        this.latitud= null;
        this.longitud = null;

        this.direccion_trabajo = null;


        // Documentos
        this.documentos = {
            foto_ci_an: null,
            foto_ci_re: null,
            croquis: null,
            boleta_pago1: null,
            boleta_pago2: null,
            boleta_pago3: null,
            factura: null,
            gestora_publica_afp: null,
            custodia: null,
            boleta_impuesto: null,
            tipo_documento_custodia: null
        };

        // ID de solicitud (se asigna después de insertar)
        this.solicitudId = null;
    }
}

export const insertSolicitud = async (data) => {
    const conn = await getDbConnection();
    if (!conn) return false;

    try {
        await conn.query("BEGIN");

        // Insertar cliente
        const sqlCliente = `
            INSERT INTO Cliente 
            (nombre_completo, cedula, es_asalariado, email, telefono)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING id
        `;
        const clienteResult = await conn.query(sqlCliente, [
            data.nombre_completo,
            data.cedula,
            data.es_asalariado,
            data.email,
            data.telefono
        ]);
        const clienteId = clienteResult.rows[0].id;

        // Insertar direcciones
        const sqlDireccion = `
            INSERT INTO Direccion
            (cliente_id, tipo, direccion, latitud, longitud)
            VALUES ($1,$2,$3,$4,$5)
        `;
        if (data.direccion) {
            await conn.query(sqlDireccion, [
                clienteId, 'domicilio', data.direccion, data.latitud, data.longitud
            ]);
        }
        if (data.direccion_trabajo) {
            await conn.query(sqlDireccion, [
                clienteId, 'trabajo', data.direccion_trabajo, data.latitud, data.longitud
            ]);
        }

        // Insertar solicitud (sin documentos)
        const sqlSolicitud = `
            INSERT INTO SolicitudCredito
            (monto_solicitado, plazo_meses, fecha_solicitud, ingreso_mensual, ingreso_familiar, cuota_mensual, 
             monto_mensual_deudas, cantidad_deudas, estado, cliente_id)
            VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,'pendiente',$8)
            RETURNING id
        `;
        const solicitudResult = await conn.query(sqlSolicitud, [
            data.monto,
            data.plazo_meses,
            data.sueldo,
            data.ingreso_familiar || 0,
            data.cuota_mensual,
            data.monto_pago_deuda || 0,
            data.cantidad_deuda || 0,
            clienteId
        ]);
        const solicitudId = solicitudResult.rows[0].id;

        await conn.query("COMMIT");
        return solicitudId;

    } catch (err) {
        await conn.query("ROLLBACK");
        console.error("❌ Error insertando solicitud:", err);
        return false;
    } finally {
        conn.release();
    }
};

export const insertFileLocation = async (solicitudId, filePath, fileType) => {
    const conn = await getDbConnection();
    if (!conn) return false;

    try {
        // Obtener la secuencia siguiente
        const seqResult = await conn.query(
            `SELECT COALESCE(MAX(secuencia),0)+1 AS next_seq 
             FROM Documento WHERE solicitud_id = $1 AND tipo = $2`,
            [solicitudId, fileType]
        );
        const secuencia = seqResult.rows[0].next_seq;

        // Insertar documento
        await conn.query(
            `INSERT INTO Documento (solicitud_id, tipo, secuencia, url_archivo, fecha_subida)
             VALUES ($1,$2,$3,$4,NOW())`,
            [solicitudId, fileType, secuencia, filePath]
        );

        console.log(`Archivo ${fileType} insertado en la solicitud ID: ${solicitudId}`);
        return true;

    } catch (err) {
        console.error("Error insertando documento:", err);
        return false;
    } finally {
        conn.release();
    }
};