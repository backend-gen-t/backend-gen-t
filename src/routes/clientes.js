import { Router } from "express";
import clientes from "../controllers/clientes.js";
const router = Router();
/**
 * Response:
 *      403 Forbidden: if the employee does not belong to the commerce nor technical department
 *      500 Internal Server Error: on mysql error
 *      200 OK: array of clients in body
 */
router.get("/", clientes.get);

/**
 * Request:
 *      {
 *          companyName: string,
 *          companyAddress: string,
 *          description: string,
 *          contact: {
 *              dni: string, 
 *              name: string, 
 *              surname: string,
 *              phone: string,
 *              address: string,
 *              email: string,
 *              birthdate: Date
 *          }
 *      }
 * Response:
 *      403 Forbidden: if the employee does not belong to the commerce department
 *      400 Bad Request: when the body is missing a required field
 *      500 Internal Server Error: on mysql error
 *      204 No Content: on successful insert
 */
router.post("/", clientes.post);

export default router;