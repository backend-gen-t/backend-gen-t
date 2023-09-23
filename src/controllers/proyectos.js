import multer from "multer";
import fs from "fs/promises";
import db from "../database.js";

export default {get, post, getById, getDetours, postDetour, getTasks, getEmployees, putEmployeeIntoProject, getRoadmap, deleteEmployeeFromProject};

async function get(req, res) {
    if (req.employee.area !== "Comercial") 
        return res.status(403).send();        
    
    const [projects] = await db.execute("SELECT * FROM Proyecto;")
        .catch(error => res.status(500).send(error), [null]);

    if (projects !== null)
        return res.status(200).json(projects);
}

const upload = multer({storage: multer.diskStorage({
    destination: async function(req, file, cb) {
        console.log(req.body);
        if (req.body.associatedProposal === undefined) 
            return cb({message: "missing field associatedProposal", status: 400});
        const [result] = await db.execute("SELECT * FROM Propuesta WHERE Propuesta.PK_idPropuesta = ?", [req.body.associatedProposal])
            .catch(error => cb({message: error, status: 500}), [null]);
        if (result === null)
            return;
        if (result.length === 0) 
            return cb({message: "", status: 404});
        
        const directory = result[0].directorioArchivosPropuesta;
        req.associatedProposal = result[0];
        return cb(null, directory);
    },
    filename: function(req, file, cb) {
        if (file.mimetype !== "application/pdf") 
            return cb({message: "unexpected mime type, expected application/pdf", status: 400});
        
        cb(null, "roadmap.pdf");
    }
})}).single("roadmap");
async function post(req, res) {
    upload(req, res, async error => {
        if (error) {
            const status = error.status ?? 500;
            return res.status(status).send(error);
        } 
        if (req.file === undefined) 
            return res.status(400).send("missing file roadmap");
        const {name, type, deadline, startDate, availableHours, availableEmployees, budget} = req.body;
        const project = {name, type, startDate, deadline, availableHours, availableEmployees, budget};
        for (const key in project) 
            if (project[key] === undefined)
                return res.status(400).send(`missing field ${key}`);
        
        await db.beginTransaction();
        try {
            if (req.associatedProposal.estado !== "Aprobado") 
                await db.execute("UPDATE Propuesta SET estado = 'Aprobado' WHERE PK_idPropuesta = ?", [req.associatedProposal.PK_idPropuesta]);
            await db.execute("INSERT INTO Proyecto(nombre, tipo, fechaInicio, fechaEntregaIdeal, horasDisponibles, empleadosDisponibles, presupuesto, FK_responsableComercial, FK_responsableDeGestion, FK_propuestaAsociada, rutaPlanDeTrabajo) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [...Object.values(project), req.associatedProposal.FK_empleadoComercialAsociado, req.associatedProposal.FK_empleadoTecnicoAsociado, req.body.associatedProposal, req.file.path]);
            const projectId = (await db.execute("SELECT LAST_INSERT_ID()"))[0][0]["LAST_INSERT_ID()"];
            await db.execute("UPDATE Empleado SET FK_proyectoAsignado = ? WHERE FK_dniEmpleado IN (?, ?)", [projectId, req.associatedProposal.FK_empleadoTecnicoAsociado, req.associatedProposal.FK_empleadoComercialAsociado]);
        } catch (error) {
            await db.rollback();
            await fs.rm(req.file.path, {force: true});
            return res.status(500).send(error);
        }
        await db.commit();
        return res.status(204).send();
    });
}

async function getById(req, res) {
    if (!["Comercial", "Tecnica"].includes(req.employee.area) || (req.employee.area === "Tecnica" && req.employee.FK_proyectoAsignado.toString() !== req.params.projectId))
       return res.status(403).send();
    
    const [project] = await db.execute("SELECT * FROM Proyecto WHERE Proyecto.PK_idProyecto = ?;", [req.params.projectId])
        .catch((error) => res.status(500).send(error), [null]);
    if (project === null) 
        return;
    if (project.length === 0) 
        return res.status(404).send();
    return res.status(200).json(project[0]);

}
 
async function getDetours(req, res) {
    if (!["Comercial", "Tecnica"].includes(req.employee.area) || (req.employee.area === "Tecnica" && req.employee.FK_proyectoAsignado?.toString() !== req.params.projectId)) 
        return res.status(403).send();

    const [detours] = await db.execute("SELECT * FROM Desvio WHERE Desvio.FK_proyectoAsociado = ?;", [req.params.projectId])
        .catch(error => res.status(500).send(error), [null]);

    if (detours !== null) 
        return res.status(200).json(detours);
}

async function postDetour(req, res) {
	if (req.employee.FK_proyectoAsignado?.toString() !== req.params.projectId || req.employee.area !== "Tecnica") 
        return res.status(403).send();

    req.body.date ??= new Date().toISOString();
    req.body.date = req.body.date.slice(0, -1);
    const newDeadline = req.body.newDeadline?.slice(0, -1);
    const {name, date, employeeCost, hourCost, budgetCost, detail} = req.body;
    const detour = {name, date, employeeCost, hourCost, budgetCost, newDeadline, projectId: req.params.projectId, detail};
    for (const key in detour) 
        if (detour[key] === undefined)
            return res.status(400).send(`missing field: ${key}`);
    
    await db.beginTransaction()
    try {
        await db.execute("INSERT INTO Desvio(nombreDesvio, fecha, costeEmpleadosDisponibles, costeHorasDisponibles, costePresupuesto, nuevaFechaEntrega, FK_proyectoAsociado, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", Object.values(detour));
        await db.execute(`
            UPDATE 
                Proyecto 
            SET 
                fechaEntregaIdeal = ?, 
                empleadosDisponibles = empleadosDisponibles + ?,
                horasDisponibles = horasDisponibles + ?,
                presupuesto = presupuesto + ?;
            WHERE
                Proyecto.FK_proyectoAsociado = ?
        `, [newDeadline, employeeCost, hourCost, budgetCost, req.params.project]);
    } catch (error) {
        await db.rollback()
        return res.status(500).send(error);
    }
    await db.commit();
    return res.status(204).send();
}

async function getTasks(req, res) {
    if (req.employee.area !== "Tecnica" || req.employee.FK_proyectoAsignado?.toString() !== req.params.projectId) 
        return res.status(403).send();

    const [tasks] = await db.execute("SELECT * FROM Tarea WHERE Tarea.FK_proyectoAsignado = ?", [req.params.projectId])
        .catch(error => res.status(500).send(error), [null]);

    if (tasks !== null) 
        return res.status(200).json(tasks);
}

async function getEmployees(req, res) {
    if (!["Tecnica", "Comercial"].includes(req.employee.area)) 
        return res.status(403).send();

    const [employees] = await db.execute("SELECT * FROM Empleado INNER JOIN Persona ON Empleado.FK_dniEmpleado LIKE Persona.PK_dni WHERE Empleado.FK_proyectoAsignado = ?", [req.params.projectId])
        .catch(error => res.status(500).send(error), [null]);

    if (employees === null) 
        return;

    if (employees.length === 0) 
        return res.status(204).send();
    
    return res.status(200).send(employees);
    
}

async function putEmployeeIntoProject(req, res) {
    if (req.employee.area !== "Tecnica") 
        return res.status(403).send();

    const [projectData] = await db.execute("SELECT * FROM Proyecto WHERE PK_idProyecto = ?", [req.params.projectId]);

    if (projectData.length === 0) 
        return res.status(404).send();

    if (req.employee.area.FK_proyectoAsignado !== projectData.PK_idProyecto) 
        return res.status(403).send();
    
    await db.beginTransaction();
    try {
        await db.execute("UPDATE Empleado SET FK_proyectoAsignado = ? WHERE FK_dniEmpleado LIKE ?", [req.params.projectId, req.params.employeeId]);
        await db.execute("UPDATE Proyecto SET empleadosDisponibles = empleadosDisponibles - 1 WHERE PK_idProyecto = ?", [req.params.projectId]);
    } catch (error) {
        await db.rollback();
        return res.status(500).send(error);
    }
    await db.commit();
    return res.status(201).send();
}

async function getRoadmap(req, res) {
    if (!["Comercial", "Tecnica"].includes(req.employee.area)) 
        return res.status(403).send;

    const path = (await db.execute("SELECT rutaPlanDeTrabajo FROM Proyecto WHERE PK_idProyecto = ?", [req.params.projectId]))[0][0].rutaPlanDeTrabajo;
    if (path === null)
        return res.status(404).send();

    return res.download(path);
}

async function deleteEmployeeFromProject(req, res) {
    if (req.employee.area !== "Tecnica") 
        return res.status(403).send();

    const [projectData] = await db.execute("SELECT * FROM Proyecto WHERE PK_idProyecto = ?", [req.params.projectId]);

    if (projectData.length === 0) 
        return res.status(404).send();

    if (req.employee.area.FK_proyectoAsignado !== projectData.PK_idProyecto) 
        return res.status(403).send();

    await db.beginTransaction();
    try {
        await db.execute("UPDATE Empleado SET FK_proyectoAsignado = NULL, FK_propuestaAsignada = NULL WHERE FK_dniEmpleado LIKE ?", [req.params.employeeId]);
        await db.execute("UPDATE Proyecto SET empleadosDisponibles = empleadosDisponibles + 1 WHERE PK_idProyecto = ?", [req.params.projectId]);
    } catch (error) {
        await db.rollback();
        return res.status(500).send(error);
    }
    await db.commit();
    return res.status(201).send();
}