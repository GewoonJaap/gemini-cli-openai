#!/usr/bin/env node

/**
 * Example script demonstrating image support with the Gemini CLI OpenAI Worker
 * 
 * Usage: node image-example.js [image-file-path]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const WORKER_URL = 'https://gemini-cli-worker.gewoonjaap.workers.dev/v1';
const API_KEY = 'sk-your-secret-api-key-here'; // Replace with your API key if authentication is enabled

async function encodeImageToBase64(imagePath) {
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();
        
        let mimeType;
        switch (ext) {
            case '.jpg':
            case '.jpeg':
                mimeType = 'image/jpeg';
                break;
            case '.png':
                mimeType = 'image/png';
                break;
            case '.gif':
                mimeType = 'image/gif';
                break;
            case '.webp':
                mimeType = 'image/webp';
                break;
            default:
                mimeType = 'image/jpeg';
        }
        
        return `data:${mimeType};base64,${base64Image}`;
    } catch (error) {
        throw new Error(`Failed to encode image: ${error.message}`);
    }
}

async function testImageWithGemini(imageDataUrl, question = "What do you see in this image?") {
    const requestBody = {
        model: "gemini-2.5-flash",
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: question
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: imageDataUrl
                        }
                    }
                ]
            }
        ]
    };

    try {
        console.log('🤖 Sending image to Gemini...');
        
        const response = await fetch(`${WORKER_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        console.log('🎯 Gemini\'s response:');
        console.log('─'.repeat(50));
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices?.[0]?.delta?.content;
                        if (content) {
                            process.stdout.write(content);
                        }
                    } catch (e) {
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }
        }
        
        console.log('\n' + '─'.repeat(50));
        console.log('✅ Image analysis completed!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

async function main() {
    const imagePath = process.argv[2];
    
    if (!imagePath) {
        console.log('📖 Usage: node image-example.js [image-file-path]');
        console.log('📖 Example: node image-example.js ./my-image.jpg');
        return;
    }
    
    if (!fs.existsSync(imagePath)) {
        console.error('❌ Error: Image file not found:', imagePath);
        return;
    }
    
    try {
        console.log('🖼️  Processing image:', imagePath);
        const imageDataUrl = await encodeImageToBase64(imagePath);
        
        // Test with different questions
        const questions = [
            "What do you see in this image?",
            "Describe this image in detail.",
            "What are the main colors in this image?",
            "Is there any text visible in this image?"
        ];
        
        for (let i = 0; i < questions.length; i++) {
            console.log(`\n🔍 Question ${i + 1}: ${questions[i]}`);
            await testImageWithGemini(imageDataUrl, questions[i]);
            
            if (i < questions.length - 1) {
                console.log('\n⏳ Waiting 2 seconds before next question...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = { encodeImageToBase64, testImageWithGemini };
