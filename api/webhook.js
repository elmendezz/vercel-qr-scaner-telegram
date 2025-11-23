const TelegramBot = require('node-telegram-bot-api');
const Jimp = require('jimp');
const QrCode = require('qrcode-reader');
const axios = require('axios');

// En Vercel NO usamos dotenv, tomamos la variable directa del sistema
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token); // Sin polling: true

module.exports = async (req, res) => {
    // 1. Respuesta inmediata a Telegram para evitar bucles
    // Si no respondemos rápido, Telegram reenvía el mensaje infinitamente
    res.status(200).send('OK');

    try {
        // Solo procesamos si es un POST y tiene cuerpo
        if (req.method === 'POST' && req.body) {
            
            const update = req.body;

            // --- COMANDOS BÁSICOS ---
            if (update.message && update.message.text === '/start') {
                await bot.sendMessage(update.message.chat.id, "¡Hola! Estoy listo en Vercel. Envíame un QR.");
                return;
            }

            // --- PROCESAR FOTO ---
            if (update.message && update.message.photo) {
                const chatId = update.message.chat.id;
                console.log(`📥 Recibiendo imagen de chat ${chatId}...`);

                // Avisamos al usuario que estamos trabajando
                await bot.sendChatAction(chatId, 'upload_photo');

                // 1. Obtener link
                const photoId = update.message.photo[update.message.photo.length - 1].file_id;
                const fileLink = await bot.getFileLink(photoId);

                // 2. Descargar
                const response = await axios({
                    method: 'get',
                    url: fileLink,
                    responseType: 'arraybuffer'
                });

                // 3. Leer con JIMP
                const image = await Jimp.read(response.data);

                // 4. Escanear QR
                const qr = new QrCode();
                
                // Promesa manual para esperar al callback
                const value = await new Promise((resolve, reject) => {
                    qr.callback = (err, v) => err ? reject(err) : resolve(v);
                    qr.decode(image.bitmap);
                });

                if (value) {
                    console.log("✅ QR Encontrado:", value.result);
                    await bot.sendMessage(chatId, `✅ **QR Leído:**\n\`${value.result}\``, { parse_mode: 'Markdown' });
                } else {
                    await bot.sendMessage(chatId, "❌ No pude leer el QR. Intenta recortar la imagen.");
                }
            }
        }
    } catch (error) {
        console.error("Error en webhook:", error.message);
        // No enviamos error al usuario siempre para no saturar, solo logueamos
    }
};
