const TelegramBot = require('node-telegram-bot-api');
const Jimp = require('jimp');
const QrCodeReader = require('qrcode-reader');
const QRCodeGenerator = require('qrcode'); // Librería nueva para crear
const axios = require('axios');

// --- FUNCIONES DE AYUDA ---

// Detectar tipo de contenido
function detectType(text) {
    if (/^http(s)?:\/\//i.test(text)) return '🔗 Enlace Web (URL)';
    if (/^WIFI:/i.test(text)) return '📶 Configuración WiFi';
    if (/^mailto:/i.test(text)) return '📧 Correo Electrónico';
    if (/^tel:/i.test(text)) return '📞 Número de Teléfono';
    if (/^smsto:/i.test(text)) return '💬 SMS';
    if (/^geo:/i.test(text)) return '📍 Coordenadas GPS';
    if (/^BEGIN:VCARD/i.test(text)) return 'bust_in_silhouette Contacto (VCard)';
    return '📝 Texto Plano';
}

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_TOKEN;
    if (!token) return res.status(500).send('Token missing');

    const bot = new TelegramBot(token, { polling: false });

    try {
        if (req.method === 'POST' && req.body) {
            const update = req.body;

            // Verificamos si es un mensaje o un callback (si agregamos botones después)
            if (update.message) {
                const chatId = update.message.chat.id;
                const text = update.message.text;

                // --- 1. COMANDO START ---
                if (text === '/start') {
                    const welcomeMsg = 
                        `👋 **¡Bienvenido al Bot QR 2.0!**\n\n` +
                        `📸 **Escanear:** Envíame una foto de un QR.\n` +
                        `⚙️ **Crear:** Escribe \`/qr mensaje\` para crear uno.\n\n` +
                        `Ejemplo: \`/qr Hola Mundo\``;
                    await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
                }

                // --- 2. COMANDO CREAR QR (/qr texto) ---
                else if (text && text.startsWith('/qr')) {
                    const content = text.replace('/qr', '').trim();

                    if (!content) {
                        await bot.sendMessage(chatId, "⚠️ Escribe algo después del comando.\nEjemplo: `/qr https://google.com`", { parse_mode: 'Markdown' });
                    } else {
                        await bot.sendChatAction(chatId, 'upload_photo');
                        
                        // Generamos el QR en un Buffer (memoria)
                        // Configuración: Margen 4, Corrección de error Alta (H) para que sea robusto
                        const buffer = await QRCodeGenerator.toBuffer(content, {
                            errorCorrectionLevel: 'H',
                            margin: 2,
                            width: 500,
                            color: {
                                dark: '#000000',  // Puntos negros
                                light: '#ffffff'  // Fondo blanco
                            }
                        });

                        await bot.sendPhoto(chatId, buffer, {
                            caption: `✅ **QR Creado**\n\n📄 Contenido: \`${content}\`\n🛡️ Nivel de Error: Alto (H)`,
                            parse_mode: 'Markdown'
                        });
                    }
                }

                // --- 3. ESCANEAR FOTO ---
                else if (update.message.photo) {
                    console.log(`📸 Procesando foto de ${chatId}...`);
                    await bot.sendChatAction(chatId, 'typing'); // Typing mientras pensamos

                    // Obtener link y descargar
                    const photoId = update.message.photo[update.message.photo.length - 1].file_id;
                    const fileLink = await bot.getFileLink(photoId);

                    const response = await axios({ method: 'get', url: fileLink, responseType: 'arraybuffer' });
                    const image = await Jimp.read(response.data);
                    
                    const qr = new QrCodeReader();
                    
                    const result = await new Promise((resolve) => {
                        qr.callback = (err, value) => resolve(value);
                        qr.decode(image.bitmap);
                    });

                    if (result) {
                        const type = detectType(result.result);
                        const points = result.points.length; // Puntos de referencia encontrados
                        
                        const responseMsg = 
                            `✅ **QR DETECTADO**\n` +
                            `──────────────────\n` +
                            `📁 **Tipo:** ${type}\n` +
                            `📏 **Dimensiones:** ${image.bitmap.width}x${image.bitmap.height}px\n` +
                            `🔍 **Puntos de Control:** ${points}\n` +
                            `──────────────────\n` +
                            `📝 **CONTENIDO:**\n\`${result.result}\``;

                        await bot.sendMessage(chatId, responseMsg, { parse_mode: 'Markdown' });
                    } else {
                        await bot.sendMessage(chatId, "⚠️ No pude detectar un código QR claro. Intenta recortar la imagen.");
                    }
                }
                
                // Mensaje por defecto si escribe texto sin comando
                else if (text && !text.startsWith('/')) {
                    await bot.sendMessage(chatId, "Para crear un QR usa: `/qr tu texto`", { parse_mode: 'Markdown' });
                }
            }
        }
    } catch (error) {
        console.error("🔥 Error:", error);
    }

    // Respuesta final para cerrar conexión con Telegram
    res.status(200).send('OK');
};
