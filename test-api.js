const fetch = require('node-fetch');

async function testAPI() {
  try {
    const response = await fetch('http://127.0.0.1:8787', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'test',
        sql: 'SELECT 1 as test'
      })
    });

    const data = await response.json();
    console.log('Response:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAPI();