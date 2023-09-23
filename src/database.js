import mysql from "mysql2/promise";

const dbConfig = {
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? 'password',
    database: process.env.DB_NAME ?? 'Empresa',
    host: process.env.DB_HOST ?? 'localhost',
    port: process.env.DB_PORT ?? '3306'
};

export default await mysql.createConnection(dbConfig);