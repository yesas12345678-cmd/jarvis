# 🏠 Guía de Despliegue de JUDE en VPS (24/7 con Telegram)

Esta guía te permite alojar a **Jude** en tu propio servidor VPS para que funcione **de forma continua las 24 horas del día**, incluso con tu ordenador personal apagado, y puedas hablar con él directamente desde **Telegram** en tu móvil o acceder a su interfaz web desde cualquier navegador.

---

## 📱 Paso 1: Crear tu Bot de Telegram (1 minuto)

1. Abre Telegram y busca a [**@BotFather**](https://t.me/BotFather).
2. Pulsa **Iniciar** y envía el comando:
   ```text
   /newbot
   ```
3. Elige un nombre para tu asistente (por ejemplo: `Jude Assistant`).
4. Elige un nombre de usuario que termine en `bot` (por ejemplo: `JudeVaitaBot`).
5. **@BotFather** te responderá con tu **Token de Acceso** (algo como `7891234567:AAFl...`). **Guarda este token.**

---

## 🔒 Paso 2: Obtener tu Telegram ID de Seguridad (10 segundos)

Para garantizar que **nadie más** que tú pueda darle órdenes a tu asistente:
1. En Telegram, abre una conversación con [**@userinfobot**](https://t.me/userinfobot).
2. Pulsa **Iniciar**.
3. El bot te mostrará tu `Id:` (un número, por ejemplo: `123456789`). **Guarda este número.**

---

## 🚀 Paso 3: Desplegar en tu Servidor VPS con Docker

Conéctate por SSH a tu servidor VPS y ejecuta los siguientes comandos:

### 1. Clonar el repositorio
```bash
git clone https://github.com/yesas12345678-cmd/jarvis.git
cd jarvis
```

### 2. Configurar las variables de entorno
Crea tu archivo `.env`:
```bash
nano .env
```
Pega y completa tus claves:
```env
GEMINI_API_KEY=tu_gemini_api_key_aqui
ELEVENLABS_API_KEY=tu_elevenlabs_api_key_aqui

# Telegram
TELEGRAM_BOT_TOKEN=tu_token_de_botfather_aqui
TELEGRAM_ALLOWED_USER_ID=tu_numero_de_telegram_id_aqui
```
*(Para guardar en nano: presiona `Ctrl + O`, `Enter` y luego `Ctrl + X`).*

### 3. Levantar Jude con Docker Compose
```bash
docker compose up -d --build
```

¡Listo! Docker descargará las dependencias, compilará Next.js y pondrá en marcha tanto el **servidor web** como el **bot de Telegram**.

---

## 💬 Cómo interactuar con Jude

### Por Telegram:
Abre la conversación con el bot que creaste en el Paso 1 y escribe `/start` o cualquier orden:
- *"Jude, ¿cuál es el estado de los sistemas?"*
- *"Jude, anota que mañana tengo reunión con el banco"*
- *"Jude, recuerda que mi comida favorita es la pasta"*
- `/notas` (para ver todas las notas guardadas)
- `/memoria` (para ver los datos permanentes que Jude recuerda sobre ti)
- `/limpiar` (para vaciar el contexto de la conversación actual)

### Por la Web:
Puedes acceder a la interfaz holográfica en tiempo real desde tu navegador entrando a:
```text
http://TU_IP_DEL_VPS:3001
```

---

## 🔄 Cómo actualizar Jude en el VPS en el futuro

Cada vez que hagamos mejoras en el código de Jude, solo necesitas conectarte a tu VPS y ejecutar:
```bash
cd jarvis
git pull origin main
docker compose up -d --build
```
*(Todos tus recuerdos, notas e historial se conservarán intactos gracias al volumen persistente `./data`).*
