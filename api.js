// API Test Program
// This script tests both Azure OpenAI and Google Translation APIs
// to verify your API keys are working correctly

require('dotenv').config();
const axios = require('axios');

// Get API keys from environment variables
const GOOGLE_TRANSLATION_API_KEY = process.env.GOOGLE_TRANSLATION_API_KEY;
const AZURE_AI_API_KEY = process.env.AZURE_AI_API_KEY;
const AZURE_AI_ENDPOINT = process.env.AZURE_AI_ENDPOINT || 'https://gendem.cognitiveservices.azure.com/';

console.log('=== API Key Status ===');
console.log('Google Translation API Key:', GOOGLE_TRANSLATION_API_KEY ? 'Present' : 'Missing');
console.log('Azure AI API Key:', AZURE_AI_API_KEY ? 'Present' : 'Missing');
console.log('Azure AI Endpoint:', AZURE_AI_ENDPOINT);
console.log('=====================\n');

// Enhanced error logging function
function logApiError(error, apiName) {
    console.error(`❌ ${apiName} test failed:`);
    
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error(`   Status: ${error.response.status} (${error.response.statusText})`);
        console.error('   Headers:', JSON.stringify(error.response.headers, null, 2));
        
        if (error.response.data) {
            if (typeof error.response.data === 'object') {
                if (error.response.data.error) {
                    if (typeof error.response.data.error === 'object') {
                        console.error('   Error Details:');
                        console.error(`     Code: ${error.response.data.error.code || 'N/A'}`);
                        console.error(`     Message: ${error.response.data.error.message || 'N/A'}`);
                        
                        if (error.response.data.error.details) {
                            console.error('     Additional Details:');
                            console.error(JSON.stringify(error.response.data.error.details, null, 2));
                        }
                    } else {
                        console.error(`   Error: ${error.response.data.error}`);
                    }
                } else {
                    console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
                }
            } else {
                console.error(`   Response Data: ${error.response.data}`);
            }
        }
    } else if (error.request) {
        // The request was made but no response was received
        console.error('   No response received from server');
        console.error('   Request details:', error.request._currentUrl || error.request.path || 'N/A');
    } else {
        // Something happened in setting up the request that triggered an Error
        console.error(`   Error Message: ${error.message}`);
    }
    
    if (error.config) {
        console.error('   Request Configuration:');
        console.error(`     URL: ${error.config.url}`);
        console.error(`     Method: ${error.config.method.toUpperCase()}`);
        console.error(`     Headers: ${JSON.stringify(error.config.headers, null, 2)}`);
        
        if (error.config.data) {
            try {
                const data = JSON.parse(error.config.data);
                console.error(`     Data: ${JSON.stringify(data, null, 2)}`);
            } catch (e) {
                console.error(`     Data: ${error.config.data}`);
            }
        }
    }
    
    console.error('   Stack Trace:', error.stack);
}

