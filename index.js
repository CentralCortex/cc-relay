const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 20e6 });

const SECRET = process.env.SECRET || "changeme";
const PORT = process.env.PORT || 3000;

let macMini = null;
// serverMsgId -> { socket, clientMsgId, timer }
const pending = new Map();

io.use((socket, next) => {
  if (socket.handshake.auth.secret === SECRET) return next();
  next(new Error("Unauthorized"));
});

io.on("connection", (socket) => {
  if (socket.handshake.auth.role === "mac-mini") {
    macMini = socket;
    console.log("Mac Mini connected");

    socket.on("response", (data) => {
      const entry = pending.get(data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(data.id);
      // Return clientMsgId so browser can match parallel in-flight responses
      entry.socket.emit("reply", { ...data, clientMsgId: entry.clientMsgId });
    });

    socket.on("disconnect", () => {
      macMini = null;
      console.log("Mac Mini disconnected");
      for (const [id, entry] of pending) {
        entry.socket.emit("reply", { text: "⚠️ Mac Mini disconnected", clientMsgId: entry.clientMsgId });
        clearTimeout(entry.timer);
      }
      pending.clear();
    });

  } else {
    socket.on("message", (data) => {
      if (!macMini) return socket.emit("reply", { text: "⚠️ Mac Mini offline", clientMsgId: data.clientMsgId });
      const serverMsgId = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        pending.delete(serverMsgId);
        socket.emit("reply", { text: "⏱ Timed out", clientMsgId: data.clientMsgId });
      }, 600_000);
      pending.set(serverMsgId, { socket, clientMsgId: data.clientMsgId, timer });
      macMini.emit("message", { ...data, id: serverMsgId });
    });
  }
});

app.use(express.static("public"));
server.listen(PORT, () => console.log(`Relay running on :${PORT}`));
