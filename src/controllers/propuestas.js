import db from "../database.js";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
export default {get, getById, post, patch, getTechnicalProposal};

async function get(req, res) {
    if (!["Comercial", "Tecnica"].includes(req.employee.area)) 
        return res.status(403).send();
    
    let query = "SELECT * FROM Propuesta";
    const data = [];
    if (req.query.state !== undefined) {
        query = query.concat(" WHERE Propuesta.estado LIKE ?");
        data.push(req.query.state);
    }
    
    const [proposals] = await db.execute(query, data)
        .catch(error => res.status(500).send(error), [null]);
    
    if (proposals !== null)
        return res.status(200).json(proposals);
}

async function getById(req, res) {
    if (req.employee.area === "Desarrollo") 
        return res.status(403).send();
    
    const [proposal] = await db.execute("SELECT * FROM Propuesta WHERE PK_idPropuesta = ?", [req.params.proposalId])
        .catch(error => res.status(500).send(error), [null]);
    
    if (proposal === null) 
        return;

    if (proposal.length === 0) 
        return res.status(404).send();

    return res.status(200).send(proposal[0]);
}

async function post(req, res) {
    if (req.employee.area !== "Comercial") 
        return res.status(403).send();

    const {name, description, budget, clientContact, technician, client} = req.body;
    const deadline = req.body.deadline?.slice(0, -1);

    if (clientContact === undefined || !(clientContact instanceof Object))
        res.status(400).send("missing or invalid field clientContact");

    const {dni, contactName, contactSurname, phone, address, email} = clientContact;
    const birthdate = clientContact.birthdate?.slice(0, -1);

    const contact = {dni, contactName, contactSurname, phone, address, email, birthdate};
    for (const key in contact) 
        if (contact[key] === undefined)
            return res.status(400).send(`missing field ${key} inside clientContact`);

    const proposal = {
        name, description, deadline, budget, clientContact: contact.dni, client, technician
    };
    for (const key in proposal) {
        if (proposal[key] === undefined)
            return res.status(400).send(`missing field ${key}`);
    }

    await db.beginTransaction();
    const directory = path.resolve(`./propuestas/${randomUUID()}`);
    console.log(directory);
    try {
        await fs.mkdir(directory);
        await db.execute("INSERT INTO Persona VALUES (?, ?, ?, ?, ?, ?, ?);", Object.values(contact));
        await db.execute(`INSERT INTO Propuesta(nombrePropuesta, descripcionNecesidadCliente, restriccionTemporal, restriccionEconomica, FK_referenteDelCliente, FK_empresaCliente, FK_empleadoTecnicoAsociado, FK_empleadoComercialAsociado, directorioArchivosPropuesta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, [...Object.values(proposal), req.employee.FK_dniEmpleado, directory]);
        const proposalId = (await db.execute("SELECT LAST_INSERT_ID()"))[0][0]["LAST_INSERT_ID()"];
        await db.execute("UPDATE Empleado SET FK_propuestaAsignada = ? WHERE FK_dniEmpleado LIKE ?", [proposalId, technician])
    } catch (error) {
        console.log(error);
        await fs.rm(directory, {force: true, recursive: true});
        await db.rollback();
        return res.status(500).send(error);
    }
    await db.commit();
    return res.status(204).send();
}

const upload = multer({storage: multer.diskStorage({
    destination: async function(req, file, cb) {
        const [result] = await db.execute("SELECT directorioArchivosPropuesta FROM Propuesta WHERE Propuesta.PK_idPropuesta = ?", [req.params.proposalId])
            .catch(error => cb({message: error, status: 500}), [null]);
        if (result === null)
            return;
        if (result.length === 0) 
            return cb({message: "", status: 404});
        
        const directory = result[0].directorioArchivosPropuesta;
        return cb(null, directory);
    },
    filename: function(req, file, cb) {
        if (file.mimetype !== "application/pdf") 
            return cb({message: "unexpected mime type, expected application/pdf", status: 400});
        
        cb(null, "proposal.pdf");
    }
})}).single("technicalProposal");

async function patch(req, res) {
    upload(req, res, async error => {   
        if (error) {
            const status = error.status ?? 500;
            return res.status(status).send(error);
        }
        let success = false;
        try {
            await db.beginTransaction();
            const [result] = await db.execute("SELECT estado, progreso, rutaPropuestaTecnica FROM Propuesta WHERE Propuesta.PK_idPropuesta = ?", [req.params.proposalId]);
            if (result.length === 0) 
                return res.status(404).send();

            if (req.file !== undefined) {
                if (req.employee.area !== "Tecnica") 
                    return res.status(403).send();
                if (["Aprobado", "Rechazado"].includes(result[0].estado))
                    return res.status(400).send("cannot patch an approved/rejected proposal");
                if (result[0].progreso === "Enviado al cliente") 
                    return res.status(400).send("the proposal has already been sent to the client");
                await db.execute("UPDATE Propuesta SET progreso = 'Enviar al cliente', estado = 'En progreso', rutaPropuestaTecnica = ?, FK_empleadoTecnicoAsociado = ? WHERE Propuesta.PK_idPropuesta = ?", [req.file.path, req.employee.FK_dniEmpleado, req.params.proposalId]);   
            }

            if (req.body.state !== undefined) {
                if (req.employee.area !== "Comercial") 
                    return res.status(403).send();
                if (req.body.state === "Aprobado")
                    return res.status(400).send("wrong endpoint, POST to /proyectos");
                let query = "UPDATE Propuesta SET estado = ?";
                if (req.body.state === "Observado") 
                    query = query.concat(", progreso = 'A estimar'");
                if (req.body.state === "Rechazado") {
                    const technicianId = (await db.execute("SELECT FK_empleadoTecnicoAsociado FROM Propuesta WHERE PK_idPropuesta = ?", [req.params.proposalId]))[0][0].FK_empleadoTecnicoAsociado;
                    await db.execute("UPDATE Empleado SET FK_propuestaAsignada = NULL WHERE FK_dniEmpleado LIKE ?", [technicianId]);
                }
                query = query.concat(" WHERE Propuesta.PK_idPropuesta = ?");
                await db.execute(query, [req.body.state, req.params.proposalId]);
            }

            if (req.body.progress !== undefined) {
                if (req.employee.area !== "Comercial") 
                    return res.status(403).send();
                if (["Enviar al cliente", "Enviado al cliente"].includes(req.body.progress) && result[0].rutaPropuestaTecnica === null)
                    return res.status(400).send("a technical proposal has not yet been submitted");
                await db.execute("UPDATE Propuesta SET progreso = ? WHERE Propuesta.PK_idPropuesta = ?", [req.body.progress, req.params.proposalId]);
            }

            success = true;
        } catch (error) {
            return res.status(500).send(error);
        } finally {
            if (success) {
                await db.commit();
            } else {
                await db.rollback();
                if (req.file !== undefined) 
                    await fs.rm(req.file.path, {force: true});
            }
        }

        return res.status(204).send();
    });
}

async function getTechnicalProposal(req, res) {
    if (!["Comercial", "Tecnica"].includes(req.employee.area)) 
        return res.status(403).send;

    const path = (await db.execute("SELECT rutaPropuestaTecnica FROM Propuesta WHERE PK_idPropuesta = ?", [req.params.proposalId]))[0][0].rutaPropuestaTecnica;
    if (path === null)
        return res.status(404).send();

    return res.download(path);
}