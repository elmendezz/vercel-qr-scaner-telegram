const TelegramBot = require('node-telegram-bot-api');
const Jimp = require('jimp');
const QrCode = require('qrcode-reader');
const axios = require('axios');

// Inicializamos el bot SIN polling
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);

// --- LÓGICA DEL BOT ---
// Definimos los listeners fuera de la función principal para no duplicarlos

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "¡Hola! Estoy vivo en Vercel. Envíame un QR.");
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Le decimos a Telegram que estamos "escribiendo" o "subiendo foto"
        // Nota: await aquí es opcional para no bloquear, pero útil.
        await bot.sendChatAction(chatId, 'upload_photo');

        // 1. Obtener link de descarga
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        const fileLink = await bot.getFileLink(photoId);

        // 2. Descargar buffer
        const response = await axios({
            method: 'get',
            url: fileLink,
            responseType: 'arraybuffer'
        });

        // 3. Procesar imagen con JIMP
        const image = await Jimp.read(response.data);

        // 4. Lector QR
        const qr = new QrCode();

        // Promisificamos el callback de qr.decode para que Vercel espere el resultado
        const scanQR = () => new Promise((resolve, reject) => {
            qr.callback = function(err, value) {
                if (err) reject(err);
                else resolve(value);
            };
            qr.decode(image.bitmap);
        });

        try {
            const value = await scanQR();
            if (value) {
                const respuesta = `✅ **¡Leído en la Nube!**\n\n` +
                                  `📝 **Contenido:** \`${value.result}\`\n` + 
                                  `🛡️ **Puntos:** ${value.points.length}`;
                await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
            } else {
                await bot.sendMessage(chatId, "❌ No encontré nada. Intenta recortar la imagen.");
            }
        } catch (qrErr) {
            console.log("Error QR interno:", qrErr);
            await bot.sendMessage(chatId, "❌ No pude decodificar este QR.");
        }

    } catch (error) {
        console.error("🔥 Error crítico:", error.message);
        await bot.sendMessage(chatId, `⚠️ Error: ${error.message}`);
    }
});

// --- MANEJADOR DE VERCEL (WEBHOOK) ---
module.exports = async (req, res) => {
    try {
        // Solo aceptamos POST (que es lo que envía Telegram)
        if (req.method === 'POST') {
            const { body } = req;
            
            // Procesamos la actualización
            if (body) {
                // processUpdate maneja los eventos definidos arriba (onText, on 'photo')
                bot.processUpdate(body);
            }
        }
        
        // Siempre respondemos 200 OK rápido a Telegram para que no reintente
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error en webhook:', error);
        res.status(500).send('Error');
    }
};
