import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    if (data.models) {
      console.log("All available models containing 'gemini':");
      data.models.forEach(m => {
        if (m.name.includes('gemini')) {
          console.log(`- ${m.name}`);
        }
      });
    } else {
      console.log("No models returned:", data);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
