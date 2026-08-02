import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { exec } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Verify API keys
if (!process.env.GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY is not defined in .env');
}
if (!process.env.ELEVENLABS_API_KEY) {
  console.warn('WARNING: ELEVENLABS_API_KEY is not defined in .env');
}

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ 
  model: 'gemini-3.5-flash',
  generationConfig: { responseMimeType: "application/json" }
});

// Helper to calculate CPU usage in Node.js
function getCPUUsage() {
  return new Promise((resolve) => {
    const startStats = os.cpus().map(cpu => cpu.times);
    setTimeout(() => {
      const endStats = os.cpus().map(cpu => cpu.times);
      let totalDiff = 0;
      let idleDiff = 0;
      for (let i = 0; i < startStats.length; i++) {
        const start = startStats[i];
        const end = endStats[i];
        const startTotal = Object.values(start).reduce((a, b) => a + b, 0);
        const endTotal = Object.values(end).reduce((a, b) => a + b, 0);
        totalDiff += endTotal - startTotal;
        idleDiff += end.idle - start.idle;
      }
      const usage = totalDiff > 0 ? (1 - idleDiff / totalDiff) * 100 : 0;
      resolve(Math.round(usage));
    }, 100);
  });
}

// Endpoint: System Stats (CPU, RAM, OS info)
app.get('/api/stats', async (req, res) => {
  try {
    const cpu = await getCPUUsage();
    
    // RAM Calculation
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = Math.round((usedMem / totalMem) * 100);
    
    // Platform info
    const platform = os.platform();
    const uptime = os.uptime(); // in seconds
    
    res.json({
      cpu,
      ram: ramPercent,
      ramUsedGB: (usedMem / (1024 ** 3)).toFixed(1),
      ramTotalGB: (totalMem / (1024 ** 3)).toFixed(1),
      platform,
      uptime
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve system statistics.' });
  }
});

// Helper to execute system action
function executeSystemAction(action) {
  if (!action || !action.type) return;
  const { type, param } = action;
  console.log(`Executing system action: ${type} with parameter: ${param}`);

  switch (type) {
    case 'open_app':
      if (param === 'calculator') {
        exec('calc');
      } else if (param === 'notepad') {
        exec('notepad');
      } else if (param === 'browser') {
        exec('start "" "https://www.google.com"');
      } else if (param === 'explorer') {
        exec('explorer');
      } else if (param) {
        const sanitizedParam = param.replace(/[^a-zA-Z0-9-_\s.]/g, '');
        console.log(`Searching and launching custom app: "${sanitizedParam}"`);
        exec(`powershell -ExecutionPolicy Bypass -File open-app.ps1 -AppName "${sanitizedParam}"`, (err, stdout, stderr) => {
          if (err) {
            console.error(`Failed fuzzy search launch for "${sanitizedParam}":`, stderr || err);
          } else {
            console.log(`Fuzzy launch stdout:`, stdout.trim());
          }
        });
      }
      break;
    case 'open_url':
      if (param) {
        // Sanitize URL to avoid command injections
        let url = param.trim();
        if (!/^https?:\/\//i.test(url)) {
          url = 'https://' + url;
        }
        // Basic check to see if it looks like a valid url
        if (/^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(url)) {
          exec(`start "" "${url}"`);
        }
      }
      break;
    case 'open_folder':
      if (param === 'downloads') {
        exec('explorer shell:Downloads');
      } else if (param === 'projects') {
        exec('explorer c:\\PROYECTOS');
      }
      break;
    case 'volume_up':
      exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"');
      break;
    case 'volume_down':
      exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"');
      break;
    case 'mute':
      exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
      break;
    case 'stop':
      console.log('Stop action triggered. Moving JARVIS window back to Jarvis desktop...');
      exec('powershell -ExecutionPolicy Bypass -File move-to-jarvis-desktop.ps1');
      break;
    default:
      console.warn(`Action type ${type} is not supported.`);
  }
}

// Endpoint: Process user voice or text command
app.post('/api/voice-command', async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command prompt is required.' });
  }

  console.log(`Received command: "${command}"`);

  // Prompt configuration for J.A.R.V.I.S.
  const systemPrompt = `
You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the advanced and loyal AI assistant from Iron Man.
Always address the user as 'Señor' and speak with modern British formality, elegance, and extreme efficiency.
Keep your spoken responses short, direct, and conversational. Avoid markdown characters (like asterisks, bold font, lists, emojis, etc.) as this response is going to be played via Text-To-Speech.

You MUST respond strictly in JSON format with the following keys:
1. 'reply': A string containing your spoken response in Spanish.
2. 'action': An object representing a local system command to run, or null if no command is needed.

Supported Actions:
- {"type": "open_app", "param": "app_name"} -> Open any app by name (e.g., calculator, notepad, spotify, discord, steam, sky launcher, chrome)
- {"type": "open_url", "param": "domain_or_url"} -> Open a website (e.g. youtube.com, google.com)
- {"type": "open_folder", "param": "downloads"} -> Open Downloads folder
- {"type": "open_folder", "param": "projects"} -> Open c:\\PROYECTOS folder
- {"type": "volume_up", "param": null} -> Increase system volume
- {"type": "volume_down", "param": null} -> Decrease system volume
- {"type": "mute", "param": null} -> Mute/unmute volume
- {"type": "stop", "param": null} -> Turn off, exit fullscreen, and put JARVIS in standby mode (triggered by stop, standby, apágate, detente)

Example JSON response:
{
  "reply": "De inmediato, señor. Iniciando el navegador web.",
  "action": {
    "type": "open_app",
    "param": "browser"
  }
}
`;

  try {
    // Call Gemini Model
    const chatSession = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }]
        },
        {
          role: 'model',
          parts: [{ text: JSON.stringify({ reply: "Sistemas en línea. A su servicio, señor.", action: null }) }]
        }
      ]
    });

    const responseResult = await chatSession.sendMessage(command);
    const textResponse = responseResult.response.text();
    
    let parsedResponse;
    try {
      let cleanText = textResponse.trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      // Fix malformed JSON where parameter value is blank before a closing bracket or comma
      cleanText = cleanText.replace(/:\s*([,}])/g, ':null$1');
      parsedResponse = JSON.parse(cleanText.trim());
    } catch (e) {
      console.error('Failed to parse JSON response from Gemini:', textResponse);
      // Try to extract only the actual reply text using regex to avoid leaking JSON keys to the user
      const replyMatch = textResponse.match(/"?reply"?\s*:\s*"([\s\S]*?)"/i);
      const extractedReply = replyMatch ? replyMatch[1] : textResponse.replace(/[{}\n\r"]/g, '').trim();
      
      parsedResponse = {
        reply: extractedReply,
        action: null
      };
    }

    console.log(`JARVIS Response: "${parsedResponse.reply}"`);
    console.log(`JARVIS Action:`, parsedResponse.action);

    // Execute the action if it exists
    if (parsedResponse.action) {
      executeSystemAction(parsedResponse.action);
    }

    // Call ElevenLabs for TTS
    let audioBase64 = null;
    if (process.env.ELEVENLABS_API_KEY && parsedResponse.reply) {
      try {
        // Antoni voice ID is ErXwobaYiN019PkySvjV (refined, good quality)
        // Alternatively, Rachel is 21m00Tcm4TlvDq8ikWAM, Adam is pNInz6obpgq9S3JmKWzz
        const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; 
        const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

        const ttsResponse = await fetch(elevenLabsUrl, {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: parsedResponse.reply,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.75,
              similarity_boost: 0.75
            }
          })
        });

        if (ttsResponse.ok) {
          const arrayBuffer = await ttsResponse.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuffer).toString('base64');
        } else {
          const errText = await ttsResponse.text();
          console.error(`ElevenLabs error: ${ttsResponse.status} - ${errText}`);
        }
      } catch (ttsErr) {
        console.error('Failed to synthesize speech via ElevenLabs:', ttsErr);
      }
    }

    res.json({
      reply: parsedResponse.reply,
      action: parsedResponse.action,
      audio: audioBase64
    });

  } catch (error) {
    console.error('Error handling voice command:', error);
    res.status(500).json({ error: 'Hubo un inconveniente al procesar la petición, señor.' });
  }
});

app.post('/api/double-clap', (req, res) => {
  console.log('Double clap event received from client. Moving window to current desktop and toggling fullscreen...');
  exec('powershell -ExecutionPolicy Bypass -File move-to-current-desktop.ps1', (err) => {
    if (err) {
      console.error('Failed to move window to current desktop:', err);
    }
    const psScript = `
      $wshell = New-Object -ComObject WScript.Shell;
      if ($wshell.AppActivate('J.A.R.V.I.S. - Stark Industries OS')) {
        Start-Sleep -m 100
        $wshell.SendKeys('{F11}')
      }
    `;
    exec(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`);
  });
  res.json({ success: true });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`J.A.R.V.I.S. Server running at: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
