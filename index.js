import "dotenv/config"
import db from './src/database.js';
import cors from "cors";
import express from "express";
import fs from "fs";
import basicAuth from "express-basic-auth";

const app = express();

const PORT= process.env.PORT ?? 4000;

if (!fs.existsSync("./propuestas")) {
    fs.mkdirSync("./propuestas");
}

//Routes
app.use(cors());
app.use(express.json());
app.use('/api/*', basicAuth({
    challenge: true,
    authorizeAsync: true,
    authorizer: async (username, password, cb) => {
        const result = (await db.execute("SELECT clave FROM Usuario WHERE Usuario.PK_nombreUsuario LIKE ?", [username]))[0];
        console.log(result);
        if (result.length === 0) 
            return cb(null, false);
        
        if (result[0].clave !== password) 
            return cb(null, false);
        console.log("paso");
        return cb(null, true);  
    }
}), async (req, res, next) => {
    req.employee = (await db.execute("SELECT * FROM Empleado INNER JOIN Persona ON Empleado.FK_dniEmpleado LIKE Persona.PK_dni WHERE Empleado.FK_usuarioAsociado LIKE ?;", [req.auth.user]))[0][0];
    next();
});

app.post("/api/login", async (req, res) => {
    res.status(200).json(req.employee);
});


import empleadosRouter from "./src/routes/empleados.js";
app.use("/api/empleados", empleadosRouter);

import propuestasRouter from "./src/routes/propuestas.js";
app.use('/api/propuestas', propuestasRouter);

import clientesRouter from "./src/routes/clientes.js";
app.use(`/api/clientes`, clientesRouter);

import proyectosRouter from "./src/routes/proyectos.js";
app.use(`/api/proyectos`, proyectosRouter);

import vacacionesRouter from "./src/routes/vacaciones.js";
app.use("/api/vacaciones", vacacionesRouter);

app.patch("/api/tareas/:taskId", async (req, res) => {
    let query = "UPDATE Tarea SET";
    const data = [];
    if (req.body.completed !== undefined) {
        if (req.employee.area !== "Tecnica") 
            return res.status(403).send();
        query += `${data.length !== 0 ? ',':''} completada = ?`;
        data.push(req.body.completed);
    }

    if (req.body.completedByEmployee !== undefined) {
        query +=  `${data.length !== 0 ? ',':''} completadaPorEmpleado = ?`
        data.push(req.body.completedByEmployee);
    }
    if (data.length === 0) 
        return res.status(204).send();
    try {
        query += " WHERE PK_idTarea = ?";
        data.push(req.params.taskId);
        await db.execute(query, data);
    } catch (error) {
        return res.status(500).send(error);
    }
    return res.status(200).send();
});

app.patch("/api/desvios/:detourId", async (req, res) => {
    const {state} = req.body;
    if (state === undefined) 
        return res.status(400).send();

    try {
        await db.execute("UPDATE Desvio SET estado = ? WHERE PK_idDesvio = ?", [state, req.params.detourId]);
    } catch (error) {
        return res.status(500).send(error);
    }

    return res.status(200).send();
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
