import db from '../database.js';

export default {get, post};

async function get(req, res) {
    if (!["Comercial", "Tecnica"].includes(req.employee.area)) 
        return res.status(403).send();
    
    const [clients] = await db.execute("SELECT * FROM Cliente;")
		.catch(error => res.status(500).send(error), [null]);

	if (clients)
    	return res.status(200).json(clients);
}

async function post(req, res) {
	if (req.employee.area !== "Comercial") 
        return res.status(403).send();
    
    const {contact, companyName, companyAddress, description} = req.body;
    if (contact === undefined || !(contact instanceof Object)) 
        return res.status(400).send(`missing field: contact`);

    const {dni, name, surname, phone, address, email} = contact;
    const birthdate = req.body.contact?.birthdate?.slice(0, -1);
    const personData = {dni, name, surname, phone, address, email, birthdate};
    const fields = {...personData, companyName, companyAddress, description};
    for (const key in fields) 
        if (fields[key] === undefined)
            return res.status(400).send(`missing field: ${key}`);
    
    const companyData = {companyName, description, companyAddress, dni};
    await db.beginTransaction();
    try {
        await db.execute("INSERT INTO Persona VALUES (?, ?, ?, ?, ?, ?, ?);", Object.values(personData));
        await db.execute("INSERT INTO Cliente(nombreEmpresa, descripcion, direccion, FK_referenteDeContacto) VALUES (?, ?, ?, ?);", Object.values(companyData));
    } catch (error) {
        await db.rollback();
        return res.status(500).send(error);
    }
    await db.commit();
    return res.status(204).send();
}