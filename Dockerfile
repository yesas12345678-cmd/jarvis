FROM node:22-alpine AS runner

WORKDIR /app

# Instalar dependencias necesarias para compilación de ciertas librerías si se requieren
RUN apk add --no-cache libc6-compat

# Copiar manifiestos de paquetes
COPY package*.json ./

# Instalar dependencias limpias
RUN npm install

# Copiar el resto del código del asistente
COPY . .

# Desactivar telemetría de Next.js durante build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3001

# Compilar aplicación Next.js
RUN npm run build

# Crear directorio persistente para notas y memorias
RUN mkdir -p /app/data

# Exponer puerto 3001 para la interfaz holográfica web
EXPOSE 3001

# Arrancar Next.js + Bot de Telegram en paralelo
CMD ["node", "scripts/entrypoint.mjs"]
