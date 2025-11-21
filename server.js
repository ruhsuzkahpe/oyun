const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- İŞTE EKSİK OLAN PARÇA BURASI ---
// Siteye girince direkt index.html dosyasını gönder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Eğer statik dosyalar (resim, css vs) varsa onları da sun
app.use(express.static(__dirname));

// --- OYUN KODLARI AŞAĞIDA ---

const MAP_SIZE = { w: 1500, h: 1500 };
const CLASSES = {
    tank:   { hp: 200, speed: 4, color: '#3399ff' },
    sniper: { hp: 90, speed: 5, color: '#00ff00' },
    assault:{ hp: 120, speed: 7, color: '#ff3333' }
};

let players = {};
let bullets = [];

io.on('connection', (socket) => {
    console.log('Oyuncu geldi:', socket.id);

    players[socket.id] = {
        x: Math.random() * 500,
        y: Math.random() * 500,
        classType: null,
        score: 0,
        hp: 100,
        isDead: false
    };

    socket.on('selectClass', (type) => {
        if (players[socket.id] && CLASSES[type]) {
            players[socket.id] = { 
                ...players[socket.id], 
                ...CLASSES[type], 
                classType: type, 
                hp: CLASSES[type].hp 
            };
            socket.emit('classSelected');
        }
    });

    socket.on('mobileInput', (data) => {
        const p = players[socket.id];
        if (!p || !p.classType || p.isDead) return;

        if (data.move.active) {
            p.x += data.move.x * p.speed;
            p.y += data.move.y * p.speed;
            p.x = Math.max(0, Math.min(MAP_SIZE.w, p.x));
            p.y = Math.max(0, Math.min(MAP_SIZE.h, p.y));
        }

        if (data.shoot.active) {
            if(Math.random() > 0.85) { 
                 bullets.push({
                    x: p.x, y: p.y,
                    vx: Math.cos(data.shoot.angle) * 15,
                    vy: Math.sin(data.shoot.angle) * 15,
                    life: 80
                });
            }
        }
    });

    socket.on('disconnect', () => delete players[socket.id]);
});

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
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda hazır!`));
