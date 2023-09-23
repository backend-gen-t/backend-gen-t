import db from "../database.js";
export default {get};

async function get(req, res) {
    const [vacations] = await db.execute("SELECT * FROM PeticionVacacion INNER JOIN Persona ON PeticionVacacion.FK_empleado LIKE Persona.PK_dni;")
        .catch(error => res.status(500).send(error), [null]);

    if (vacations) 
        return res.status(200).json(vacations);
}