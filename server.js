const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// CORS ayarlarıyla güvenli bağlantı
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// OYUN AYARLARI
const MAP_SIZE = { w: 1200, h: 900 };
const CLASSES = {
    sniper: { hp: 80, speed: 4, damage: 45, reload: 50, color: '#00ff00', range: 1000, bulletSpeed: 25 },
    tank:   { hp: 150, speed: 3, damage: 15, reload: 8, color: '#0099ff', range: 400, bulletSpeed: 12 },
    shotgun:{ hp: 110, speed: 5, damage: 12, reload: 30, color: '#ff0055', range: 300, bulletSpeed: 18 }
};

let players = {};
let bullets = [];

io.on('connection', (socket) => {
    console.log('Oyuncu bağlandı:', socket.id);

    // Başlangıçta oyuncuya sınıf seçtirmeden önce boş oluştur
    players[socket.id] = {
        x: Math.random() * MAP_SIZE.w,
        y: Math.random() * MAP_SIZE.h,
        classType: 'tank', // Varsayılan
        ...CLASSES.tank,
        score: 0,
        isDead: false,
        cooldown: 0
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

    socket.on('input', (data) => {
        const p = players[socket.id];
        if (!p || p.isDead) return;

        // Hareket Mantığı
        let dx = 0, dy = 0;
        if (data.keys.w) dy -= 1;
        if (data.keys.s) dy += 1;
        if (data.keys.a) dx -= 1;
        if (data.keys.d) dx += 1;

        // Dash (Shift)
        let currentSpeed = p.speed;
        if (data.keys.shift && p.cooldown <= 0) {
            currentSpeed *= 3; // Hızlı atılma
        }

        if (dx !== 0 || dy !== 0) {
            const dist = Math.hypot(dx, dy);
            p.x += (dx / dist) * currentSpeed;
            p.y += (dy / dist) * currentSpeed;
        }

        // Harita Sınırları
        p.x = Math.max(20, Math.min(MAP_SIZE.w - 20, p.x));
        p.y = Math.max(20, Math.min(MAP_SIZE.h - 20, p.y));

        // Ateş Etme (Cooldown yönetimi)
        if (p.cooldown > 0) p.cooldown--;
        
        if (data.mouse.down && p.cooldown <= 0) {
            p.cooldown = p.reload;
            
            if (p.classType === 'shotgun') {
                // Pompalı: 3 mermi saçar
                for(let i=-1; i<=1; i++){
                    spawnBullet(socket.id, p, data.angle + (i * 0.2));
                }
            } else {
                spawnBullet(socket.id, p, data.angle);
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

function spawnBullet(id, p, angle) {
    bullets.push({
        x: p.x, y: p.y,
        vx: Math.cos(angle) * p.bulletSpeed,
        vy: Math.sin(angle) * p.bulletSpeed,
        damage: p.damage,
        range: p.range,
        traveled: 0,
        owner: id
    });
}

// FİZİK MOTORU (60 FPS)
setInterval(() => {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.traveled += Math.hypot(b.vx, b.vy);

        // Menzil veya Sınır Kontrolü
        if (b.traveled > b.range || b.x < 0 || b.x > MAP_SIZE.w || b.y < 0 || b.y > MAP_SIZE.h) {
            bullets.splice(i, 1);
            continue;
        }

        // Çarpışma Kontrolü
        for (let id in players) {
            let p = players[id];
            if (b.owner !== id && !p.isDead) {
                const dist = Math.hypot(b.x - p.x, b.y - p.y);
                if (dist < 25) { // Vurulma
                    p.hp -= b.damage;
                    io.emit('hitEffect', {x: b.x, y: b.y, color: players[b.owner]?.color || '#fff'});
                    
                    if (p.hp <= 0) {
                        p.isDead = true;
                        p.hp = 0;
                        if (players[b.owner]) players[b.owner].score += 100;
                        io.emit('killFeed', { killer: players[b.owner]?.classType, victim: p.classType });
                        
                        // 3 Saniye sonra canlanma
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
server.listen(PORT, () => console.log(`Sunucu Aktif: ${PORT}`));
