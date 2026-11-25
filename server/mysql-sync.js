import { Worker, MessageChannel, receiveMessageOnPort } from "node:worker_threads";

function waitFor(flag, port, timeoutMs) {
  const start = Date.now();
  while (Atomics.load(flag, 0) !== 1) {
    Atomics.wait(flag, 0, 0, 500);
    if (Date.now() - start > timeoutMs) {
      throw new Error("La base de datos del VPS no respondió a tiempo.");
    }
  }
  Atomics.store(flag, 0, 0);
  const received = receiveMessageOnPort(port);
  if (!received) throw new Error("La base de datos del VPS no entregó una respuesta.");
  return received.message;
}

export function openDatabase(config) {
  if (!config.host || !config.user || !config.database) {
    throw new Error("Faltan DB_HOST, DB_USER o DB_NAME en .env.");
  }
  if (!config.password) {
    throw new Error("Escriba la contraseña de MariaDB en DB_PASSWORD, dentro de .env. Es la misma de HeidiSQL.");
  }

  const flag = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL("./mysql-worker.js", import.meta.url), {
    workerData: {
      flag: flag.buffer,
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database
    }
  });
  worker.unref();
  Atomics.store(flag, 0, 0);
  worker.postMessage({ type: "init", port: port2 }, [port2]);
  const ready = waitFor(flag, port1, 30000);
  if (!ready.ok) {
    const error = new Error(ready.message || "No se pudo conectar con MariaDB.");
    error.code = ready.code;
    throw error;
  }

  function query(sql, params) {
    Atomics.store(flag, 0, 0);
    worker.postMessage({ sql, params });
    const message = waitFor(flag, port1, 30000);
    if (!message.ok) {
      const error = new Error(message.message || "Error de MariaDB.");
      error.code = message.code;
      throw error;
    }
    return message;
  }

  return { query };
}