// Test Google Translation API
async function testGoogleTranslationAPI() {
    console.log('Testing Google Translation API...');
    
    if (!GOOGLE_TRANSLATION_API_KEY) {
        console.error('❌ Google Translation API key is missing. Please add it to your .env file.');
        return false;
    }
    
    try {
        // Test language detection
        console.log('   Attempting language detection...');
        const detectUrl = `https://translation.googleapis.com/language/translate/v2/detect?key=${GOOGLE_TRANSLATION_API_KEY}`;
        const detectResponse = await axios.post(detectUrl, { q: 'Hello world' });
        
        if (detectResponse.data && detectResponse.data.data) {
            console.log('✅ Google Translation API (Detect) is working!');
            console.log('   Detected language:', detectResponse.data.data.detections[0][0].language);
            console.log('   Full response:', JSON.stringify(detectResponse.data, null, 2));
            
            // Test translation
            console.log('   Attempting translation...');
            const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATION_API_KEY}`;
            const translateResponse = await axios.post(translateUrl, {
                q: 'Hello world',
                source: 'en',
                target: 'es',
                format: 'text',
            });
            
            if (translateResponse.data && translateResponse.data.data) {
                console.log('✅ Google Translation API (Translate) is working!');
                console.log('   Translation:', translateResponse.data.data.translations[0].translatedText);
                console.log('   Full response:', JSON.stringify(translateResponse.data, null, 2));
                return true;
            }
        }
        
        console.error('❌ Google Translation API returned unexpected response format.');
        return false;
    } catch (error) {
        logApiError(error, 'Google Translation API');
        return false;
    }
}

// Test Azure OpenAI API
async function testAzureOpenAIAPI() {
    console.log('\nTesting Azure OpenAI API...');
    
    if (!AZURE_AI_API_KEY) {
        console.error('❌ Azure OpenAI API key is missing. Please add it to your .env file.');
        return false;
    }
    
    try {
        console.log('   Attempting to call Azure OpenAI API...');
        console.log(`   Endpoint: ${AZURE_AI_ENDPOINT}`);
        console.log('   Model: gpt-4o-mini');
        
        // Ensure the base endpoint doesn't have a trailing slash
        const baseEndpoint = AZURE_AI_ENDPOINT.endsWith('/') 
            ? AZURE_AI_ENDPOINT.slice(0, -1) 
            : AZURE_AI_ENDPOINT;
        
        const url = `${baseEndpoint}/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-12-01-preview`;
        console.log(`   Full URL: ${url}`);
        
        const requestBody = {
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant. Respond with a single word: "Success".'
                },
                { 
                    role: 'user', 
                    content: 'Test the API connection.' 
                }
            ],
            max_tokens: 10,
            temperature: 0.7,
        };
        
        console.log('   Request body:', JSON.stringify(requestBody, null, 2));
        
        const response = await axios.post(
            url,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': AZURE_AI_API_KEY,
                }
            }
        );
        
        console.log('   Response status:', response.status);
        console.log('   Response headers:', JSON.stringify(response.headers, null, 2));
        
        if (response.data && response.data.choices && response.data.choices[0].message) {
            console.log('✅ Azure OpenAI API is working!');
            console.log('   Response:', response.data.choices[0].message.content.trim());
            console.log('   Full response:', JSON.stringify(response.data, null, 2));
            return true;
        }
        
        console.error('❌ Azure OpenAI API returned unexpected response format:');
        console.error(JSON.stringify(response.data, null, 2));
        return false;
    } catch (error) {
        logApiError(error, 'Azure OpenAI API');
        return false;
    }
}

// Run tests
async function runTests() {
    console.log('Starting API tests...\n');
    
    let googleResult, azureResult;
    
    try {
        googleResult = await testGoogleTranslationAPI();
    } catch (error) {
        console.error('Unexpected error during Google API test:', error);
        googleResult = false;
    }
    
    try {
        azureResult = await testAzureOpenAIAPI();
    } catch (error) {
        console.error('Unexpected error during Azure API test:', error);
        azureResult = false;
    }
    
    console.log('\n=== Test Results Summary ===');
    console.log('Google Translation API:', googleResult ? '✅ Working' : '❌ Failed');
    console.log('Azure OpenAI API:', azureResult ? '✅ Working' : '❌ Failed');
    
    if (!googleResult || !azureResult) {
        console.log('\n🔧 Troubleshooting Tips:');
        console.log('1. Check that your .env file exists and contains the correct API keys');
        console.log('2. Verify that your API keys are active and have not expired');
        console.log('3. Ensure you have sufficient quota/credits on your API accounts');
        console.log('4. Check if the API endpoints are correct for your region');
        console.log('5. For Azure OpenAI, verify that the model "gpt-4o-mini" is deployed in your resource');
        console.log('6. Check if your IP address is allowed in the API service\'s network settings');
    }
}

runTests();





