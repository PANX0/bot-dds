require('dotenv').config();
const http = require('http');
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ── Servidor Express (keep-alive) ────────────────────────────────
const app = express();
app.use(express.static('public'));
app.get('/', (req, res) => {
  try { res.sendFile(__dirname + '/views/index.html'); }
  catch { res.sendStatus(200); }
});
app.listen(process.env.PORT || 3000, () => console.log('✅ Servidor web activo'));

setInterval(() => {
  if (process.env.PROJECT_DOMAIN) {
    http.get(`http://${process.env.PROJECT_DOMAIN}.glitch.me/`);
  }
}, 280000);

// ── Configuración ────────────────────────────────────────────────
const ALERT_CHANNEL_ID = '808491801508839509';

// Hora del boss semanal en UTC (Sábado 21:30 CLT = Chile UTC-3 → Domingo 00:30 UTC)
const BOSS_UTC_DAY    = 0;   // 0 = Domingo UTC (= Sábado noche Chile)
const BOSS_UTC_HOUR   = 0;
const BOSS_UTC_MINUTE = 30;

// Alertas: minutos antes del boss
const ALERTS_BEFORE = [20, 10, 5];

// ── Cliente Discord ──────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// ── Helpers de tiempo ────────────────────────────────────────────

/**
 * Devuelve el Unix timestamp (segundos) del próximo Sábado 21:30 CLT.
 * Para Chile (UTC-3): 21:30 CLT = Domingo 00:30 UTC.
 */
function getNextBossTimestamp() {
  const now = new Date();
  // Buscar el próximo domingo UTC 00:30
  const target = new Date(now);
  target.setUTCHours(BOSS_UTC_HOUR, BOSS_UTC_MINUTE, 0, 0);

  const daysUntil = (BOSS_UTC_DAY - now.getUTCDay() + 7) % 7;
  target.setUTCDate(now.getUTCDate() + (daysUntil === 0 && now > target ? 7 : daysUntil));

  return Math.floor(target.getTime() / 1000);
}

// ── Sistema de alertas automáticas ──────────────────────────────
const alertaEnviada = new Set();

setInterval(async () => {
  if (!client.isReady()) return;

  const now = new Date();
  const utcDay  = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const utcMin  = now.getUTCMinutes();

  // Semana actual como clave para no repetir alertas
  const weekKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${Math.floor(now.getUTCDate() / 7)}`;

  for (const minBefore of ALERTS_BEFORE) {
    // Calcular a qué hora UTC debe salir esta alerta
    const alertTotalMin = BOSS_UTC_HOUR * 60 + BOSS_UTC_MINUTE - minBefore;
    const alertHour = Math.floor(((alertTotalMin % 1440) + 1440) % 1440 / 60);
    const alertMin  = ((alertTotalMin % 60) + 60) % 60;
    // Si la alerta cae en día anterior ajustamos
    const alertDay  = alertTotalMin < 0 ? (BOSS_UTC_DAY + 6) % 7 : BOSS_UTC_DAY;

    const key = `${weekKey}-${minBefore}`;

    if (
      utcDay  === alertDay  &&
      utcHour === alertHour &&
      utcMin  === alertMin  &&
      !alertaEnviada.has(key)
    ) {
      alertaEnviada.add(key);
      await enviarAlerta(minBefore);
    }
  }
}, 30_000); // revisar cada 30 segundos

async function enviarAlerta(minBefore) {
  try {
    const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
    const bossTs  = getNextBossTimestamp();

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('⚔️ ¡Boss Semanal se acerca!')
      .setDescription(`El boss aparece <t:${bossTs}:R> (<t:${bossTs}:t>)`)
      .addFields({ name: '⏰ Tiempo restante', value: `**${minBefore} minutos**` })
      .setFooter({ text: 'Black Desert Online • Boss Semanal' })
      .setTimestamp();

    await channel.send({ content: '@everyone', embeds: [embed] });
    console.log(`🔔 Alerta enviada: ${minBefore} minutos antes`);
  } catch (err) {
    console.error('Error enviando alerta:', err.message);
  }
}

// ── Eventos del bot ──────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'Black Desert Online', type: 0 }],
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ── !ping ────────────────────────────────────────────────────
  if (message.content.toLowerCase() === '!ping') {
    const ping = Math.round(client.ws.ping);
    await message.reply(`🏓 \`${ping}ms\` desde BDO.`);
    return;
  }

  // ── !boss ────────────────────────────────────────────────────
  if (message.content.toLowerCase() === '!boss') {
    const bossTs = getNextBossTimestamp();

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🐉 Boss Semanal — Sábado 21:30')
      .setDescription(
        `> El próximo boss aparece el <t:${bossTs}:F>\n` +
        `> Faltan: **<t:${bossTs}:R>**`
      )
      .addFields(
        { name: '📢 Alertas automáticas', value: '20 min · 10 min · 5 min antes', inline: true },
        { name: '📍 Canal', value: `<#${ALERT_CHANNEL_ID}>`, inline: true }
      )
      .setFooter({ text: 'Black Desert Online' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // ── !test (solo para pruebas, eliminar luego) ────────────────
  if (message.content.toLowerCase() === '!test') {
    await message.reply('✅ Bot funcionando correctamente.');
    await enviarAlerta(20); // simula alerta de 20 min
    return;
  }
});

// ── Login ────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
