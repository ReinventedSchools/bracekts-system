import { parentPort, workerData } from "node:worker_threads";
import mysql from "mysql2/promise";

const flag = new Int32Array(workerData.flag);
let port;
let connection;

async function connect() {
  connection = await mysql.createConnection({
    host: workerData.host,
    port: workerData.port,
    user: workerData.user,
    password: workerData.password,
    database: workerData.database,
    charset: "utf8mb4",
    connectTimeout: 15000,
    decimalNumbers: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false
  });
}

function finish(message) {
  port.postMessage(message);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
}

parentPort.on("message", async (message) => {
  if (message.type === "init") {
    port = message.port;
    try {
      await connect();
      finish({ ok: true, ready: true });
    } catch (error) {
      finish({ ok: false, message: error.message, code: error.code });
    }
    return;
  }
  try {
    const [result] = await connection.query(message.sql, message.params);
    const header = Array.isArray(result) ? null : result;
    finish({
      ok: true,
      rows: Array.isArray(result) ? result : [],
      insertId: header ? Number(header.insertId) : 0,
      affectedRows: header ? header.affectedRows : 0
    });
  } catch (error) {
    finish({ ok: false, message: error.message, code: error.code });
  }
});
