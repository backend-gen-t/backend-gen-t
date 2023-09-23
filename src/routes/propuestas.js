import { Router } from "express";
import propuestas from "../controllers/propuestas.js";
const router = Router();
/**
 * Query:
 *      state?: ENUM("En progreso", "Aprobado", "Rechazado", "Observado")
 * Response:
 *      403 Forbidden: when employee doesnt belong to commerce nor technical department
 *      500 Internal Server Error: on mysql error
 *      200 OK: proposals array on body
*/
router.get("/", propuestas.get);

router.get("/:proposalId", propuestas.getById);

/**
 * Request:
 *      {
 *          name: string,
 *          description: string,
 *          deadline: date,
 *          budget: float,
 *          client: string,
 *          technician: string,
 *          clientContact: {
 *              dni: string,
 *              contactName: string,
 *              contactSurname: string,
 *              phone: string,
 *              address: string,
 *              email: stirng,
 *              birthdate: Date
 *          }
 *      }
 *      
 * Response:
 *      400 Bad Request: when the body is missing a required field
 *      403 Forbidden: when employee doesnt belong to commerce department
 *      500 Internal Server Error: on mysql error or on file system error
 *      204 No Content: insert succeeded
*/
router.post("/", propuestas.post);


/**
 * encoding mutipart/form-data
 * Request
 *      technicalProposal?: pdf file
 *      progress?
 *      state?
 *      
 */
router.patch("/:proposalId", propuestas.patch);

router.get("/:proposalId/propuestaTecnica", propuestas.getTechnicalProposal);

export default router;