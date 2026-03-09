const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';

export async function generateRoom(imageBase64, stylePrompt) {
  const response = await fetch(REPLICATE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'adirik/interior-design',
      input: {
        image: `data:image/jpeg;base64,${imageBase64}`,
        prompt: stylePrompt,
        guidance_scale: 15,
        negative_prompt: 'lowres, watermark, banner, logo, extra digit, blurry',
        num_inference_steps: 50,
      },
    }),
  });

  const prediction = await response.json();
  if (prediction.error) {
    throw new Error(prediction.error);
  }

  return pollForResult(prediction.urls.get);
}

async function pollForResult(url, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (result.status === 'succeeded') {
      return result.output?.[0] || result.output;
    }

    if (result.status === 'failed') {
      throw new Error(result.error || 'Generation failed');
    }
  }

  throw new Error('Generation timed out');
}
