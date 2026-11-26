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

function connectionLost(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return [
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ETIMEDOUT",
    "PROTOCOL_CONNECTION_LOST",
    "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
    "PROTOCOL_ENQUEUE_AFTER_QUIT"
  ].includes(code) || /closed state|Connection lost|server has gone away/i.test(message);
}

async function query(sql, params) {
  try {
    return await connection.query(sql, params);
  } catch (error) {
    if (!connectionLost(error)) throw error;
    await connect();
    return connection.query(sql, params);
  }
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
    const [result] = await query(message.sql, message.params);
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
