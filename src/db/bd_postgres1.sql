CREATE TABLE Cliente (
    id SERIAL PRIMARY KEY,
    nombre_completo VARCHAR(255) NOT NULL,
    cedula VARCHAR(20) UNIQUE NOT NULL,
    direccion VARCHAR(255),
    es_asalariado BOOLEAN DEFAULT FALSE,
    email VARCHAR(100),
    telefono VARCHAR(20),
    rubro VARCHAR(100)
);
CREATE TABLE Direccion (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL,          -- 'domicilio' o 'trabajo'
    latitud DECIMAL(10,7),
    longitud DECIMAL(10,7),
    direccion VARCHAR(255),
    cliente_id INT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES Cliente(id) ON DELETE CASCADE
);

CREATE TABLE SolicitudCredito (
    id SERIAL PRIMARY KEY,
    monto_solicitado DECIMAL(12,2) NOT NULL,
    plazo_meses INT NOT NULL,
    fecha_solicitud TIMESTAMP DEFAULT NOW(),
    ingreso_mensual DECIMAL(12,2),
    ingreso_familiar DECIMAL(12,2),
    cuota_mensual DECIMAL(12,2),
    monto_mensual_deudas DECIMAL(12,2) DEFAULT 0,
    cantidad_deudas INT DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'pendiente',
    cliente_id INT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES Cliente(id) ON DELETE CASCADE
);

CREATE TABLE Documento (
    id SERIAL PRIMARY KEY,
    solicitud_id INT NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    secuencia INT DEFAULT 1,
    url_archivo VARCHAR(255) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (solicitud_id) REFERENCES SolicitudCredito(id) ON DELETE CASCADE
);
