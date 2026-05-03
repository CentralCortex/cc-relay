const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const SECRET = process.env.SECRET || "changeme";
const PORT = process.env.PORT || 3000;

let macMini = null;
const pending = new Map(); // id -> { socket, timer }

io.use((socket, next) => {
  if (socket.handshake.auth.secret === SECRET) return next();
  next(new Error("Unauthorized"));
});

io.on("connection", (socket) => {
  if (socket.handshake.auth.role === "mac-mini") {
    macMini = socket;
    console.log("Mac Mini connected");

    socket.on("response", ({ id, text }) => {
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.socket.emit("reply", { text });
    });

    socket.on("disconnect", () => {
      macMini = null;
      console.log("Mac Mini disconnected");
      for (const [id, entry] of pending) {
        entry.socket.emit("reply", { text: "⚠️ Mac Mini disconnected" });
        clearTimeout(entry.timer);
      }
      pending.clear();
    });

  } else {
    socket.on("message", ({ text }) => {
      if (!macMini) return socket.emit("reply", { text: "⚠️ Mac Mini offline" });
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        pending.delete(id);
        socket.emit("reply", { text: "⏱ Timed out" });
      }, 600_000);
      pending.set(id, { socket, timer });
      macMini.emit("message", { id, text });
    });
  }
});

server.listen(PORT, () => console.log(`Relay running on :${PORT}`));
