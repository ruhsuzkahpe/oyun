const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Tüm bağlantılara izin ver
});

app.use(express.static(path.join(__dirname, 'public')));

// MOBİL OYUN AYARLARI
const MAP_SIZE = { w: 1500, h: 1500 };
const CLASSES = {
    tank:   { hp: 200, speed: 4, damage: 20, color: '#3399ff' },
    sniper: { hp: 90, speed: 5, damage: 60, color: '#00ff00' },
    assault:{ hp: 120, speed: 7, damage: 15, color: '#ff3333' }
};

let players = {};
let bullets = [];

io.on('connection', (socket) => {
    console.log('Biri bağlandı:', socket.id);

    // Oyuncuyu önce 'izleyici' gibi başlat
    players[socket.id] = {
        x: Math.random() * 500,
        y: Math.random() * 500,
        classType: null, // Henüz seçmedi
        score: 0,
        hp: 100,
        isDead: false,
        angle: 0
    };

    // İŞTE BURASI: Butona basınca burası çalışacak
    socket.on('selectClass', (type) => {
        console.log(socket.id + ' sınıf seçti: ' + type);
        if (players[socket.id] && CLASSES[type]) {
            players[socket.id] = { 
                ...players[socket.id], 
                ...CLASSES[type], 
                classType: type, 
                hp: CLASSES[type].hp 
            };
            // Onay mesajı gönderelim ki ekran kapansın
            socket.emit('classSelected');
        }
    });

    socket.on('mobileInput', (data) => {
        const p = players[socket.id];
        if (!p || !p.classType || p.isDead) return; // Sınıf seçmediyse hareket edemez

        if (data.move.active) {
            p.x += data.move.x * p.speed;
            p.y += data.move.y * p.speed;
            // Harita sınırı
            p.x = Math.max(0, Math.min(MAP_SIZE.w, p.x));
            p.y = Math.max(0, Math.min(MAP_SIZE.h, p.y));
        }

        if (data.shoot.active) {
            // Basit ateşleme mantığı (Hızlı çözüm için)
            if(Math.random() > 0.8) { // Mermi sınırlaması
                 bullets.push({
                    x: p.x, y: p.y,
                    vx: Math.cos(data.shoot.angle) * 15,
                    vy: Math.sin(data.shoot.angle) * 15,
                    owner: socket.id,
                    life: 100
                });
            }
        }
    });

    socket.on('disconnect', () => delete players[socket.id]);
});

// Basit Fizik Döngüsü
setInterval(() => {
    bullets.forEach((b, i) => {
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        if(b.life <= 0) bullets.splice(i, 1);
    });
    io.emit('state', { players, bullets });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu Hazır: ${PORT}`));
