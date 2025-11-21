const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*", // Her yerden gelen bağlantıya izin ver
    methods: ["GET", "POST"]
  }
});

let sayac = 0;

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı!");
  
  // Bağlanana mevcut skoru gönder
  socket.emit("skorGuncelle", sayac);

  socket.on("tiklandi", () => {
    sayac++;
    io.emit("skorGuncelle", sayac);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: ${PORT}`);
});
