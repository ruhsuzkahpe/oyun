const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// HARİTA VE SINIF AYARLARI
const MAP_SIZE = { w: 1500, h: 1500 };
const CLASSES = {
    tank:   { hp: 200, speed: 4, damage: 15, reload: 10, color: '#3399ff', range: 400, bulletSpeed: 12 },
    sniper: { hp: 90, speed: 5, damage: 50, reload: 50, color: '#00ff00', range: 1100, bulletSpeed: 28 },
    assault:{ hp: 120, speed: 7, damage: 10, reload: 5, color: '#ff3333', range: 500, bulletSpeed: 18 }
};

let players = {};
let bullets = [];

io.on('connection', (socket) => {
    console.log('Mobil Savaşçı:', socket.id);

    players[socket.id] = {
        x: Math.random() * MAP_SIZE.w,
        y: Math.random() * MAP_SIZE.h,
        classType: 'assault',
        ...CLASSES.assault,
        score: 0,
        isDead: false,
        cooldown: 0,
        angle: 0
    };

    socket.on('selectClass', (type) => {
        if (players[socket.id] && CLASSES[type]) {
            const oldScore = players[socket.id].score;
            players[socket.id] = { 
                ...players[socket.id], 
                ...CLASSES[type], 
                classType: type,
                hp: CLASSES[type].hp,
                score: oldScore
            };
        }
    });

    // MOBİL GİRİŞ (JOYSTICK VERİSİ)
    socket.on('mobileInput', (data) => {
        const p = players[socket.id];
        if (!p || p.isDead) return;

        // Hareket (Joystick Vektörü)
        if (data.move.active) {
            p.x += data.move.x * p.speed;
            p.y += data.move.y * p.speed;
        }

        // Sınırlar
        p.x = Math.max(20, Math.min(MAP_SIZE.w - 20, p.x));
        p.y = Math.max(20, Math.min(MAP_SIZE.h - 20, p.y));

        // Ateş Etme (Sağ Joystick)
        if (p.cooldown > 0) p.cooldown--;

        if (data.shoot.active && p.cooldown <= 0) {
            p.angle = data.shoot.angle; // Oyuncunun yönünü güncelle
            p.cooldown = p.reload;
            
            bullets.push({
                x: p.x, y: p.y,
                vx: Math.cos(p.angle) * p.bulletSpeed,
                vy: Math.sin(p.angle) * p.bulletSpeed,
                damage: p.damage,
                range: p.range,
                traveled: 0,
                owner: socket.id
            });
        }
    });

    socket.on('disconnect', () => delete players[socket.id]);
});

// FİZİK MOTORU
setInterval(() => {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.traveled += Math.hypot(b.vx, b.vy);

        if (b.traveled > b.range || b.x < 0 || b.x > MAP_SIZE.w || b.y < 0 || b.y > MAP_SIZE.h) {
            bullets.splice(i, 1);
            continue;
        }

        for (let id in players) {
            let p = players[id];
            if (b.owner !== id && !p.isDead) {
                if (Math.hypot(b.x - p.x, b.y - p.y) < 30) { // Vurulma Alanı
                    p.hp -= b.damage;
                    io.emit('hitEffect', {x: b.x, y: b.y, color: '#fff'});
                    
                    if (p.hp <= 0) {
                        p.isDead = true;
                        if (players[b.owner]) players[b.owner].score += 100;
                        setTimeout(() => {
                            if (players[id]) {
                                players[id].isDead = false;
                                players[id].hp = CLASSES[players[id].classType].hp;
                                players[id].x = Math.random() * MAP_SIZE.w;
                                players[id].y = Math.random() * MAP_SIZE.h;
                            }
                        }, 3000);
                    }
                    bullets.splice(i, 1);
                    break;
                }
            }
        }
    }
    io.emit('state', { players, bullets });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Mobil Sunucu ${PORT} portunda!`));
