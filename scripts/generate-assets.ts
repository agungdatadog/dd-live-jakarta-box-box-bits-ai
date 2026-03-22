import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

async function generateAssets() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error('No API key found. Please set GEMINI_API_KEY, NEXT_PUBLIC_GEMINI_API_KEY, or API_KEY.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const publicDir = path.join(process.cwd(), 'public');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const assets = [
    {
      filename: 'hero-bg.png',
      prompt: 'A cinematic, high-quality studio portrait of a cool dog wearing a purple high-tech racing suit, standing next to a futuristic F1 car. Datadog purple theme, 8k resolution, photorealistic, dramatic lighting.',
      aspectRatio: '16:9'
    },
    {
      filename: 'pitwall-bg.png',
      prompt: 'A futuristic F1 pitwall with glowing purple screens and data visualizations. Datadog theme, dark mode, high tech, cinematic lighting.',
      aspectRatio: '16:9'
    },
    {
      filename: 'quiz-bg.png',
      prompt: 'A high-speed F1 car racing through a neon-lit track with blue and purple glowing racing lines. Dynamic angle, motion blur, cinematic.',
      aspectRatio: '16:9'
    }
  ];

  for (const asset of assets) {
    console.log(`Generating ${asset.filename}...`);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: asset.prompt,
        config: { imageConfig: { aspectRatio: asset.aspectRatio } }
      });

      let base64 = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          base64 = part.inlineData.data;
          break;
        }
      }
      
      if (base64) {
        fs.writeFileSync(path.join(publicDir, asset.filename), Buffer.from(base64, 'base64'));
        console.log(`✅ Successfully generated and saved ${asset.filename}`);
      } else {
        console.error(`❌ Failed to generate ${asset.filename}: No image data returned. Response:`, JSON.stringify(response));
      }
    } catch (error: any) {
      console.error(`❌ Error generating ${asset.filename}:`, error.message);
    }
  }
}

generateAssets();
