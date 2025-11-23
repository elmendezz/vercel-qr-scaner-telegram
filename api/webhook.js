const TelegramBot = require('node-telegram-bot-api');
const Jimp = require('jimp');
const QrCode = require('qrcode-reader');
const axios = require('axios');

module.exports = async (req, res) => {
    // 1. Configuramos el bot dentro de la función para asegurar que tome el token fresco
    const token = process.env.TELEGRAM_TOKEN;
    
    // Si no hay token, fallamos controladamente
    if (!token) {
        console.error("❌ Token no encontrado");
        return res.status(500).send('Token missing');
    }

    const bot = new TelegramBot(token, { polling: false });

    try {
        // Solo procesamos POST
        if (req.method === 'POST') {
            const update = req.body;

            // Verificamos si es un mensaje
            if (update.message) {
                const chatId = update.message.chat.id;

                // CASO 1: Comando /start
                if (update.message.text === '/start') {
                    await bot.sendMessage(chatId, "👋 ¡Hola! Ahora sí estoy configurado correctamente. Envíame un QR.");
                }

                // CASO 2: Es una FOTO
                else if (update.message.photo) {
                    console.log(`📸 Procesando foto de ${chatId}...`);
                    
                    // Avisamos "escribiendo..." para ganar tiempo y paciencia del usuario
                    await bot.sendChatAction(chatId, 'upload_photo');

                    // --- LÓGICA QR ---
                    const photoId = update.message.photo[update.message.photo.length - 1].file_id;
                    const fileLink = await bot.getFileLink(photoId);

                    const response = await axios({
                        method: 'get',
                        url: fileLink,
                        responseType: 'arraybuffer'
                    });

                    const image = await Jimp.read(response.data);
                    
                    const qr = new QrCode();
                    const result = await new Promise((resolve) => {
                        qr.callback = (err, value) => resolve(value);
                        qr.decode(image.bitmap);
                    });

                    if (result) {
                        await bot.sendMessage(chatId, `✅ **QR DETECTADO:**\n\`${result.result}\``, { parse_mode: 'Markdown' });
                    } else {
                        await bot.sendMessage(chatId, "⚠️ No pude detectar un código QR en esa imagen.");
                    }
                }
                
                // CASO 3: Texto normal
                else if (update.message.text) {
                    await bot.sendMessage(chatId, "Envía una imagen con un código QR, por favor.");
                }
            }
        }
    } catch (error) {
        console.error("🔥 Error en el proceso:", error);
    }

    // 2. ¡IMPORTANTE! Enviamos el OK solo DESPUÉS de haber hecho todo el trabajo (await)
    // Esto mantiene el servidor vivo hasta que el mensaje se envía.
    res.status(200).send('OK');
};
